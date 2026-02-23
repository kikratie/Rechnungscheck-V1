import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listCustomersApi, getCustomerApi } from '../api/customers';
import type { CustomerFilters } from '../api/customers';
import {
  Building2, Search, X, ChevronLeft, ChevronRight, Loader2,
  Mail, Phone, Globe, FileText, MapPin,
  CreditCard, ShieldCheck, ShieldAlert, ShieldQuestion,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function CustomersPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<CustomerFilters>({ page: 1, limit: 50 });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', filters],
    queryFn: () => listCustomersApi(filters),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['customer', selectedId],
    queryFn: () => getCustomerApi(selectedId!),
    enabled: !!selectedId,
  });

  const customers = data?.data ?? [];
  const pagination = data?.pagination;
  const detail = detailData?.data;

  const handleSearch = () => {
    setFilters((prev) => ({ ...prev, page: 1, search: search || undefined }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Customer List */}
      <div className={`flex flex-col ${selectedId ? 'w-1/2' : 'w-full'} transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Building2 className="text-primary-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold">Kunden</h1>
              <p className="text-sm text-gray-500">
                {pagination?.total ?? 0} Kunden
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Suche: Name, UID, E-Mail..."
              className="input-field pl-10 pr-10"
            />
            {search && (
              <button
                onClick={() => { setSearch(''); setFilters((p) => ({ ...p, page: 1, search: undefined })); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button onClick={handleSearch} className="btn-primary">
            Suchen
          </button>
        </div>

        {/* Table */}
        <div className="card flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin text-primary-600" size={32} />
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Building2 size={48} className="mb-3 opacity-50" />
              <p>Keine Kunden gefunden</p>
              <p className="text-xs mt-1">Kunden werden automatisch aus Ausgangsrechnungen erstellt</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">UID</th>
                  <th className="px-4 py-3 text-center">Rechnungen</th>
                  <th className="px-4 py-3">Kontakt</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedId === customer.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{customer.name}</div>
                      {customer.address && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {(customer.address as Record<string, string>).city || ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {customer.uid ? (
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {customer.uid}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">---</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        <FileText size={12} />
                        {customer.invoiceCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-gray-400">
                        {customer.email && <span title={customer.email}><Mail size={14} className="text-gray-600" /></span>}
                        {customer.phone && <span title={customer.phone}><Phone size={14} className="text-gray-600" /></span>}
                        {customer.website && <span title={customer.website}><Globe size={14} className="text-gray-600" /></span>}
                        {!customer.email && !customer.phone && !customer.website && <span className="text-xs">---</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-500">
              Seite {pagination.page} von {pagination.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) - 1 }))}
                disabled={pagination.page <= 1}
                className="btn-secondary flex items-center gap-1 disabled:opacity-50"
              >
                <ChevronLeft size={16} /> Zuruck
              </button>
              <button
                onClick={() => setFilters((p) => ({ ...p, page: (p.page ?? 1) + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="btn-secondary flex items-center gap-1 disabled:opacity-50"
              >
                Weiter <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedId && (
        <div className="w-1/2 card overflow-auto">
          {detailLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="animate-spin text-primary-600" size={32} />
            </div>
          ) : detail ? (
            <CustomerDetailPanel
              customer={detail}
              onClose={() => setSelectedId(null)}
              onNavigateToInvoice={(id) => navigate(`/invoices?selected=${id}`)}
            />
          ) : (
            <div className="text-center text-gray-400 py-12">Kunde nicht gefunden</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-Components
// ============================================================

function ViesBadge({ viesName, viesCheckedAt, uid }: { viesName: string | null; viesCheckedAt: string | null; uid: string | null }) {
  if (!uid) {
    return <span className="text-gray-300 text-xs">---</span>;
  }
  if (!viesCheckedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
        <ShieldQuestion size={14} /> Nicht gepruft
      </span>
    );
  }
  if (viesName) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs" title={`VIES: ${viesName}`}>
        <ShieldCheck size={14} /> Gultig
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-500 text-xs">
      <ShieldAlert size={14} /> Ungultig
    </span>
  );
}

function CustomerDetailPanel({
  customer,
  onClose,
  onNavigateToInvoice,
}: {
  customer: NonNullable<Awaited<ReturnType<typeof getCustomerApi>>['data']>;
  onClose: () => void;
  onNavigateToInvoice: (id: string) => void;
}) {
  const _queryClient = useQueryClient();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">{customer.name}</h2>
          {customer.uid && (
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
              {customer.uid}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X size={20} />
        </button>
      </div>

      {/* VIES Status */}
      {customer.uid && (
        <div className={`p-3 rounded-lg mb-4 ${
          customer.viesName ? 'bg-green-50 border border-green-200' :
          customer.viesCheckedAt ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {customer.viesName ? (
              <><ShieldCheck size={16} className="text-green-600" /> UID bei VIES gultig</>
            ) : customer.viesCheckedAt ? (
              <><ShieldAlert size={16} className="text-red-500" /> UID bei VIES ungultig</>
            ) : (
              <><ShieldQuestion size={16} className="text-gray-400" /> VIES noch nicht gepruft</>
            )}
          </div>
          {customer.viesName && (
            <p className="text-xs text-gray-600 mt-1">Registriert als: {customer.viesName}</p>
          )}
          {customer.viesAddress && (
            <p className="text-xs text-gray-500">{customer.viesAddress}</p>
          )}
          {customer.viesCheckedAt && (
            <p className="text-xs text-gray-400 mt-1">
              Zuletzt gepruft: {new Date(customer.viesCheckedAt).toLocaleDateString('de-AT')}
            </p>
          )}
        </div>
      )}

      {/* Contact Info */}
      <div className="space-y-2 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Kontaktdaten</h3>
        <div className="grid grid-cols-1 gap-2 text-sm">
          {customer.address && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <span>
                {(customer.address as Record<string, string>).street && <>{(customer.address as Record<string, string>).street}<br /></>}
                {(customer.address as Record<string, string>).zip} {(customer.address as Record<string, string>).city}
                {(customer.address as Record<string, string>).country && <>, {(customer.address as Record<string, string>).country}</>}
              </span>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-gray-400 shrink-0" />
              <a href={`mailto:${customer.email}`} className="text-primary-600 hover:underline">{customer.email}</a>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <span>{customer.phone}</span>
            </div>
          )}
          {customer.website && (
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-gray-400 shrink-0" />
              <a href={customer.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{customer.website}</a>
            </div>
          )}
          {customer.iban && (
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-gray-400 shrink-0" />
              <span className="font-mono text-xs">{customer.iban}</span>
            </div>
          )}
          {!customer.address && !customer.email && !customer.phone && !customer.website && !customer.iban && (
            <p className="text-gray-400 text-xs">Keine Kontaktdaten vorhanden</p>
          )}
        </div>
      </div>

      {/* Notes */}
      {customer.notes && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Notizen</h3>
          <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg">{customer.notes}</p>
        </div>
      )}

      {/* Invoices */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Ausgangsrechnungen ({customer.invoices.length})
        </h3>
        {customer.invoices.length === 0 ? (
          <p className="text-gray-400 text-xs">Keine Rechnungen verknupft</p>
        ) : (
          <div className="space-y-2">
            {customer.invoices.map((inv) => (
              <div
                key={inv.id}
                onClick={() => onNavigateToInvoice(inv.id)}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    BEL-{String(inv.belegNr).padStart(3, '0')}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {inv.invoiceNumber || inv.originalFileName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('de-AT') : '---'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {inv.grossAmount ? `${parseFloat(inv.grossAmount).toLocaleString('de-AT', { style: 'currency', currency: inv.currency })}` : '---'}
                  </div>
                  <ProcessingBadge status={inv.processingStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="mt-6 pt-4 border-t text-xs text-gray-400">
        <p>Erstellt: {new Date(customer.createdAt).toLocaleString('de-AT')}</p>
        <p>Aktualisiert: {new Date(customer.updatedAt).toLocaleString('de-AT')}</p>
      </div>
    </div>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    UPLOADED: { label: 'Hochgeladen', bg: 'bg-gray-100', text: 'text-gray-600' },
    PROCESSING: { label: 'Verarbeitung...', bg: 'bg-blue-100', text: 'text-blue-700' },
    PROCESSED: { label: 'Verarbeitet', bg: 'bg-green-100', text: 'text-green-700' },
    REVIEW_REQUIRED: { label: 'Review notig', bg: 'bg-yellow-100', text: 'text-yellow-700' },
    ARCHIVED: { label: 'Archiviert', bg: 'bg-green-100', text: 'text-green-700' },
    RECONCILED: { label: 'Abgeglichen', bg: 'bg-teal-100', text: 'text-teal-700' },
    ERROR: { label: 'Fehler', bg: 'bg-red-100', text: 'text-red-700' },
    REPLACED: { label: 'Ersetzt', bg: 'bg-orange-100', text: 'text-orange-700' },
  };
  const c = config[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}
