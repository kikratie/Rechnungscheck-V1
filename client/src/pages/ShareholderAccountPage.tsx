import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Scale, CheckCircle, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import {
  listShareholderTransactionsApi,
  getShareholderBalanceApi,
  markShareholderTransactionPaidApi,
} from '../api/shareholderTransactions';
import type { ShareholderTransactionItem } from '@buchungsai/shared';

export function ShareholderAccountPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'PAID' | ''>('');

  const { data: balance } = useQuery({
    queryKey: ['shareholder-balance'],
    queryFn: () => getShareholderBalanceApi(),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['shareholder-transactions', statusFilter],
    queryFn: () => listShareholderTransactionsApi({
      status: statusFilter || undefined,
    }),
    staleTime: 30_000,
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: string) => markShareholderTransactionPaidApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shareholder-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['shareholder-balance'] });
    },
  });

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    return num.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={24} />
            Verrechnungskonto Gesellschafter
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Forderungen und Verbindlichkeiten zwischen Gesellschafter und Unternehmen
          </p>
        </div>
      </div>

      {/* Balance Summary Cards */}
      {balance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`card p-4 ${parseFloat(balance.totalReceivable) > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            <p className="text-sm text-gray-600 mb-1">Offene Forderungen</p>
            <p className={`text-xl font-bold ${parseFloat(balance.totalReceivable) > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {formatCurrency(balance.totalReceivable)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Gesellschafter schuldet dem Unternehmen</p>
          </div>
          <div className="card p-4 border-blue-200 bg-blue-50">
            <p className="text-sm text-gray-600 mb-1">Offene Verbindlichkeiten</p>
            <p className="text-xl font-bold text-blue-700">
              {formatCurrency(balance.totalPayable)}
            </p>
            <p className="text-xs text-gray-500 mt-1">Unternehmen schuldet dem Gesellschafter</p>
          </div>
          <div className={`card p-4 ${parseFloat(balance.netBalance) > 0 ? 'border-red-200 bg-red-50' : parseFloat(balance.netBalance) < 0 ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}>
            <p className="text-sm text-gray-600 mb-1">Netto-Saldo</p>
            <p className={`text-xl font-bold ${parseFloat(balance.netBalance) > 0 ? 'text-red-700' : parseFloat(balance.netBalance) < 0 ? 'text-blue-700' : 'text-green-700'}`}>
              {formatCurrency(balance.netBalance)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {parseFloat(balance.netBalance) > 0 ? 'Gesellschafter hat Schulden' : parseFloat(balance.netBalance) < 0 ? 'Unternehmen hat Schulden' : 'Ausgeglichen'}
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'OPEN' | 'PAID' | '')}
            className="input-field text-sm w-40"
          >
            <option value="">Alle</option>
            <option value="OPEN">Offen</option>
            <option value="PAID">Bezahlt</option>
          </select>
          {balance && (
            <span className="text-sm text-gray-500 ml-auto">
              {balance.openCount} offene Transaktion{balance.openCount !== 1 ? 'en' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-gray-400" size={24} />
          </div>
        ) : !data?.items.length ? (
          <div className="text-center py-12 text-gray-500">
            <Scale size={32} className="mx-auto mb-2 text-gray-300" />
            <p>Keine Gesellschafter-Transaktionen vorhanden</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Datum</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Typ</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Beleg</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Beschreibung</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">Gesellschafter</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Betrag</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Status</th>
                <th className="text-center py-3 px-4 font-medium text-gray-600">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((tx: ShareholderTransactionItem) => (
                <tr key={tx.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-gray-700">{formatDate(tx.createdAt)}</td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.transactionType === 'RECEIVABLE'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {tx.transactionType === 'RECEIVABLE'
                        ? <><ArrowDownLeft size={12} /> Forderung</>
                        : <><ArrowUpRight size={12} /> Verbindlichkeit</>}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {tx.invoiceBelegNr
                      ? <span className="text-primary-600 font-mono text-xs">BEL-{String(tx.invoiceBelegNr).padStart(3, '0')}</span>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate">{tx.description || '—'}</td>
                  <td className="py-3 px-4 text-gray-700">{tx.userName}</td>
                  <td className="py-3 px-4 text-right font-mono font-medium">
                    {formatCurrency(tx.amount)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === 'OPEN'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {tx.status === 'OPEN' ? 'Offen' : 'Bezahlt'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {tx.status === 'OPEN' && (
                      <button
                        onClick={() => markPaidMutation.mutate(tx.id)}
                        disabled={markPaidMutation.isPending}
                        className="btn-secondary text-xs px-2 py-1 flex items-center gap-1 mx-auto"
                      >
                        {markPaidMutation.isPending ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        Bezahlt
                      </button>
                    )}
                    {tx.status === 'PAID' && tx.paidAt && (
                      <span className="text-xs text-gray-400">{formatDate(tx.paidAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
