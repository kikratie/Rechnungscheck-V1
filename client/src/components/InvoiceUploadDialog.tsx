import { useState, useCallback, useRef } from 'react';
import { Upload, X, Loader2, CheckCircle, XCircle, Clock, Download } from 'lucide-react';
import { uploadInvoiceApi } from '../api/invoices';

interface FileUploadState {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface InvoiceUploadDialogProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultDirection?: 'INCOMING' | 'OUTGOING';
  showDirectionPicker?: boolean;
  title?: string;
}

export function InvoiceUploadDialog({
  onClose,
  onSuccess,
  defaultDirection = 'INCOMING',
  showDirectionPicker = true,
  title = 'Rechnungen hochladen',
}: InvoiceUploadDialogProps) {
  const [dragOver, setDragOver] = useState(false);
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [direction, setDirection] = useState<'INCOMING' | 'OUTGOING'>(defaultDirection);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasStarted = fileStates.length > 0;
  const allDone = hasStarted && fileStates.every((f) => f.status === 'done' || f.status === 'error');
  const successCount = fileStates.filter((f) => f.status === 'done').length;
  const errorCount = fileStates.filter((f) => f.status === 'error').length;

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const fileArray = Array.from(files);

    const initialStates: FileUploadState[] = fileArray.map((file) => ({
      file,
      status: 'pending' as const,
    }));
    setFileStates(initialStates);

    // Upload in batches of 5 to avoid rate limiting
    const CONCURRENCY = 5;
    for (let start = 0; start < fileArray.length; start += CONCURRENCY) {
      const batch = fileArray.slice(start, start + CONCURRENCY);
      const uploads = batch.map(async (file, batchIdx) => {
        const index = start + batchIdx;
        setFileStates((prev) =>
          prev.map((f, i) => (i === index ? { ...f, status: 'uploading' as const } : f)),
        );

        try {
          await uploadInvoiceApi(file, direction);
          setFileStates((prev) =>
            prev.map((f, i) => (i === index ? { ...f, status: 'done' as const } : f)),
          );
        } catch (err: unknown) {
          const msg =
            (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data
              ?.error?.message || 'Upload fehlgeschlagen';
          setFileStates((prev) =>
            prev.map((f, i) => (i === index ? { ...f, status: 'error' as const, error: msg } : f)),
          );
        }
      });
      await Promise.all(uploads);
    }

    onSuccess();
  }, [onSuccess, direction]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Direction selector — hide when uploads are in progress or when picker is disabled */}
        {!hasStarted && showDirectionPicker && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setDirection('INCOMING')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                direction === 'INCOMING'
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Download size={16} />
              Eingangsrechnung
            </button>
            <button
              onClick={() => setDirection('OUTGOING')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                direction === 'OUTGOING'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Upload size={16} />
              Ausgangsrechnung
            </button>
          </div>
        )}

        {/* Drop zone — hide when uploads are in progress */}
        {!hasStarted && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Upload className="mx-auto text-gray-400 mb-3" size={36} />
            <p className="text-sm font-medium text-gray-700 mb-1">
              Dateien hierher ziehen oder klicken
            </p>
            <p className="text-xs text-gray-400">PDF, JPEG, PNG, TIFF, WebP — max. 20 MB pro Datei — mehrere gleichzeitig möglich</p>
          </div>
        )}

        {/* File list with status */}
        {hasStarted && (
          <div className="space-y-2">
            {/* Summary */}
            {allDone && (
              <div className={`rounded-lg p-3 text-sm font-medium ${
                errorCount === 0 ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
              }`}>
                {errorCount === 0
                  ? `${successCount} ${successCount === 1 ? 'Rechnung' : 'Rechnungen'} erfolgreich hochgeladen`
                  : `${successCount} erfolgreich, ${errorCount} fehlgeschlagen`}
              </div>
            )}

            {/* Individual files */}
            <div className="max-h-[300px] overflow-y-auto space-y-1.5">
              {fileStates.map((fs, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                    fs.status === 'done' ? 'border-green-200 bg-green-50' :
                    fs.status === 'error' ? 'border-red-200 bg-red-50' :
                    fs.status === 'uploading' ? 'border-blue-200 bg-blue-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  {fs.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-600 shrink-0" />}
                  {fs.status === 'done' && <CheckCircle size={14} className="text-green-600 shrink-0" />}
                  {fs.status === 'error' && <XCircle size={14} className="text-red-600 shrink-0" />}
                  {fs.status === 'pending' && <Clock size={14} className="text-gray-400 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-gray-900">{fs.file.name}</p>
                    {fs.status === 'uploading' && <p className="text-xs text-blue-600">Wird hochgeladen...</p>}
                    {fs.status === 'done' && <p className="text-xs text-green-600">Erfolgreich — wird verarbeitet</p>}
                    {fs.status === 'error' && <p className="text-xs text-red-600">{fs.error}</p>}
                    {fs.status === 'pending' && <p className="text-xs text-gray-400">Wartet...</p>}
                  </div>

                  <span className="text-xs text-gray-400 shrink-0">
                    {(fs.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))}
            </div>

            {/* Close button when done */}
            {allDone && (
              <button onClick={onClose} className="btn-primary w-full text-sm mt-2">
                Schließen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
