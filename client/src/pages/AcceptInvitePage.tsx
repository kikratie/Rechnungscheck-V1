import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { acceptInviteApi } from '../api/auth';
import { CheckCircle, Loader2, XCircle, KeyRound } from 'lucide-react';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ email: string; tenantName: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwörter stimmen nicht überein');
      return;
    }
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await acceptInviteApi(token, password);
      if (result.success && result.data) {
        setSuccess({ email: result.data.email, tenantName: result.data.tenantName });
      } else {
        setError(result.error?.message || 'Fehler bei der Aktivierung');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Fehler bei der Aktivierung. Bitte versuchen Sie es erneut.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <XCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Ungültiger Link</h1>
          <p className="text-gray-500 mb-4">Dieser Einladungslink ist ungültig. Kein Token gefunden.</p>
          <Link to="/login" className="btn-primary inline-block">Zur Anmeldung</Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Konto aktiviert!</h1>
          <p className="text-gray-500 mb-4">
            Ihr Konto bei <strong>{success.tenantName}</strong> wurde erfolgreich aktiviert.
            Sie können sich jetzt mit <strong>{success.email}</strong> anmelden.
          </p>
          <Link to="/login" className="btn-primary inline-block">Jetzt anmelden</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="card p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <KeyRound size={40} className="text-primary-600 mx-auto mb-3" />
          <h1 className="text-xl font-bold">Einladung annehmen</h1>
          <p className="text-gray-500 text-sm mt-1">Legen Sie ein Passwort fest, um Ihr Konto zu aktivieren.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="Mindestens 8 Zeichen, 1 Großbuchstabe, 1 Zahl"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort bestätigen</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Passwort wiederholen"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Konto aktivieren
          </button>
        </form>
      </div>
    </div>
  );
}
