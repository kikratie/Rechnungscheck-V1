import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, RefreshCw, Download, ExternalLink } from 'lucide-react';
import { getInvoiceDownloadUrl } from '../api/invoices';

interface DocumentViewerProps {
  invoiceId: string;
  mimeType?: string;
  originalFileName?: string;
  className?: string;
}

const URL_REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes (URLs expire after 1 hour)

export function DocumentViewer({ invoiceId, mimeType, originalFileName, className = '' }: DocumentViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const isPdf = mimeType?.startsWith('application/pdf')
    || originalFileName?.toLowerCase().endsWith('.pdf');
  const isTiff = mimeType === 'image/tiff'
    || originalFileName?.toLowerCase().endsWith('.tiff')
    || originalFileName?.toLowerCase().endsWith('.tif');
  const isImage = !isPdf && !isTiff && (
    mimeType?.startsWith('image/')
    || /\.(jpe?g|png|webp)$/i.test(originalFileName || '')
  );

  const fetchUrl = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await getInvoiceDownloadUrl(invoiceId, true);
      if (resp.data?.url) {
        setUrl(resp.data.url);
      } else {
        setError('Dokument-URL nicht verfügbar');
      }
    } catch {
      setError('Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchUrl();

    // Auto-refresh before URL expires
    refreshTimerRef.current = setInterval(() => {
      fetchUrl();
    }, URL_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchUrl]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <Loader2 className="animate-spin text-primary-600 mx-auto mb-2" size={32} />
          <p className="text-sm text-gray-500">Dokument wird geladen…</p>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <AlertCircle className="text-red-400 mx-auto mb-2" size={32} />
          <p className="text-sm text-red-600 mb-3">{error || 'Kein Dokument verfügbar'}</p>
          <button
            onClick={fetchUrl}
            className="btn-secondary text-sm inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  // TIFF: browsers can't display, offer download/open externally
  if (isTiff) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 ${className}`}>
        <div className="text-center">
          <Download className="text-gray-400 mx-auto mb-2" size={32} />
          <p className="text-sm text-gray-600 mb-1">TIFF-Datei kann nicht im Browser angezeigt werden</p>
          <p className="text-xs text-gray-400 mb-3">{originalFileName}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-sm inline-flex items-center gap-1.5"
          >
            <ExternalLink size={14} />
            Extern öffnen
          </a>
        </div>
      </div>
    );
  }

  // PDF: embed with iframe (navpanes=0 hides thumbnail sidebar, view=FitH fits width)
  if (isPdf) {
    const pdfUrl = `${url}#navpanes=0&view=FitH`;
    return (
      <iframe
        src={pdfUrl}
        className={`border-0 ${className}`}
        style={{ width: '100%', height: '100%' }}
        title={originalFileName || 'Dokument'}
      />
    );
  }

  // Image: display with object-contain
  if (isImage) {
    return (
      <div className={`overflow-auto bg-gray-100 ${className}`}>
        <img
          src={url}
          alt={originalFileName || 'Dokument'}
          className="max-w-full h-auto mx-auto"
          style={{ objectFit: 'contain' }}
        />
      </div>
    );
  }

  // Unknown format: open externally
  return (
    <div className={`flex items-center justify-center bg-gray-50 ${className}`}>
      <div className="text-center">
        <p className="text-sm text-gray-600 mb-3">Vorschau nicht verfügbar</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm inline-flex items-center gap-1.5"
        >
          <ExternalLink size={14} />
          Extern öffnen
        </a>
      </div>
    </div>
  );
}
