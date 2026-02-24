import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { uploadInvoiceApi } from '../api/invoices';
import { Loader2, CheckCircle, XCircle, Share2, LogIn } from 'lucide-react';

type Status = 'loading' | 'uploading' | 'done' | 'error' | 'no-files' | 'not-auth';

export function ShareTargetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);

  const processSharedFiles = useCallback(async () => {
    if (!isAuthenticated) {
      setStatus('not-auth');
      return;
    }

    const fileKeysStr = searchParams.get('files');
    if (!fileKeysStr) {
      setStatus('no-files');
      return;
    }

    const fileKeys = fileKeysStr.split(',');
    setFileCount(fileKeys.length);
    setStatus('uploading');

    try {
      const cache = await caches.open('share-target-cache');

      for (const key of fileKeys) {
        const response = await cache.match(key);
        if (!response) continue;

        const blob = await response.blob();
        const fileName = response.headers.get('X-File-Name') || 'shared-file';
        const file = new File([blob], fileName, { type: blob.type });

        await uploadInvoiceApi(file, 'INCOMING');

        // Clean up cache entry
        await cache.delete(key);
      }

      setStatus('done');
      setTimeout(() => navigate('/invoices'), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || 'Upload fehlgeschlagen';
      setError(msg);
      setStatus('error');
    }
  }, [isAuthenticated, searchParams, navigate]);

  useEffect(() => {
    processSharedFiles();
  }, [processSharedFiles]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-sm w-full text-center">
        <Share2 size={32} className="text-primary-600 mx-auto mb-6" />

        {status === 'loading' && (
          <>
            <Loader2 size={40} className="animate-spin text-primary-600 mx-auto mb-4" />
            <p className="text-gray-600">Datei wird empfangen...</p>
          </>
        )}

        {status === 'uploading' && (
          <>
            <Loader2 size={40} className="animate-spin text-primary-600 mx-auto mb-4" />
            <p className="font-medium text-gray-900">
              {fileCount} {fileCount === 1 ? 'Datei' : 'Dateien'} wird hochgeladen...
            </p>
          </>
        )}

        {status === 'done' && (
          <>
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <p className="font-medium text-gray-900">Erfolgreich hochgeladen!</p>
            <p className="text-sm text-gray-500 mt-1">Weiterleitung zu Rechnungen...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            <p className="font-medium text-gray-900">Upload fehlgeschlagen</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <div className="flex gap-2 mt-4 justify-center">
              <button onClick={() => processSharedFiles()} className="btn-primary">
                Erneut versuchen
              </button>
              <button onClick={() => navigate('/invoices')} className="btn-secondary">
                Zu Rechnungen
              </button>
            </div>
          </>
        )}

        {status === 'not-auth' && (
          <>
            <p className="font-medium text-gray-900 mb-2">Bitte zuerst anmelden</p>
            <p className="text-sm text-gray-500 mb-4">
              Sie müssen eingeloggt sein, um Dateien hochzuladen.
            </p>
            <button onClick={() => navigate('/login')} className="btn-primary flex items-center gap-2 mx-auto">
              <LogIn size={16} />
              Anmelden
            </button>
          </>
        )}

        {status === 'no-files' && (
          <>
            <p className="font-medium text-gray-900 mb-2">Keine Dateien empfangen</p>
            <p className="text-sm text-gray-500 mb-4">
              Es wurden keine Dateien zum Hochladen gefunden.
            </p>
            <button onClick={() => navigate('/invoices')} className="btn-primary">
              Zu Rechnungen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
