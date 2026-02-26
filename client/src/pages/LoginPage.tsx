import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { loginApi, forgotPasswordApi } from '../api/auth';
import toast from 'react-hot-toast';

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { user, tokens } = await loginApi(form);
      setAuth(user, tokens.accessToken, tokens.refreshToken);
      toast.success(`Willkommen, ${user.firstName}!`);
      navigate('/');
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || 'Anmeldung fehlgeschlagen';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      await forgotPasswordApi(forgotEmail);
      setForgotSent(true);
    } catch {
      // Always show success to prevent email enumeration
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">BuchungsAI</h1>
          <p className="text-gray-500 mt-2">
            KI-gest\u00fctzte Buchhaltungs-Automatisierung
          </p>
        </div>

        {/* Login Card */}
        <div className="card p-8">
          {!showForgot ? (
            <>
              <h2 className="text-xl font-semibold mb-6">Anmelden</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail
                  </label>
                  <input
                    type="email"
                    className="input-field"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Passwort eingeben"
                    required
                  />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? 'Wird angemeldet...' : 'Anmelden'}
                </button>
              </form>

              <div className="text-center mt-4">
                <button
                  onClick={() => { setShowForgot(true); setForgotEmail(form.email); }}
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Passwort vergessen?
                </button>
              </div>

              <p className="text-center text-sm text-gray-500 mt-4">
                Noch kein Konto?{' '}
                <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
                  Jetzt registrieren
                </Link>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Passwort zur\u00fccksetzen</h2>
              <p className="text-sm text-gray-500 mb-6">
                Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen Link zum Zur\u00fccksetzen.
              </p>

              {forgotSent ? (
                <div className="text-center">
                  <div className="bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
                    Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zur\u00fccksetzen gesendet.
                    Bitte pr\u00fcfen Sie Ihr Postfach.
                  </div>
                  <button
                    onClick={() => { setShowForgot(false); setForgotSent(false); }}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Zur\u00fcck zur Anmeldung
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                    <input
                      type="email"
                      className="input-field"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="name@firma.at"
                      required
                    />
                  </div>
                  <button type="submit" disabled={forgotLoading} className="btn-primary w-full">
                    {forgotLoading ? 'Wird gesendet...' : 'Link senden'}
                  </button>
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowForgot(false)}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Zur\u00fcck zur Anmeldung
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
