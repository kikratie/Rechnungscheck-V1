import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listVendorsApi, getVendorApi, updateVendorApi } from '../api/vendors';
import type { VendorFilters } from '../api/vendors';
import type { VendorTrustLevel } from '@buchungsai/shared';
import { VENDOR_TRUST_LEVELS } from '@buchungsai/shared';
import {
  Users, Search, X, ChevronLeft, ChevronRight, Loader2,
  Mail, Phone, Globe, FileText, MapPin, ShieldCheck, ShieldAlert, ShieldQuestion,
  CreditCard, Hash, Edit3, Save, XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SendEmailDialog } from '../components/SendEmailDialog';
import { useIsMobile } from '../hooks/useIsMobile';
import { FullScreenPanel } from '../components/mobile/FullScreenPanel';

export function VendorsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
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
    <div className={isMobile ? '' : 'flex gap-6 h-[calc(100vh-8rem)]'}>
      {/* Mobile: FullScreenPanel for detail */}
      {isMobile && (
        <FullScreenPanel
          isOpen={!!selectedId}
          onClose={() => setSelectedId(null)}
          title="Lieferant"
        >
          <div className="p-4">
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
        </FullScreenPanel>
      )}

      {/* Vendor List */}
      <div className={isMobile ? '' : `flex flex-col ${selectedId ? 'w-1/2' : 'w-full'} transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 lg:mb-6">
          <div className="flex items-center gap-3">
            {!isMobile && <Users className="text-primary-600" size={28} />}
            <div>
              <h1 className={isMobile ? 'text-lg font-bold' : 'text-2xl font-bold'}>Lieferanten</h1>
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

        {/* Table / Cards */}
        <div className={isMobile ? '' : 'card flex-1 overflow-auto'}>
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
          ) : isMobile ? (
            /* Mobile: Card List */
            <div className="space-y-3">
              {vendors.map((vendor) => (
                <div
                  key={vendor.id}
                  onClick={() => setSelectedId(vendor.id)}
                  className="mobile-card"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm shrink-0">
                        {vendor.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 truncate">{vendor.name}</div>
                        {vendor.uid && (
                          <span className="font-mono text-xs text-gray-500">{vendor.uid}</span>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          {vendor.address && (vendor.address as Record<string, string>).city && (
                            <span>{(vendor.address as Record<string, string>).city}</span>
                          )}
                          <span className="inline-flex items-center gap-0.5 text-blue-600">
                            <FileText size={10} /> {vendor.invoiceCount}
                          </span>
                          <ViesBadge viesName={vendor.viesName} viesCheckedAt={vendor.viesCheckedAt} uid={vendor.uid} />
                        </div>
                      </div>
                    </div>
                    <TrustBadge level={vendor.trustLevel} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Desktop: Table */
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

      {/* Desktop Detail Panel */}
      {!isMobile && selectedId && (
        <div className="w-1/2 card p-6 overflow-auto">
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

interface EditFields {
  name: string;
  uid: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  iban: string;
  bic: string;
  notes: string;
  trustLevel: string;
}

function vendorToEditFields(vendor: { name: string; uid: string | null; address: unknown; email: string | null; phone: string | null; website: string | null; iban: string | null; bic: string | null; notes: string | null; trustLevel: string }): EditFields {
  const addr = (vendor.address as Record<string, string>) || {};
  return {
    name: vendor.name || '',
    uid: vendor.uid || '',
    street: addr.street || '',
    zip: addr.zip || '',
    city: addr.city || '',
    country: addr.country || '',
    email: vendor.email || '',
    phone: vendor.phone || '',
    website: vendor.website || '',
    iban: vendor.iban || '',
    bic: vendor.bic || '',
    notes: vendor.notes || '',
    trustLevel: vendor.trustLevel || 'NEW',
  };
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
  const [editMode, setEditMode] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [fields, setFields] = useState<EditFields>(vendorToEditFields(vendor));

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateVendorApi(vendor.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      setEditMode(false);
    },
  });

  function startEdit() {
    setFields(vendorToEditFields(vendor));
    setEditMode(true);
  }

  function handleSave() {
    const address = (fields.street || fields.zip || fields.city || fields.country)
      ? { street: fields.street, zip: fields.zip, city: fields.city, country: fields.country }
      : null;
    updateMutation.mutate({
      name: fields.name,
      uid: fields.uid || null,
      address,
      email: fields.email || null,
      phone: fields.phone || null,
      website: fields.website || null,
      iban: fields.iban || null,
      bic: fields.bic || null,
      notes: fields.notes || null,
      trustLevel: fields.trustLevel,
    });
  }

  function updateField(key: keyof EditFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      {/* Email Dialog */}
      {showEmailDialog && (
        <SendEmailDialog
          onClose={() => setShowEmailDialog(false)}
          onSuccess={() => setShowEmailDialog(false)}
          defaultTo={vendor.email || ''}
          defaultSubject={`Rückfrage — ${vendor.name}`}
          defaultBody={`Sehr geehrte Damen und Herren,\n\nbezüglich unserer Geschäftsbeziehung möchten wir folgende Punkte klären:\n\n[Hier Ihre Anmerkungen einfügen]\n\nMit freundlichen Grüßen`}
          entityType="Vendor"
          entityId={vendor.id}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{vendor.name}</h2>
          {vendor.uid && (
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
              {vendor.uid}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!editMode && (
            <>
              <button onClick={() => setShowEmailDialog(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600" title="E-Mail senden">
                <Mail size={18} />
              </button>
              <button onClick={startEdit} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-primary-600" title="Bearbeiten">
                <Edit3 size={18} />
              </button>
            </>
          )}
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
      </div>

      {editMode ? (
        /* ==================== EDIT MODE ==================== */
        <div className="space-y-5">
          {/* Stammdaten */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Stammdaten</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name *</label>
                <input type="text" value={fields.name} onChange={(e) => updateField('name', e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">UID-Nummer</label>
                <input type="text" value={fields.uid} onChange={(e) => updateField('uid', e.target.value)} className="input-field text-sm font-mono" placeholder="z.B. ATU12345678" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Vertrauenslevel</label>
                <select value={fields.trustLevel} onChange={(e) => updateField('trustLevel', e.target.value)} className="input-field text-sm">
                  {(Object.entries(VENDOR_TRUST_LEVELS) as [VendorTrustLevel, { label: string; description: string }][]).map(([key, val]) => (
                    <option key={key} value={key}>{val.label} — {val.description}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>

          {/* Adresse */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Adresse</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Straße</label>
                <input type="text" value={fields.street} onChange={(e) => updateField('street', e.target.value)} className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">PLZ</label>
                  <input type="text" value={fields.zip} onChange={(e) => updateField('zip', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ort</label>
                  <input type="text" value={fields.city} onChange={(e) => updateField('city', e.target.value)} className="input-field text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Land</label>
                <input type="text" value={fields.country} onChange={(e) => updateField('country', e.target.value)} className="input-field text-sm" placeholder="z.B. Österreich" />
              </div>
            </div>
          </fieldset>

          {/* Kontakt */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Kontakt</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-Mail</label>
                <input type="email" value={fields.email} onChange={(e) => updateField('email', e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Telefon</label>
                <input type="tel" value={fields.phone} onChange={(e) => updateField('phone', e.target.value)} className="input-field text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Website</label>
                <input type="url" value={fields.website} onChange={(e) => updateField('website', e.target.value)} className="input-field text-sm" placeholder="https://" />
              </div>
            </div>
          </fieldset>

          {/* Bankdaten */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Bankdaten</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">IBAN</label>
                <input type="text" value={fields.iban} onChange={(e) => updateField('iban', e.target.value)} className="input-field text-sm font-mono" placeholder="z.B. AT12 3456 7890 1234 5678" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">BIC</label>
                <input type="text" value={fields.bic} onChange={(e) => updateField('bic', e.target.value)} className="input-field text-sm font-mono" placeholder="z.B. BKAUATWW" />
              </div>
            </div>
          </fieldset>

          {/* Notizen */}
          <fieldset>
            <legend className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Notizen</legend>
            <textarea
              value={fields.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="input-field text-sm"
              rows={3}
              placeholder="Interne Notizen zum Lieferanten..."
            />
          </fieldset>

          {/* Error */}
          {updateMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <XCircle size={16} />
              Speichern fehlgeschlagen: {(updateMutation.error as Error).message}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending || !fields.name.trim()}
              className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center disabled:opacity-50"
            >
              {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Speichern
            </button>
            <button
              onClick={() => setEditMode(false)}
              disabled={updateMutation.isPending}
              className="btn-secondary text-sm flex-1"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        /* ==================== VIEW MODE ==================== */
        <div className="space-y-4 text-sm">
          {/* Stammdaten */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <DetailRow label="UID" value={vendor.uid} mono />
            <DetailRow label="Vertrauen" value={null}>
              <TrustBadge level={vendor.trustLevel} />
            </DetailRow>
          </div>

          {/* VIES Status */}
          {vendor.uid && (
            <div className={`p-3 rounded-lg ${
              vendor.viesName ? 'bg-green-50 border border-green-200' :
              vendor.viesCheckedAt ? 'bg-red-50 border border-red-200' :
              'bg-gray-50 border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {vendor.viesName ? (
                  <><ShieldCheck size={14} className="text-green-600" /> UID bei VIES gültig</>
                ) : vendor.viesCheckedAt ? (
                  <><ShieldAlert size={14} className="text-red-500" /> UID bei VIES ungültig</>
                ) : (
                  <><ShieldQuestion size={14} className="text-gray-400" /> VIES noch nicht geprüft</>
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
                  Geprüft: {new Date(vendor.viesCheckedAt).toLocaleDateString('de-AT')}
                </p>
              )}
            </div>
          )}

          {/* Adresse */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Adresse</h3>
            {vendor.address ? (
              <div className="text-sm text-gray-700">
                {(vendor.address as Record<string, string>).street && <div>{(vendor.address as Record<string, string>).street}</div>}
                <div>
                  {(vendor.address as Record<string, string>).zip} {(vendor.address as Record<string, string>).city}
                </div>
                {(vendor.address as Record<string, string>).country && <div>{(vendor.address as Record<string, string>).country}</div>}
              </div>
            ) : (
              <p className="text-xs text-gray-300">—</p>
            )}
          </div>

          {/* Kontakt */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Kontakt</h3>
            <div className="space-y-1">
              <DetailRow label="E-Mail" value={vendor.email} link={vendor.email ? `mailto:${vendor.email}` : undefined} />
              <DetailRow label="Telefon" value={vendor.phone} />
              <DetailRow label="Website" value={vendor.website} link={vendor.website || undefined} external />
            </div>
          </div>

          {/* Bankdaten */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Bankdaten</h3>
            <div className="space-y-1">
              <DetailRow label="IBAN" value={vendor.iban} mono />
              <DetailRow label="BIC" value={vendor.bic} mono />
            </div>
          </div>

          {/* Notizen */}
          {vendor.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notizen</h3>
              <p className="text-sm text-gray-700 bg-yellow-50 p-2.5 rounded-lg whitespace-pre-wrap">{vendor.notes}</p>
            </div>
          )}

          {/* Invoices */}
          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Rechnungen ({vendor.invoices.length})
            </h3>
            {vendor.invoices.length === 0 ? (
              <p className="text-gray-300 text-xs">Keine Rechnungen verknüpft</p>
            ) : (
              <div className="space-y-1.5">
                {vendor.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => onNavigateToInvoice(inv.id)}
                    className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        BEL-{String(inv.belegNr).padStart(3, '0')}
                      </span>
                      <div>
                        <div className="text-xs font-medium truncate max-w-[180px]">
                          {inv.invoiceNumber || inv.originalFileName}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('de-AT') : '—'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold">
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
          <div className="pt-3 border-t text-[10px] text-gray-300">
            Erstellt: {new Date(vendor.createdAt).toLocaleString('de-AT')} · Aktualisiert: {new Date(vendor.updatedAt).toLocaleString('de-AT')}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono, link, external, children }: {
  label: string;
  value?: string | null;
  mono?: boolean;
  link?: string;
  external?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500">{label}</span>
      {children || (
        value ? (
          link ? (
            <a href={link} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className={`text-primary-600 hover:underline text-right truncate max-w-[200px] ${mono ? 'font-mono text-xs' : ''}`}>
              {value}
            </a>
          ) : (
            <span className={`text-gray-900 text-right truncate max-w-[200px] ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
          )
        ) : (
          <span className="text-gray-300">—</span>
        )
      )}
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
