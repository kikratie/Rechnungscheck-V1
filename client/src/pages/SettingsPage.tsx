import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  getTenantApi,
  updateTenantApi,
  createBankAccountApi,
  updateBankAccountApi,
  deleteBankAccountApi,
  grantAccessApi,
  revokeAccessApi,
  getAccessListApi,
  deleteAccountApi,
  exportUserDataApi,
} from '../api/tenant';
import { downloadBlob } from '../api/exports';
import { getMailStatusApi } from '../api/mail';
import type { TenantProfile, BankAccountItem, BankAccountType } from '@buchungsai/shared';
import { Mail, CheckCircle, AlertTriangle, Shield, Trash2, Download, UserPlus, X, Loader2, RefreshCw, Play, Pause, Plug, Plus } from 'lucide-react';
import {
  listEmailConnectorsApi,
  createEmailConnectorApi,
  updateEmailConnectorApi,
  deleteEmailConnectorApi,
  testEmailConnectorApi,
  triggerSyncApi,
} from '../api/emailConnectors';
import type { EmailConnectorItem, CreateEmailConnectorRequest } from '@buchungsai/shared';

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  CHECKING: 'Girokonto',
  SAVINGS: 'Sparkonto',
  CREDIT_CARD: 'Kreditkarte',
  PAYPAL: 'PayPal',
  OTHER: 'Sonstiges',
};

interface BankAccountFormData {
  label: string;
  accountType: BankAccountType;
  iban: string;
  bic: string;
  bankName: string;
  cardLastFour: string;
  isPrimary: boolean;
}

const emptyBankForm: BankAccountFormData = {
  label: '',
  accountType: 'CHECKING',
  iban: '',
  bic: '',
  bankName: '',
  cardLastFour: '',
  isPrimary: false,
};

