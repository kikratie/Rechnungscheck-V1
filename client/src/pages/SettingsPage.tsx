import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import {
  getTenantApi,
  updateTenantApi,
  createBankAccountApi,
  updateBankAccountApi,
  deleteBankAccountApi,
} from '../api/tenant';
import { getMailStatusApi } from '../api/mail';
import type { TenantProfile, BankAccountItem, BankAccountType } from '@buchungsai/shared';
import { Mail, CheckCircle, AlertTriangle } from 'lucide-react';

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
      </div>
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
