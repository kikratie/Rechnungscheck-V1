import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogsApi } from '../api/auditLogs';
import { ScrollText, Loader2, ChevronLeft, ChevronRight, FileText, CheckCircle, Upload, XCircle, User, Shield } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

export function AuditLogPage() {
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => listAuditLogsApi({ page, limit: 25 }),
  });

  const logs = (data?.data ?? []) as Array<Record<string, unknown>>;
  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit-Log</h1>
        <p className="text-gray-500 mt-1">Revisionssichere Protokollierung aller Aktionen</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      ) : logs.length === 0 ? (
        <div className="card p-12 text-center">
          <ScrollText className="mx-auto text-gray-300 mb-4" size={48} />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Noch keine Einträge</h3>
          <p className="text-gray-500">Alle Aktionen werden automatisch protokolliert.</p>
        </div>
      ) : (
        <>
          {isMobile ? (
            /* Mobile: Card List */
            <div className="space-y-2">
              {logs.map((log) => {
                const user = log.user as Record<string, string> | null;
                const metadata = log.metadata as Record<string, unknown> | null;
                return (
                  <div key={log.id as string} className="card p-3">
                    <div className="flex items-center justify-between mb-1">
                      <ActionBadge action={log.action as string} />
                      <span className="text-xs text-gray-400">{formatDateTime(log.createdAt as string)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {user ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center">
                            <User size={10} className="text-primary-600" />
                          </div>
                          <span className="text-gray-900">{user.firstName} {user.lastName}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                            <Shield size={10} className="text-gray-500" />
                          </div>
                          <span className="text-gray-500">System</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="text-gray-400">{log.entityType as string}</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="font-mono">{(log.entityId as string).substring(0, 8)}</span>
                    </div>
                    {metadata && Object.keys(metadata).length > 0 && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Desktop: Table */
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Zeitpunkt</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Benutzer</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Aktion</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Entität</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logs.map((log) => {
                    const user = log.user as Record<string, string> | null;
                    const metadata = log.metadata as Record<string, unknown> | null;

                    return (
                      <tr key={log.id as string} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDateTime(log.createdAt as string)}
                        </td>
                        <td className="px-4 py-3">
                          {user ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                                <User size={12} className="text-primary-600" />
                              </div>
                              <span className="text-gray-900">{user.firstName} {user.lastName}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                                <Shield size={12} className="text-gray-500" />
                              </div>
                              <span className="text-gray-500">System</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <ActionBadge action={log.action as string} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          <span className="text-gray-400">{log.entityType as string}</span>
                          <span className="text-gray-300 mx-1">/</span>
                          <span className="font-mono text-xs">{(log.entityId as string).substring(0, 8)}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[250px] truncate">
                          {metadata ? Object.entries(metadata).map(([k, v]) => `${k}: ${v}`).join(', ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-gray-500">
                Seite {pagination.page} von {pagination.totalPages} ({pagination.total} Einträge)
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary px-3 py-1"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="btn-secondary px-3 py-1"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const config: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
    UPLOAD: { icon: <Upload size={12} />, bg: 'bg-blue-100', text: 'text-blue-700', label: 'Upload' },
    AI_PROCESSED: { icon: <FileText size={12} />, bg: 'bg-purple-100', text: 'text-purple-700', label: 'KI-Verarbeitung' },
    APPROVE: { icon: <CheckCircle size={12} />, bg: 'bg-green-100', text: 'text-green-700', label: 'Genehmigt' },
    CONFIRM: { icon: <CheckCircle size={12} />, bg: 'bg-green-100', text: 'text-green-700', label: 'Bestätigt' },
    LOGIN: { icon: <User size={12} />, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Login' },
    REGISTER: { icon: <User size={12} />, bg: 'bg-gray-100', text: 'text-gray-700', label: 'Registrierung' },
    UID_VALIDATION_FAILED: { icon: <XCircle size={12} />, bg: 'bg-red-100', text: 'text-red-700', label: 'UID ungültig' },
  };
  const c = config[action] || { icon: <FileText size={12} />, bg: 'bg-gray-100', text: 'text-gray-700', label: action };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