export function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant'],
    queryFn: getTenantApi,
  });

  const { data: mailStatus } = useQuery({
    queryKey: ['mail-status'],
    queryFn: getMailStatusApi,
    staleTime: 60_000,
  });

  const smtpConfigured = mailStatus?.data?.configured ?? false;

  const [form, setForm] = useState({
    name: '',
    uidNumber: '',
    firmenbuchNr: '',
    street: '',
    zip: '',
    city: '',
    country: 'AT',
    phone: '',
    email: '',
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  // Bank account state
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState<BankAccountFormData>(emptyBankForm);

  useEffect(() => {
    if (tenant) {
      const addr = tenant.address as { street?: string; zip?: string; city?: string; country?: string } | null;
      setForm({
        name: tenant.name || '',
        uidNumber: tenant.uidNumber || '',
        firmenbuchNr: tenant.firmenbuchNr || '',
        street: addr?.street || '',
        zip: addr?.zip || '',
        city: addr?.city || '',
        country: tenant.country || addr?.country || 'AT',
        phone: tenant.phone || '',
        email: tenant.email || '',
      });
    }
  }, [tenant]);

  const mutation = useMutation({
    mutationFn: (data: Partial<TenantProfile>) => updateTenantApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: createBankAccountApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setShowBankForm(false);
      setBankForm(emptyBankForm);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateBankAccountApi>[1] }) =>
      updateBankAccountApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
      setEditingAccountId(null);
      setBankForm(emptyBankForm);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteBankAccountApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant'] });
    },
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateBankField = (field: keyof BankAccountFormData, value: string | boolean) => {
    setBankForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    mutation.mutate({
      name: form.name || undefined,
      uidNumber: form.uidNumber || null,
      firmenbuchNr: form.firmenbuchNr || null,
      address: {
        street: form.street,
        zip: form.zip,
        city: form.city,
        country: form.country || 'AT',
      },
      country: form.country || null,
      phone: form.phone || null,
      email: form.email || null,
    } as Partial<TenantProfile>);
  };

  const handleCreateAccount = () => {
    createAccountMutation.mutate({
      label: bankForm.label,
      accountType: bankForm.accountType,
      iban: bankForm.iban || null,
      bic: bankForm.bic || null,
      bankName: bankForm.bankName || null,
      cardLastFour: bankForm.cardLastFour || null,
      isPrimary: bankForm.isPrimary,
    });
  };

  const handleUpdateAccount = () => {
    if (!editingAccountId) return;
    updateAccountMutation.mutate({
      id: editingAccountId,
      data: {
        label: bankForm.label,
        accountType: bankForm.accountType,
        iban: bankForm.iban || null,
        bic: bankForm.bic || null,
        bankName: bankForm.bankName || null,
        cardLastFour: bankForm.cardLastFour || null,
        isPrimary: bankForm.isPrimary,
      },
    });
  };

  const startEdit = (account: BankAccountItem) => {
    setEditingAccountId(account.id);
    setShowBankForm(false);
    setBankForm({
      label: account.label,
      accountType: account.accountType,
      iban: account.iban || '',
      bic: account.bic || '',
      bankName: account.bankName || '',
      cardLastFour: account.cardLastFour || '',
      isPrimary: account.isPrimary,
    });
  };

  const cancelBankForm = () => {
    setShowBankForm(false);
    setEditingAccountId(null);
    setBankForm(emptyBankForm);
  };

  const handleDeleteAccount = (id: string) => {
    if (confirm('Bankkonto wirklich löschen?')) {
      deleteAccountMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  const bankAccounts = tenant?.bankAccounts ?? [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
        <p className="text-gray-500 mt-1">Mandanten- und Benutzereinstellungen</p>
      </div>

      {/* Profil — immer read-only */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Mein Profil</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500 block">Name</span>
            <span className="font-medium">{user?.firstName} {user?.lastName}</span>
          </div>
          <div>
            <span className="text-gray-500 block">E-Mail</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Rolle</span>
            <span className="font-medium">{user?.role === 'ADMIN' ? 'Administrator' : user?.role === 'ACCOUNTANT' ? 'Buchhalter' : 'Steuerberater'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firmendaten */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Ihre Firmendaten</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firmenname</label>
              <input
                type="text"
                className="input-field"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firmenbuchnummer</label>
              <input
                type="text"
                className="input-field"
                placeholder="z.B. FN 123456a"
                value={form.firmenbuchNr}
                onChange={(e) => updateField('firmenbuchNr', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ihre UID-Nummer</label>
              <input
                type="text"
                className="input-field"
                placeholder="ATU12345678"
                value={form.uidNumber}
                onChange={(e) => updateField('uidNumber', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Adresse</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Straße"
                  value={form.street}
                  onChange={(e) => updateField('street', e.target.value)}
                  disabled={!isAdmin}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="PLZ"
                    value={form.zip}
                    onChange={(e) => updateField('zip', e.target.value)}
                    disabled={!isAdmin}
                  />
                  <input
                    type="text"
                    className="input-field sm:col-span-2"
                    placeholder="Stadt"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Land (AT)"
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  disabled={!isAdmin}
                  maxLength={2}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Kontakt */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4">Kontakt</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
              <input
                type="text"
                className="input-field"
                placeholder="+43 1 234 5678"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Firmen-E-Mail</label>
              <input
                type="email"
                className="input-field"
                placeholder="office@firma.at"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button for Firmendaten (nur Admin) */}
      {isAdmin && (
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Wird gespeichert...' : 'Firmendaten speichern'}
          </button>
          {saveSuccess && (
            <span className="text-sm text-green-600 font-medium">Gespeichert!</span>
          )}
          {mutation.isError && (
            <span className="text-sm text-red-600">Fehler beim Speichern</span>
          )}
        </div>
      )}

      {!isAdmin && (
        <p className="mt-6 text-sm text-gray-400">
          Nur Administratoren können die Firmendaten bearbeiten.
        </p>
      )}

      {/* Bankkonten */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Bankkonten</h2>
          {isAdmin && !showBankForm && !editingAccountId && (
            <button
              onClick={() => { setShowBankForm(true); setEditingAccountId(null); setBankForm(emptyBankForm); }}
              className="btn-primary text-sm"
            >
              + Konto hinzufügen
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Ihre Firmen-IBANs werden verwendet, um eigene Konten von Lieferanten-IBANs zu unterscheiden.
        </p>

        {/* Account List */}
        {bankAccounts.length === 0 && !showBankForm && (
          <div className="card p-6 text-center text-gray-400">
            Noch keine Bankkonten hinterlegt.
          </div>
        )}

        <div className="space-y-3">
          {bankAccounts.map((account) => (
            <div key={account.id} className="card p-4">
              {editingAccountId === account.id ? (
                <BankAccountForm
                  form={bankForm}
                  onChange={updateBankField}
                  onSave={handleUpdateAccount}
                  onCancel={cancelBankForm}
                  isSaving={updateAccountMutation.isPending}
                  isError={updateAccountMutation.isError}
                  submitLabel="Speichern"
                />
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center text-primary-700 font-semibold text-sm">
                      {account.accountType === 'CREDIT_CARD' ? 'CC' : account.accountType === 'PAYPAL' ? 'PP' : 'BK'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{account.label}</span>
                        {account.isPrimary && (
                          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                            Primär
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {ACCOUNT_TYPE_LABELS[account.accountType]}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {account.iban && <span>{account.iban}</span>}
                        {account.cardLastFour && <span>**** {account.cardLastFour}</span>}
                        {account.bankName && <span className="ml-2">({account.bankName})</span>}
                      </div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(account)}
                        className="text-sm text-primary-600 hover:text-primary-800"
                      >
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(account.id)}
                        disabled={deleteAccountMutation.isPending}
                        className="text-sm text-red-500 hover:text-red-700"
                      >
                        Löschen
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* New Account Form */}
        {showBankForm && (
          <div className="card p-4 mt-3">
            <BankAccountForm
              form={bankForm}
              onChange={updateBankField}
              onSave={handleCreateAccount}
              onCancel={cancelBankForm}
              isSaving={createAccountMutation.isPending}
              isError={createAccountMutation.isError}
              submitLabel="Konto anlegen"
            />
          </div>
        )}
      </div>

      {/* E-Mail-Versand (SMTP) */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">E-Mail-Versand</h2>
        <div className="card p-6">
          <div className="flex items-start gap-3">
            <Mail size={20} className={smtpConfigured ? 'text-green-600 mt-0.5' : 'text-yellow-600 mt-0.5'} />
            <div>
              {smtpConfigured ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">SMTP konfiguriert</span>
                    <CheckCircle size={16} className="text-green-600" />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    E-Mail-Versand ist aktiv. Sie können Mahnungen und Reklamationen direkt aus dem System versenden.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">SMTP nicht konfiguriert</span>
                    <AlertTriangle size={16} className="text-yellow-600" />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Um E-Mails direkt aus dem System zu versenden, hinterlegen Sie SMTP-Zugangsdaten in der Server-Konfiguration.
                  </p>
                  <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 font-mono space-y-1">
                    <p>SMTP_HOST=smtp.gmail.com</p>
                    <p>SMTP_PORT=587</p>
                    <p>SMTP_USER=ihre@email.at</p>
                    <p>SMTP_PASS=app-passwort</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Unterstützt: Gmail, Outlook, eigener SMTP-Server u.a.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Steuerberater-Zugang (only Admin) */}
        {user?.role === 'ADMIN' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield size={20} className="text-blue-600" />
              Steuerberater-Zugang
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Geben Sie Ihrem Steuerberater Lesezugriff auf Ihre Belege.
            </p>
            <TaxAdvisorAccessSection />
          </div>
        )}

        {/* E-Mail-Abruf (only Admin) */}
        {user?.role === 'ADMIN' && (
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Mail size={20} className="text-primary-600" />
              E-Mail-Abruf
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Rechnungen automatisch aus einem E-Mail-Postfach abrufen. Unterstützt Gmail (App-Passwort), Outlook und jeden IMAP-Server.
            </p>
            <EmailConnectorsSection />
          </div>
        )}

        {/* DSGVO / Datenschutz */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield size={20} className="text-gray-600" />
            Datenschutz & Konto
          </h2>
          <GdprSection isAdmin={user?.role === 'ADMIN'} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Email Connectors Section
// ============================================================

interface ConnectorFormData {
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  folder: string;
  pollIntervalMinutes: number;
}

const emptyConnectorForm: ConnectorFormData = {
  label: '',
  host: '',
  port: 993,
  secure: true,
  username: '',
  password: '',
  folder: 'INBOX',
  pollIntervalMinutes: 5,
};

function EmailConnectorsSection() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ConnectorFormData>(emptyConnectorForm);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ['email-connectors'],
    queryFn: listEmailConnectorsApi,
    refetchInterval: 30_000, // Auto-refresh alle 30s für Sync-Status
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateEmailConnectorRequest) => createEmailConnectorApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connectors'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateEmailConnectorApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-connectors'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEmailConnectorApi,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['email-connectors'] }),
  });

  const syncMutation = useMutation({
    mutationFn: triggerSyncApi,
    onSuccess: () => {
      // Nach kurzem Delay erneut laden
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['email-connectors'] }), 2000);
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyConnectorForm);
    setTestResult(null);
  };

  const startEdit = (c: EmailConnectorItem) => {
    setEditingId(c.id);
    setShowForm(true);
    setForm({
      label: c.label,
      host: c.host,
      port: c.port,
      secure: c.secure,
      username: c.username,
      password: '', // Passwort nicht vorausfüllen
      folder: c.folder,
      pollIntervalMinutes: c.pollIntervalMinutes,
    });
    setTestResult(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testEmailConnectorApi({
        host: form.host,
        port: form.port,
        secure: form.secure,
        username: form.username,
        password: form.password,
      });
      setTestResult(
        result.success
          ? { success: true, message: `Verbunden! ${result.messageCount ?? 0} Nachrichten im Postfach.` }
          : { success: false, message: result.error ?? 'Verbindung fehlgeschlagen' },
      );
    } catch (err) {
      setTestResult({ success: false, message: (err as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (editingId) {
      const data: Record<string, unknown> = {
        label: form.label,
        host: form.host,
        port: form.port,
        secure: form.secure,
        username: form.username,
        folder: form.folder,
        pollIntervalMinutes: form.pollIntervalMinutes,
      };
      if (form.password) data.password = form.password;
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleToggleActive = (c: EmailConnectorItem) => {
    updateMutation.mutate({ id: c.id, data: { isActive: !c.isActive } });
  };

  const handleDelete = (c: EmailConnectorItem) => {
    if (confirm(`E-Mail-Verbindung "${c.label}" wirklich löschen?`)) {
      deleteMutation.mutate(c.id);
    }
  };

  const formatRelativeTime = (isoDate: string | null) => {
    if (!isoDate) return 'Noch nie';
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Gerade eben';
    if (mins < 60) return `vor ${mins} Min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std`;
    return `vor ${Math.floor(hours / 24)} Tagen`;
  };

  const SyncStatusBadge = ({ connector }: { connector: EmailConnectorItem }) => {
    if (!connector.lastSyncStatus) return <span className="text-xs text-gray-400">Ausstehend</span>;
    switch (connector.lastSyncStatus) {
      case 'SUCCESS':
        return <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12} /> {formatRelativeTime(connector.lastSyncAt)}</span>;
      case 'RUNNING':
        return <span className="text-xs text-blue-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Läuft...</span>;
      case 'ERROR':
        return (
          <span className="text-xs text-red-600 flex items-center gap-1" title={connector.lastSyncError ?? ''}>
            <AlertTriangle size={12} /> Fehler
          </span>
        );
      default:
        return null;
    }
  };

  if (isLoading) return <div className="text-sm text-gray-400">Laden...</div>;

  return (
    <div className="space-y-4">
      {/* Connector-Liste */}
      {connectors.length > 0 ? (
        <div className="space-y-3">
          {connectors.map((c) => (
            <div key={c.id} className={`border rounded-lg p-4 ${!c.isActive ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Mail size={16} className={c.isActive ? 'text-primary-600' : 'text-gray-400'} />
                    <span className="font-medium text-sm">{c.label}</span>
                    {!c.isActive && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Deaktiviert</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {c.username} @ {c.host}:{c.port} / {c.folder}
                  </div>
                  <div className="mt-1"><SyncStatusBadge connector={c} /></div>
                  {c.consecutiveFailures >= 3 && (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> Nach {c.consecutiveFailures} Fehlern automatisch deaktiviert
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {c.isActive && (
                    <button
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                      title="Jetzt synchronisieren"
                      onClick={() => syncMutation.mutate(c.id)}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    title={c.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    onClick={() => handleToggleActive(c)}
                  >
                    {c.isActive ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                    title="Bearbeiten"
                    onClick={() => startEdit(c)}
                  >
                    <Plug size={16} />
                  </button>
                  <button
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Löschen"
                    onClick={() => handleDelete(c)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Noch keine E-Mail-Verbindung eingerichtet. Verbinden Sie ein E-Mail-Konto, um Rechnungen automatisch abzurufen.
        </p>
      )}

      {/* Add / Edit Form */}
      {showForm ? (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <h3 className="text-sm font-semibold">{editingId ? 'Verbindung bearbeiten' : 'Neue E-Mail-Verbindung'}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bezeichnung</label>
              <input className="input-field text-sm" placeholder="z.B. Rechnungen Gmail" value={form.label} onChange={(e) => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">IMAP-Host</label>
              <input className="input-field text-sm" placeholder="imap.gmail.com" value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Port</label>
              <input type="number" className="input-field text-sm" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 993 }))} />
            </div>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.secure} onChange={(e) => setForm(f => ({ ...f, secure: e.target.checked }))} className="rounded" />
                SSL/TLS
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Benutzername / E-Mail</label>
              <input className="input-field text-sm" placeholder="rechnung@firma.at" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Passwort / App-Passwort
                {editingId && <span className="text-gray-400 font-normal"> (leer lassen = unverändert)</span>}
              </label>
              <input type="password" className="input-field text-sm" placeholder="••••••••" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">IMAP-Ordner</label>
              <input className="input-field text-sm" placeholder="INBOX" value={form.folder} onChange={(e) => setForm(f => ({ ...f, folder: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Abruf-Intervall</label>
              <select className="input-field text-sm" value={form.pollIntervalMinutes} onChange={(e) => setForm(f => ({ ...f, pollIntervalMinutes: parseInt(e.target.value) }))}>
                <option value={1}>Jede Minute</option>
                <option value={5}>Alle 5 Minuten</option>
                <option value={15}>Alle 15 Minuten</option>
                <option value={30}>Alle 30 Minuten</option>
              </select>
            </div>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`text-sm p-2 rounded ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.success ? <CheckCircle size={14} className="inline mr-1" /> : <AlertTriangle size={14} className="inline mr-1" />}
              {testResult.message}
            </div>
          )}

          {/* Error */}
          {(createMutation.error || updateMutation.error) && (
            <div className="text-sm text-red-600">
              {((createMutation.error || updateMutation.error) as Error).message}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              className="btn-secondary text-sm flex items-center gap-1"
              onClick={handleTest}
              disabled={testing || !form.host || !form.username || !form.password}
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
              Verbindung testen
            </button>
            <button
              className="btn-primary text-sm"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || !form.label || !form.host || !form.username || (!editingId && !form.password)}
            >
              {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {editingId ? 'Speichern' : 'Erstellen'}
            </button>
            <button className="text-sm text-gray-500 hover:text-gray-700" onClick={resetForm}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn-secondary text-sm flex items-center gap-1"
          onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyConnectorForm); }}
        >
          <Plus size={14} /> E-Mail-Konto verbinden
        </button>
      )}
    </div>
  );
}

function TaxAdvisorAccessSection() {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState('READ');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  const { data: accessList, isLoading: listLoading } = useQuery({
    queryKey: ['access-list'],
    queryFn: getAccessListApi,
  });

  const handleGrant = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await grantAccessApi(email, accessLevel);
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['access-list'] });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Fehler beim Zugang gewähren');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!confirm('Zugang wirklich entziehen?')) return;
    try {
      await revokeAccessApi(userId);
      queryClient.invalidateQueries({ queryKey: ['access-list'] });
    } catch {
      alert('Fehler beim Entziehen des Zugangs');
    }
  };

  return (
    <div className="space-y-4">
      {/* Grant access form */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">E-Mail des Steuerberaters</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field text-sm"
            placeholder="steuerberater@kanzlei.at"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Zugriff</label>
          <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)} className="input-field text-sm">
            <option value="READ">Lesen</option>
            <option value="WRITE">Schreiben</option>
          </select>
        </div>
        <button className="btn-primary text-sm flex items-center gap-1" onClick={handleGrant} disabled={!email || loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Einladen
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Current access list */}
      {listLoading ? (
        <div className="flex items-center justify-center py-4"><Loader2 className="animate-spin text-gray-400" size={20} /></div>
      ) : accessList && accessList.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-medium">Aktive Zugänge</p>
          {accessList.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-medium">{item.user.firstName} {item.user.lastName}</p>
                <p className="text-xs text-gray-500">{item.user.email} · {item.accessLevel === 'READ' ? 'Lesen' : item.accessLevel === 'WRITE' ? 'Schreiben' : item.accessLevel}</p>
              </div>
              <button
                onClick={() => handleRevoke(item.user.id)}
                className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Zugang entziehen"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Kein Steuerberater hat aktuell Zugang.</p>
      )}
    </div>
  );
}

function GdprSection({ isAdmin }: { isAdmin: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { logout } = useAuthStore();

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportUserDataApi();
      downloadBlob(blob, 'datenexport.json');
    } catch {
      alert('Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!password) return;
    setDeleting(true);
    try {
      await deleteAccountApi(password);
      logout();
      window.location.href = '/login';
    } catch (err: unknown) {
      alert((err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Löschung fehlgeschlagen');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Data Export */}
      <div>
        <p className="text-sm text-gray-700 mb-2">
          Gemäß Art. 20 DSGVO können Sie alle Ihre persönlichen Daten als JSON-Datei herunterladen.
        </p>
        <button className="btn-secondary text-sm flex items-center gap-1.5" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          Daten exportieren
        </button>
      </div>

      {/* Account deletion (Admin only) */}
      {isAdmin && (
        <div className="border-t pt-4">
          <p className="text-sm text-gray-700 mb-2">
            Gemäß Art. 17 DSGVO können Sie Ihr Konto und alle zugehörigen Daten unwiderruflich löschen.
          </p>
          {!confirmDelete ? (
            <button
              className="btn-secondary text-sm flex items-center gap-1.5 text-red-600 hover:text-red-700 hover:border-red-300"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
              Konto löschen
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <p className="text-sm text-red-700 font-medium">
                Achtung: Alle Daten werden unwiderruflich gelöscht! Dies umfasst alle Rechnungen, Bankdaten, Lieferanten und Benutzer.
              </p>
              <div>
                <label className="block text-xs text-red-600 mb-1">Passwort bestätigen</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field text-sm border-red-300"
                  placeholder="Aktuelles Passwort eingeben"
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-1.5"
                  onClick={handleDelete}
                  disabled={!password || deleting}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Endgültig löschen
                </button>
                <button className="btn-secondary text-sm" onClick={() => { setConfirmDelete(false); setPassword(''); }}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BankAccountForm({
  form,
  onChange,
  onSave,
  onCancel,
  isSaving,
  isError,
  submitLabel,
}: {
  form: BankAccountFormData;
  onChange: (field: keyof BankAccountFormData, value: string | boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  isError: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bezeichnung *</label>
          <input
            type="text"
            className="input-field"
            placeholder="z.B. Geschäftskonto Erste Bank"
            value={form.label}
            onChange={(e) => onChange('label', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kontotyp</label>
          <select
            className="input-field"
            value={form.accountType}
            onChange={(e) => onChange('accountType', e.target.value)}
          >
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
          <input
            type="text"
            className="input-field"
            placeholder="AT61 1904 3002 3457 3201"
            value={form.iban}
            onChange={(e) => onChange('iban', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
          <input
            type="text"
            className="input-field"
            placeholder="GIBAATWWXXX"
            value={form.bic}
            onChange={(e) => onChange('bic', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bankname</label>
          <input
            type="text"
            className="input-field"
            placeholder="z.B. Erste Bank"
            value={form.bankName}
            onChange={(e) => onChange('bankName', e.target.value)}
          />
        </div>
        {form.accountType === 'CREDIT_CARD' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Letzte 4 Stellen</label>
            <input
              type="text"
              className="input-field"
              placeholder="4832"
              maxLength={4}
              value={form.cardLastFour}
              onChange={(e) => onChange('cardLastFour', e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isPrimary}
            onChange={(e) => onChange('isPrimary', e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          Primärkonto
        </label>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving || !form.label}
          className="btn-primary text-sm"
        >
          {isSaving ? 'Speichern...' : submitLabel}
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">
          Abbrechen
        </button>
        {isError && <span className="text-sm text-red-600">Fehler beim Speichern</span>}
      </div>
    </div>
  );
}
