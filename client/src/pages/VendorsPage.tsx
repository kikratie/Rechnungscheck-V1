import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listVendorsApi, getVendorApi, updateVendorApi } from '../api/vendors';
import type { VendorFilters } from '../api/vendors';
import type { VendorTrustLevel } from '@buchungsai/shared';
import { VENDOR_TRUST_LEVELS } from '@buchungsai/shared';
import {
  Users, Search, X, ChevronLeft, ChevronRight, Loader2,
  Mail, Phone, Globe, FileText, MapPin, ShieldCheck, ShieldAlert, ShieldQuestion,
  CreditCard, Hash,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function VendorsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VendorFilters>({ page: 1, limit: 50 });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['vendors', filters],
    queryFn: () => listVendorsApi(filters),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['vendor', selectedId],
    queryFn: () => getVendorApi(selectedId!),
    enabled: !!selectedId,
  });

  const vendors = data?.data ?? [];
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
      {/* Vendor List */}
      <div className={`flex flex-col ${selectedId ? 'w-1/2' : 'w-full'} transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Users className="text-primary-600" size={28} />
            <div>
              <h1 className="text-2xl font-bold">Lieferanten</h1>
              <p className="text-sm text-gray-500">
                {pagination?.total ?? 0} Lieferanten
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
          ) : vendors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <Users size={48} className="mb-3 opacity-50" />
              <p>Keine Lieferanten gefunden</p>
              <p className="text-xs mt-1">Lieferanten werden automatisch aus verarbeiteten Rechnungen erstellt</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">UID</th>
                  <th className="px-4 py-3 text-center">Vertrauen</th>
                  <th className="px-4 py-3 text-center">Rechnungen</th>
                  <th className="px-4 py-3">Kontakt</th>
                  <th className="px-4 py-3">VIES</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    onClick={() => setSelectedId(vendor.id)}
                    className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedId === vendor.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{vendor.name}</div>
                      {vendor.address && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {(vendor.address as Record<string, string>).city || ''}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {vendor.uid ? (
                        <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                          {vendor.uid}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TrustBadge level={vendor.trustLevel} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        <FileText size={12} />
                        {vendor.invoiceCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 text-gray-400">
                        {vendor.email && <span title={vendor.email}><Mail size={14} className="text-gray-600" /></span>}
                        {vendor.phone && <span title={vendor.phone}><Phone size={14} className="text-gray-600" /></span>}
                        {vendor.website && <span title={vendor.website}><Globe size={14} className="text-gray-600" /></span>}
                        {!vendor.email && !vendor.phone && !vendor.website && <span className="text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ViesBadge viesName={vendor.viesName} viesCheckedAt={vendor.viesCheckedAt} uid={vendor.uid} />
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
                <ChevronLeft size={16} /> Zurück
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
            <VendorDetailPanel
              vendor={detail}
              onClose={() => setSelectedId(null)}
              onNavigateToInvoice={(id) => navigate(`/invoices?selected=${id}`)}
            />
          ) : (
            <div className="text-center text-gray-400 py-12">Lieferant nicht gefunden</div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-Components
// ============================================================

function TrustBadge({ level }: { level: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    NEW: { label: 'Neu', bg: 'bg-gray-100', text: 'text-gray-600' },
    VERIFIED: { label: 'Geprüft', bg: 'bg-blue-100', text: 'text-blue-700' },
    TRUSTED: { label: 'Vertraut', bg: 'bg-green-100', text: 'text-green-700' },
  };
  const c = config[level] || config.NEW;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function ViesBadge({ viesName, viesCheckedAt, uid }: { viesName: string | null; viesCheckedAt: string | null; uid: string | null }) {
  if (!uid) {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (!viesCheckedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
        <ShieldQuestion size={14} /> Nicht geprüft
      </span>
    );
  }
  if (viesName) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs" title={`VIES: ${viesName}`}>
        <ShieldCheck size={14} /> Gültig
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-red-500 text-xs">
      <ShieldAlert size={14} /> Ungültig
    </span>
  );
}

function VendorDetailPanel({
  vendor,
  onClose,
  onNavigateToInvoice,
}: {
  vendor: NonNullable<Awaited<ReturnType<typeof getVendorApi>>['data']>;
  onClose: () => void;
  onNavigateToInvoice: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const trustMutation = useMutation({
    mutationFn: (level: VendorTrustLevel) => updateVendorApi(vendor.id, { trustLevel: level }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
    },
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">{vendor.name}</h2>
          {vendor.uid && (
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
              {vendor.uid}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
          <X size={20} />
        </button>
      </div>

      {/* Trust Level Selector */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Vertrauenslevel</h3>
        <div className="flex items-center gap-2">
          <select
            value={vendor.trustLevel}
            onChange={(e) => trustMutation.mutate(e.target.value as VendorTrustLevel)}
            disabled={trustMutation.isPending}
            className="input-field !py-1.5 text-sm !w-auto"
          >
            {(Object.entries(VENDOR_TRUST_LEVELS) as [VendorTrustLevel, { label: string; description: string }][]).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>
          <TrustBadge level={vendor.trustLevel} />
          {trustMutation.isPending && <Loader2 size={14} className="animate-spin text-primary-600" />}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {VENDOR_TRUST_LEVELS[vendor.trustLevel as keyof typeof VENDOR_TRUST_LEVELS]?.description}
        </p>
      </div>

      {/* VIES Status */}
      {vendor.uid && (
        <div className={`p-3 rounded-lg mb-4 ${
          vendor.viesName ? 'bg-green-50 border border-green-200' :
          vendor.viesCheckedAt ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {vendor.viesName ? (
              <><ShieldCheck size={16} className="text-green-600" /> UID bei VIES gültig</>
            ) : vendor.viesCheckedAt ? (
              <><ShieldAlert size={16} className="text-red-500" /> UID bei VIES ungültig</>
            ) : (
              <><ShieldQuestion size={16} className="text-gray-400" /> VIES noch nicht geprüft</>
            )}
          </div>
          {vendor.viesName && (
            <p className="text-xs text-gray-600 mt-1">Registriert als: {vendor.viesName}</p>
          )}
          {vendor.viesAddress && (
            <p className="text-xs text-gray-500">{vendor.viesAddress}</p>
          )}
          {vendor.viesCheckedAt && (
            <p className="text-xs text-gray-400 mt-1">
              Zuletzt geprüft: {new Date(vendor.viesCheckedAt).toLocaleDateString('de-AT')}
            </p>
          )}
        </div>
      )}

      {/* Contact Info */}
      <div className="space-y-2 mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Kontaktdaten</h3>
        <div className="grid grid-cols-1 gap-2 text-sm">
          {vendor.address && (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <span>
                {(vendor.address as Record<string, string>).street && <>{(vendor.address as Record<string, string>).street}<br /></>}
                {(vendor.address as Record<string, string>).zip} {(vendor.address as Record<string, string>).city}
                {(vendor.address as Record<string, string>).country && <>, {(vendor.address as Record<string, string>).country}</>}
              </span>
            </div>
          )}
          {vendor.email && (
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-gray-400 shrink-0" />
              <a href={`mailto:${vendor.email}`} className="text-primary-600 hover:underline">{vendor.email}</a>
            </div>
          )}
          {vendor.phone && (
            <div className="flex items-center gap-2">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <span>{vendor.phone}</span>
            </div>
          )}
          {vendor.website && (
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-gray-400 shrink-0" />
              <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">{vendor.website}</a>
            </div>
          )}
          {vendor.iban && (
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-gray-400 shrink-0" />
              <span className="font-mono text-xs">{vendor.iban}</span>
            </div>
          )}
          {!vendor.address && !vendor.email && !vendor.phone && !vendor.website && !vendor.iban && (
            <p className="text-gray-400 text-xs">Keine Kontaktdaten vorhanden</p>
          )}
        </div>
      </div>

      {/* Notes */}
      {vendor.notes && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Notizen</h3>
          <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg">{vendor.notes}</p>
        </div>
      )}

      {/* Invoices */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Rechnungen ({vendor.invoices.length})
        </h3>
        {vendor.invoices.length === 0 ? (
          <p className="text-gray-400 text-xs">Keine Rechnungen verknüpft</p>
        ) : (
          <div className="space-y-2">
            {vendor.invoices.map((inv) => (
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
                      {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('de-AT') : '—'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {inv.grossAmount ? `${parseFloat(inv.grossAmount).toLocaleString('de-AT', { style: 'currency', currency: inv.currency })}` : '—'}
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
        <p>Erstellt: {new Date(vendor.createdAt).toLocaleString('de-AT')}</p>
        <p>Aktualisiert: {new Date(vendor.updatedAt).toLocaleString('de-AT')}</p>
      </div>
    </div>
  );
}

function ProcessingBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    UPLOADED: { label: 'Hochgeladen', bg: 'bg-gray-100', text: 'text-gray-600' },
    PROCESSING: { label: 'Verarbeitung...', bg: 'bg-blue-100', text: 'text-blue-700' },
    PROCESSED: { label: 'Verarbeitet', bg: 'bg-green-100', text: 'text-green-700' },
    REVIEW_REQUIRED: { label: 'Review nötig', bg: 'bg-yellow-100', text: 'text-yellow-700' },
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
