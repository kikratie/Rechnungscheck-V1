#!/usr/bin/env node
// =============================================================
// Migration Safety Check
// =============================================================
// Scans all Prisma migration SQL files for destructive operations
// that could delete or corrupt user data.
//
// Runs in CI/CD pipeline BEFORE Docker build.
// If destructive SQL is found, the pipeline FAILS.
//
// To explicitly allow a destructive migration (rare!), add a file
// called "DESTRUCTIVE_ACKNOWLEDGED" in the migration directory.
// =============================================================

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

// Patterns that destroy or modify existing data
const DESTRUCTIVE_PATTERNS = [
  {
    pattern: /\bDROP\s+TABLE\b/i,
    severity: 'CRITICAL',
    description: 'Deletes an entire table and all its data',
  },
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\s+COLUMN\b/i,
    severity: 'CRITICAL',
    description: 'Removes a column and all data in it',
  },
  {
    pattern: /\bTRUNCATE\b/i,
    severity: 'CRITICAL',
    description: 'Deletes all rows from a table',
  },
  {
    pattern: /\bDELETE\s+FROM\b/i,
    severity: 'WARNING',
    description: 'Deletes rows from a table (check WHERE clause)',
  },
  {
    pattern: /\bDROP\s+INDEX\b/i,
    severity: 'INFO',
    description: 'Removes an index (data safe, performance may change)',
  },
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+TYPE\b/i,
    severity: 'WARNING',
    description: 'Changes column data type (may cause data loss if incompatible)',
  },
  {
    pattern: /\bALTER\s+TABLE\s+\S+\s+RENAME\b/i,
    severity: 'WARNING',
    description: 'Renames a table or column (code must be updated)',
  },
  {
    pattern: /\bDROP\s+TYPE\b/i,
    severity: 'WARNING',
    description: 'Removes an enum type',
  },
];

function checkMigration(migrationDir, migrationName) {
  const sqlFile = join(migrationDir, 'migration.sql');
  if (!existsSync(sqlFile)) return [];

  const sql = readFileSync(sqlFile, 'utf-8');
  const issues = [];

  for (const { pattern, severity, description } of DESTRUCTIVE_PATTERNS) {
    const matches = sql.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      for (const match of matches) {
        // Find line number
        const lines = sql.split('\n');
        const lineNum = lines.findIndex(l =>
          l.toLowerCase().includes(match.toLowerCase())
        ) + 1;

        issues.push({
          migration: migrationName,
          severity,
          description,
          match: match.trim(),
          line: lineNum,
        });
      }
    }
  }

  return issues;
}

function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found — skipping check.');
    process.exit(0);
  }

  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_journal')
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Checking ${migrations.length} migrations for destructive operations...\n`);

  let allIssues = [];
  let criticalCount = 0;

  for (const migration of migrations) {
    const migrationPath = join(MIGRATIONS_DIR, migration.name);
    const issues = checkMigration(migrationPath, migration.name);

    if (issues.length > 0) {
      // Check if explicitly acknowledged
      const acknowledged = existsSync(join(migrationPath, 'DESTRUCTIVE_ACKNOWLEDGED'));

      for (const issue of issues) {
        if (acknowledged) {
          issue.acknowledged = true;
        } else if (issue.severity === 'CRITICAL') {
          criticalCount++;
        }
        allIssues.push(issue);
      }
    }
  }

  if (allIssues.length === 0) {
    console.log('All migrations are safe. No destructive operations found.\n');
    process.exit(0);
  }

  // Print findings
  console.log('=== Migration Safety Report ===\n');

  for (const issue of allIssues) {
    const icon = issue.severity === 'CRITICAL' ? 'CRITICAL'
      : issue.severity === 'WARNING' ? 'WARNING'
      : 'INFO';
    const ack = issue.acknowledged ? ' [ACKNOWLEDGED]' : '';

    console.log(`  [${icon}]${ack} ${issue.migration}`);
    console.log(`    Line ${issue.line}: ${issue.match}`);
    console.log(`    ${issue.description}\n`);
  }

  if (criticalCount > 0) {
    console.log('============================================================');
    console.log(`  BLOCKED: ${criticalCount} unacknowledged CRITICAL issue(s)`);
    console.log('');
    console.log('  These migrations would DELETE user data.');
    console.log('  If this is intentional, add a file called');
    console.log('  "DESTRUCTIVE_ACKNOWLEDGED" in the migration directory.');
    console.log('============================================================');
    process.exit(1);
  }

  console.log('All critical issues are acknowledged. Proceeding.\n');
  process.exit(0);
}

main();
