import http from 'http';

function httpReq(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request({ hostname: 'localhost', port: 3001, path, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const login = await httpReq('POST', '/api/v1/auth/login', JSON.stringify({ email: 'admin@demo.at', password: 'Admin123!' }));
  const token = login.body.data.tokens.accessToken;
  console.log('Logged in OK\n');

  // === Test 1: Reject Matching (CONFIRMED) ===
  console.log('=== TEST 1: Reject CONFIRMED Matching ===');
  const recon1 = await httpReq('GET', '/api/v1/matchings/monthly', null, token);
  const d1 = recon1.body.data;
  console.log(`BEFORE: Matched: ${d1.matched.length} | Unmatched TX: ${d1.unmatchedTransactions.length} | Open INV: ${d1.unmatchedInvoices.length}`);

  const target = d1.matched[0];
  if (!target) {
    console.log('No matchings to test!');
    return;
  }
  console.log(`Rejecting: ${target.matchingId} (${target.invoice.vendorName || '?'} <-> ${target.transaction.counterpartName || '?'})`);

  const rejectRes = await httpReq('POST', `/api/v1/matchings/${target.matchingId}/reject`, null, token);
  console.log(`API: ${rejectRes.status}`, rejectRes.body.success ? `OK (returned status: ${rejectRes.body.data.status})` : `FAIL: ${JSON.stringify(rejectRes.body.error)}`);

  // Verify reconciliation updated
  const recon2 = await httpReq('GET', '/api/v1/matchings/monthly', null, token);
  const d2 = recon2.body.data;
  console.log(`AFTER:  Matched: ${d2.matched.length} | Unmatched TX: ${d2.unmatchedTransactions.length} | Open INV: ${d2.unmatchedInvoices.length}`);

  const matchedDiff = d2.matched.length - d1.matched.length;
  const unmatchedDiff = d2.unmatchedTransactions.length - d1.unmatchedTransactions.length;
  console.log(`Delta: Matched ${matchedDiff}, Unmatched TX ${unmatchedDiff > 0 ? '+' : ''}${unmatchedDiff}`);
  console.log(matchedDiff === -1 && unmatchedDiff === 1 ? 'PASS: Matching removed, TX moved to unmatched' : 'FAIL: Unexpected counts!');

  // Check the matching record is deleted (not just status changed)
  const checkMatching = await httpReq('GET', `/api/v1/matchings?limit=100`, null, token);
  const stillExists = checkMatching.body.data.find(m => m.id === target.matchingId);
  console.log(stillExists ? 'FAIL: Matching record still exists in DB!' : 'PASS: Matching record deleted');

  // === Test 2: Run matching again — should re-create the suggestion ===
  console.log('\n=== TEST 2: Re-run Matching After Reject ===');
  const runRes = await httpReq('POST', '/api/v1/matchings/run', null, token);
  console.log(`Matching run: created=${runRes.body.data.created}, deleted=${runRes.body.data.deleted}`);

  const recon3 = await httpReq('GET', '/api/v1/matchings/monthly', null, token);
  const d3 = recon3.body.data;
  console.log(`AFTER RUN: Matched: ${d3.matched.length} | Unmatched TX: ${d3.unmatchedTransactions.length} | Open INV: ${d3.unmatchedInvoices.length}`);
  console.log(d3.matched.length >= d2.matched.length ? 'PASS: New suggestions created' : 'INFO: No new suggestions (expected if no match candidates)');

  // Find the re-suggested matching for the same TX
  const reSuggested = d3.matched.find(m => m.transaction.id === target.transaction.id);
  if (reSuggested) {
    console.log(`Re-suggested: ${reSuggested.matchingId} (status: ${reSuggested.matchStatus})`);
    // Confirm it to restore state
    await httpReq('POST', `/api/v1/matchings/${reSuggested.matchingId}/confirm`, null, token);
    console.log('Re-confirmed to restore state');
  } else {
    console.log('INFO: TX not re-matched (different candidates or no match)');
  }

  // === Test 3: Reject Locked Invoice ===
  console.log('\n=== TEST 3: Reject Locked Invoice (should fail) ===');
  const invoicesRes = await httpReq('GET', '/api/v1/invoices?limit=20', null, token);
  const lockedInvoice = invoicesRes.body.data.find(i => i.isLocked);
  if (lockedInvoice) {
    const rejectRes = await httpReq('POST', `/api/v1/invoices/${lockedInvoice.id}/reject`,
      JSON.stringify({ reason: 'Test' }), token);
    console.log(`Result: ${rejectRes.status}`, rejectRes.body.success ? 'FAIL: Should have been blocked!' : `PASS: Blocked — ${rejectRes.body.error.message}`);
  } else {
    console.log('SKIP: No locked invoice found');
  }

  // === Test 4: Reject Unlocked Invoice ===
  console.log('\n=== TEST 4: Reject Unlocked Invoice (should succeed) ===');
  const unlockedInvoice = invoicesRes.body.data.find(i => !i.isLocked && (i.processingStatus === 'PROCESSED' || i.processingStatus === 'REVIEW_REQUIRED'));
  if (unlockedInvoice) {
    console.log(`Rejecting: ${unlockedInvoice.id} (${unlockedInvoice.vendorName || '?'}) — status: ${unlockedInvoice.processingStatus}`);
    const rejectRes = await httpReq('POST', `/api/v1/invoices/${unlockedInvoice.id}/reject`,
      JSON.stringify({ reason: 'Test-Ablehnung' }), token);
    console.log(`Result: ${rejectRes.status}`, rejectRes.body.success ? `PASS: Status now ${rejectRes.body.data.processingStatus}` : `FAIL: ${JSON.stringify(rejectRes.body.error)}`);
  } else {
    console.log('SKIP: No unlocked PROCESSED/REVIEW_REQUIRED invoice found');
  }

  console.log('\n=== ALL TESTS DONE ===');
}

main().catch(console.error);
