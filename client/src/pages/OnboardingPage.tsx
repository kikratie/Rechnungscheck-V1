import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { completeOnboardingApi } from '../api/tenant';
import { ACCOUNTING_TYPES } from '@buchungsai/shared';
import type { AccountingTypeValue } from '@buchungsai/shared';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { user, setOnboardingComplete } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: user?.tenantName || '',
    uidNumber: '',
    firmenbuchNr: '',
    street: '',
    zip: '',
    city: '',
    country: 'AT',
    accountingType: (user?.accountingType || 'EA') as AccountingTypeValue,
    // Bank account fields (will create first BankAccount)
    bankLabel: 'Geschäftskonto',
    iban: '',
    bic: '',
    bankName: '',
    phone: '',
    email: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Build bank account object only if IBAN or bankName provided
      const hasBankData = form.iban || form.bankName;
      const bankAccount = hasBankData
        ? {
            label: form.bankLabel || 'Geschäftskonto',
            accountType: 'CHECKING' as const,
            iban: form.iban || null,
            bic: form.bic || null,
            bankName: form.bankName || null,
          }
        : undefined;

      await completeOnboardingApi({
        name: form.name || undefined,
        uidNumber: form.uidNumber || null,
        firmenbuchNr: form.firmenbuchNr || null,
        address: {
          street: form.street,
          zip: form.zip,
          city: form.city,
          country: form.country || 'AT',
        },
        country: form.country || 'AT',
        phone: form.phone || null,
        email: form.email || null,
        accountingType: form.accountingType,
        bankAccount,
      });

      setOnboardingComplete();
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data
              ?.error?.message || 'Fehler beim Speichern'
          : 'Fehler beim Speichern';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Willkommen bei Ki2Go Accounting</h1>
          <p className="text-gray-500 mt-2">
            Bitte vervollständigen Sie Ihre Firmendaten, damit wir Rechnungen korrekt prüfen können.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Firmendaten */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Firmendaten</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Firmenname</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firmenbuchnummer
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="z.B. FN 123456a"
                  value={form.firmenbuchNr}
                  onChange={(e) => updateField('firmenbuchNr', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ihre UID-Nummer
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="ATU12345678"
                  value={form.uidNumber}
                  onChange={(e) => updateField('uidNumber', e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Format: ATU + 8 Ziffern. Wird für die Aussteller-Empfänger-Prüfung verwendet.
                </p>
              </div>
            </div>
          </div>

          {/* Buchhaltungsart */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Buchhaltungsart</h2>
            <p className="text-sm text-gray-500 mb-4">
              Bestimmt, welche Funktionen und Exporte verfügbar sind.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(Object.entries(ACCOUNTING_TYPES) as [AccountingTypeValue, { label: string; description: string }][]).map(([key, val]) => (
                <label
                  key={key}
                  className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    form.accountingType === key
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountingType"
                    value={key}
                    checked={form.accountingType === key}
                    onChange={() => updateField('accountingType', key)}
                    className="sr-only"
                  />
                  <span className="font-medium">{val.label}</span>
                  <span className="text-sm text-gray-500 mt-1">{val.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Adresse */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">
              Adresse <span className="text-red-500">*</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Straße *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  value={form.street}
                  onChange={(e) => updateField('street', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PLZ *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  value={form.zip}
                  onChange={(e) => updateField('zip', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stadt *</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
                <input
                  type="text"
                  className="input-field"
                  value={form.country}
                  onChange={(e) => updateField('country', e.target.value)}
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Bankverbindung */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Erstes Bankkonto</h2>
            <p className="text-sm text-gray-500 mb-4">
              Ihre Firmen-IBAN wird verwendet, um eigene Konten von Lieferanten-IBANs zu
              unterscheiden. Weitere Konten können Sie später in den Einstellungen hinzufügen.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kontobezeichnung
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="z.B. Geschäftskonto Erste Bank"
                  value={form.bankLabel}
                  onChange={(e) => updateField('bankLabel', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ihre Firmen-IBAN
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="AT61 1904 3002 3457 3201"
                  value={form.iban}
                  onChange={(e) => updateField('iban', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BIC</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="GIBAATWWXXX"
                  value={form.bic}
                  onChange={(e) => updateField('bic', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bankname</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="z.B. Erste Bank"
                  value={form.bankName}
                  onChange={(e) => updateField('bankName', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Kontakt */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Kontakt</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="+43 1 234 5678"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firmen-E-Mail
                </label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="office@firma.at"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-primary w-full py-3 text-base"
          >
            {isSubmitting ? 'Wird gespeichert...' : 'Onboarding abschließen'}
          </button>
        </form>
      </div>
    </div>
  );
}
