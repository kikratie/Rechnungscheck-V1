import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBankStatementsApi, getBankStatementApi } from '../api/bankStatements';
import { Building2, Upload, Loader2, ChevronDown, ChevronUp, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export function BankStatementsPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-statements'],
    queryFn: () => listBankStatementsApi(),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['bank-statement', expandedId],
    queryFn: () => getBankStatementApi(expandedId!),
    enabled: !!expandedId,
  });

  const statements = (data?.data ?? []) as Array<Record<string, unknown>>;
  const detail = detailData?.data as Record<string, unknown> | undefined;
  const transactions = (detail?.transactions ?? []) as Array<Record<string, unknown>>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kontoauszüge</h1>
          <p className="text-gray-500 mt-1">Bank-Kontoauszüge und Transaktionen</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Upload size={18} />
          Importieren
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : statements.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Keine Kontoauszüge vorhanden</h3>
          <p className="text-gray-500">Importiere einen CSV-Kontoauszug für den automatischen Bankabgleich.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {statements.map((stmt) => {
            const isExpanded = expandedId === stmt.id;
            return (
              <div key={stmt.id as string} className="card overflow-hidden">
                {/* Statement header */}
                <button
                  className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
                  onClick={() => setExpandedId(isExpanded ? null : (stmt.id as string))}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Building2 className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{(stmt.bankName as string) || 'Bank'}</h3>
                      <p className="text-sm text-gray-500">{stmt.iban as string}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-gray-500">Zeitraum</p>
                      <p className="font-medium">
                        {stmt.periodFrom ? formatDate(stmt.periodFrom as string) : '?'} — {stmt.periodTo ? formatDate(stmt.periodTo as string) : '?'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500">Transaktionen</p>
                      <p className="font-medium">{stmt.transactionCount as number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-500">Saldo</p>
                      <p className="font-medium">{stmt.closingBalance ? formatCurrency(String(stmt.closingBalance)) : '—'}</p>
                    </div>
                    {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                  </div>
                </button>

                {/* Transactions */}
                {isExpanded && (
                  <div className="border-t">
                    {detailLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin text-primary-600" size={24} />
                      </div>
                    ) : transactions.length > 0 ? (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500">Datum</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500">Empfänger / Absender</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500">Referenz</th>
                            <th className="text-left px-5 py-2.5 font-medium text-gray-500">Buchungstext</th>
                            <th className="text-right px-5 py-2.5 font-medium text-gray-500">Betrag</th>
                            <th className="text-center px-5 py-2.5 font-medium text-gray-500">Match</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {transactions.map((tx) => {
                            const amount = parseFloat(tx.amount as string);
                            const isIncome = amount > 0;
                            return (
                              <tr key={tx.id as string} className="hover:bg-gray-50">
                                <td className="px-5 py-2.5 text-gray-600">{formatDate(tx.transactionDate as string)}</td>
                                <td className="px-5 py-2.5">
                                  <div className="flex items-center gap-2">
                                    {isIncome ? (
                                      <ArrowDownLeft size={14} className="text-green-500 shrink-0" />
                                    ) : (
                                      <ArrowUpRight size={14} className="text-red-500 shrink-0" />
                                    )}
                                    <span className="font-medium text-gray-900 truncate max-w-[200px]">{(tx.counterpartName as string) || '—'}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-2.5 text-gray-500 truncate max-w-[200px]">{(tx.reference as string) || '—'}</td>
                                <td className="px-5 py-2.5 text-gray-500">{(tx.bookingText as string) || '—'}</td>
                                <td className={`px-5 py-2.5 text-right font-medium ${isIncome ? 'text-green-600' : 'text-gray-900'}`}>
                                  {formatCurrency(tx.amount as string)}
                                </td>
                                <td className="px-5 py-2.5 text-center">
                                  {tx.isMatched ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ja</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Nein</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-center text-gray-400 py-6 text-sm">Keine Transaktionen</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
}
