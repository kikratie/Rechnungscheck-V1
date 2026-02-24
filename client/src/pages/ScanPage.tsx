import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Upload, ArrowLeft, Loader2, CheckCircle, XCircle, Plus } from 'lucide-react';
import { uploadInvoiceApi } from '../api/invoices';

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export function ScanPage() {
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleCapture = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    setFileName(file.name);
    setStatus('uploading');
    setError(null);

    try {
      await uploadInvoiceApi(file, 'INCOMING');
      setStatus('done');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message || 'Upload fehlgeschlagen';
      setError(msg);
      setStatus('error');
    }
  }, []);

  const reset = () => {
    setStatus('idle');
    setError(null);
    setFileName(null);
    // Reset file inputs so same file can be re-selected
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-8 text-sm"
        >
          <ArrowLeft size={16} />
          Zurück
        </button>

        {status === 'idle' && (
          <>
            <h1 className="text-xl font-bold text-gray-900 text-center mb-2">
              Rechnung scannen
            </h1>
            <p className="text-sm text-gray-500 text-center mb-8">
              Fotografieren Sie Ihre Rechnung oder wählen Sie eine Datei aus
            </p>

            {/* Hidden inputs */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleCapture(e.target.files)}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp"
              className="hidden"
              onChange={(e) => handleCapture(e.target.files)}
            />

            <div className="space-y-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-4 bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white rounded-xl font-medium text-base transition-colors"
              >
                <Camera size={22} />
                Foto aufnehmen
              </button>

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-gray-200 hover:border-gray-300 active:bg-gray-50 text-gray-700 rounded-xl font-medium text-base transition-colors"
              >
                <Upload size={22} />
                Datei auswählen
              </button>
            </div>
          </>
        )}

        {status === 'uploading' && (
          <div className="text-center py-8">
            <Loader2 size={48} className="animate-spin text-primary-600 mx-auto mb-4" />
            <p className="font-medium text-gray-900">Wird hochgeladen...</p>
            <p className="text-sm text-gray-500 mt-1 truncate">{fileName}</p>
          </div>
        )}

        {status === 'done' && (
          <div className="text-center py-8">
            <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
            <p className="font-medium text-gray-900">Erfolgreich hochgeladen!</p>
            <p className="text-sm text-gray-500 mt-1">Die Rechnung wird automatisch verarbeitet.</p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors"
              >
                <Plus size={16} />
                Nächste Rechnung
              </button>
              <button
                onClick={() => navigate('/invoices')}
                className="flex-1 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium text-sm transition-colors"
              >
                Zu Rechnungen
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            <p className="font-medium text-gray-900">Upload fehlgeschlagen</p>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={reset}
              className="btn-primary mt-4"
            >
              Erneut versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
