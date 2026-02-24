import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listCustomersApi, getCustomerApi, updateCustomerApi } from '../api/customers';
import type { CustomerFilters } from '../api/customers';
import {
  UserCheck, Search, X, ChevronLeft, ChevronRight, Loader2,
  Mail, Phone, Globe, FileText, MapPin,
  CreditCard, ShieldCheck, ShieldAlert, ShieldQuestion,
  Edit3, Save, XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SendEmailDialog } from '../components/SendEmailDialog';

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
            <UserCheck className="text-primary-600" size={28} />
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
              <UserCheck size={48} className="mb-3 opacity-50" />
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
                  <th className="px-4 py-3">VIES</th>
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
                        <span className="text-gray-300 text-xs">—</span>
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
                        {!customer.email && !customer.phone && !customer.website && <span className="text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ViesBadge viesName={customer.viesName} viesCheckedAt={customer.viesCheckedAt} uid={customer.uid} />
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
        <div className="w-1/2 card p-6 overflow-auto">
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

function ViesBadge({ viesName, viesCheckedAt, uid }: { viesName?: string | null; viesCheckedAt?: string | null; uid: string | null }) {
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
}

function customerToEditFields(customer: { name: string; uid: string | null; address: unknown; email: string | null; phone: string | null; website: string | null; iban: string | null; bic: string | null; notes: string | null }): EditFields {
  const addr = (customer.address as Record<string, string>) || {};
  return {
    name: customer.name || '',
    uid: customer.uid || '',
    street: addr.street || '',
    zip: addr.zip || '',
    city: addr.city || '',
    country: addr.country || '',
    email: customer.email || '',
    phone: customer.phone || '',
    website: customer.website || '',
    iban: customer.iban || '',
    bic: customer.bic || '',
    notes: customer.notes || '',
  };
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
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [fields, setFields] = useState<EditFields>(customerToEditFields(customer));

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => updateCustomerApi(customer.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditMode(false);
    },
  });

  function startEdit() {
    setFields(customerToEditFields(customer));
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
          defaultTo={customer.email || ''}
          defaultSubject={`Zahlungserinnerung — ${customer.name}`}
          defaultBody={`Sehr geehrte Damen und Herren,\n\nwir erlauben uns, Sie an offene Rechnungen hinzuweisen.\n\nWir bitten um umgehende Überweisung.\n\nMit freundlichen Grüßen`}
          entityType="Customer"
          entityId={customer.id}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{customer.name}</h2>
          {customer.uid && (
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded mt-1 inline-block">
              {customer.uid}
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
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">PLZ</label>
                  <input type="text" value={fields.zip} onChange={(e) => updateField('zip', e.target.value)} className="input-field text-sm" />
                </div>
                <div className="col-span-2">
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
              placeholder="Interne Notizen zum Kunden..."
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
            <DetailRow label="UID" value={customer.uid} mono />
          </div>

          {/* VIES Status */}
          {customer.uid && (
            <div className={`p-3 rounded-lg ${
              customer.viesName ? 'bg-green-50 border border-green-200' :
              customer.viesCheckedAt ? 'bg-red-50 border border-red-200' :
              'bg-gray-50 border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 text-sm font-medium">
                {customer.viesName ? (
                  <><ShieldCheck size={14} className="text-green-600" /> UID bei VIES gültig</>
                ) : customer.viesCheckedAt ? (
                  <><ShieldAlert size={14} className="text-red-500" /> UID bei VIES ungültig</>
                ) : (
                  <><ShieldQuestion size={14} className="text-gray-400" /> VIES noch nicht geprüft</>
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
                  Geprüft: {new Date(customer.viesCheckedAt).toLocaleDateString('de-AT')}
                </p>
              )}
            </div>
          )}

          {/* Adresse */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Adresse</h3>
            {customer.address ? (
              <div className="text-sm text-gray-700">
                {(customer.address as Record<string, string>).street && <div>{(customer.address as Record<string, string>).street}</div>}
                <div>
                  {(customer.address as Record<string, string>).zip} {(customer.address as Record<string, string>).city}
                </div>
                {(customer.address as Record<string, string>).country && <div>{(customer.address as Record<string, string>).country}</div>}
              </div>
            ) : (
              <p className="text-xs text-gray-300">—</p>
            )}
          </div>

          {/* Kontakt */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Kontakt</h3>
            <div className="space-y-1">
              <DetailRow label="E-Mail" value={customer.email} link={customer.email ? `mailto:${customer.email}` : undefined} />
              <DetailRow label="Telefon" value={customer.phone} />
              <DetailRow label="Website" value={customer.website} link={customer.website || undefined} external />
            </div>
          </div>

          {/* Bankdaten */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Bankdaten</h3>
            <div className="space-y-1">
              <DetailRow label="IBAN" value={customer.iban} mono />
              <DetailRow label="BIC" value={customer.bic} mono />
            </div>
          </div>

          {/* Notizen */}
          {customer.notes && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Notizen</h3>
              <p className="text-sm text-gray-700 bg-yellow-50 p-2.5 rounded-lg whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          {/* Invoices */}
          <div className="border-t pt-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Ausgangsrechnungen ({customer.invoices.length})
            </h3>
            {customer.invoices.length === 0 ? (
              <p className="text-gray-300 text-xs">Keine Rechnungen verknüpft</p>
            ) : (
              <div className="space-y-1.5">
                {customer.invoices.map((inv) => (
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
            Erstellt: {new Date(customer.createdAt).toLocaleString('de-AT')} · Aktualisiert: {new Date(customer.updatedAt).toLocaleString('de-AT')}
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
