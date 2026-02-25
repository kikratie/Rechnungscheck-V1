import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { registerApi } from '../api/auth';
import { ACCOUNTING_TYPES } from '@buchungsai/shared';
import type { AccountingTypeValue } from '@buchungsai/shared';
import toast from 'react-hot-toast';

export function RegisterPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    tenantName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    passwordConfirm: '',
    accountingType: 'EA' as AccountingTypeValue,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.password !== form.passwordConfirm) {
      toast.error('Passwörter stimmen nicht überein');
      return;
    }

    setLoading(true);

    try {
      const { user, tokens } = await registerApi({
        tenantName: form.tenantName,
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        accountingType: form.accountingType,
      });
      setAuth(user, tokens.accessToken, tokens.refreshToken);
      toast.success('Konto erfolgreich erstellt!');
      navigate('/');
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Registrierung fehlgeschlagen';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">BuchungsAI</h1>
          <p className="text-gray-500 mt-2">Neuen Mandanten erstellen</p>
        </div>

        {/* Register Card */}
        <div className="card p-8">
          <h2 className="text-xl font-semibold mb-6">Registrieren</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Firmenname
              </label>
              <input
                type="text"
                className="input-field"
                value={form.tenantName}
                onChange={(e) => update('tenantName', e.target.value)}
                placeholder="Meine Firma GmbH"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Buchhaltungsart
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(ACCOUNTING_TYPES) as [AccountingTypeValue, { label: string; description: string }][]).map(([key, val]) => (
                  <label
                    key={key}
                    className={`flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-colors ${
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
                      onChange={() => update('accountingType', key)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{val.label}</span>
                    <span className="text-xs text-gray-500 mt-0.5">{val.description}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vorname
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={form.firstName}
                  onChange={(e) => update('firstName', e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nachname
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={form.lastName}
                  onChange={(e) => update('lastName', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-Mail
              </label>
              <input
                type="email"
                className="input-field"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="name@firma.at"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Passwort
              </label>
              <input
                type="password"
                className="input-field"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="Min. 8 Zeichen, 1 Großbuchstabe, 1 Zahl"
                required
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Passwort bestätigen
              </label>
              <input
                type="password"
                className="input-field"
                value={form.passwordConfirm}
                onChange={(e) => update('passwordConfirm', e.target.value)}
                placeholder="Passwort wiederholen"
                required
              />
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Wird erstellt...' : 'Konto erstellen'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Bereits ein Konto?{' '}
            <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
              Anmelden
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
