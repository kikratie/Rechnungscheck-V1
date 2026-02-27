import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listInvoicesApi, uploadInvoiceApi, deleteInvoiceApi } from '../api/invoices';
import type { InvoiceListItem } from '@buchungsai/shared';
import { Inbox, Upload, Download, Trash2, Loader2, FileText, AlertCircle, ArrowUpRight, Mail, CheckCircle, XCircle, AlertTriangle, Clock, Eye } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import toast from 'react-hot-toast';

// All statuses that count as "open" (not yet archived/reconciled/exported)
const INBOX_STATUSES = 'INBOX,UPLOADED,PROCESSING,PROCESSED,REVIEW_REQUIRED,PENDING_CORRECTION,ERROR';

export function InboxPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadDirection, setUploadDirection] = useState<'INCOMING' | 'OUTGOING'>('INCOMING');

  const { data, isLoading } = useQuery({
    queryKey: ['inbox-invoices'],
    queryFn: () => listInvoicesApi({ processingStatus: INBOX_STATUSES, limit: 100, sortBy: 'createdAt', sortOrder: 'desc' }),
    refetchInterval: (query) => {
      const items = query.state.data?.data;
      if (!items) return false;
      const hasProcessing = items.some(
        (inv: { processingStatus: string }) =>
          inv.processingStatus === 'UPLOADED' || inv.processingStatus === 'PROCESSING',
      );
      return hasProcessing ? 3000 : false;
    },
  });

  const invoices = (data?.data ?? []) as InvoiceListItem[];

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadInvoiceApi(file, uploadDirection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-invoices'] });
      toast.success(uploadDirection === 'INCOMING' ? 'Eingangsrechnung hochgeladen' : 'Ausgangsrechnung hochgeladen');
    },
    onError: (err: unknown) => {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Upload fehlgeschlagen'
        : 'Upload fehlgeschlagen';
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteInvoiceApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-invoices'] });
      toast.success('Beleg gelöscht');
    },
    onError: () => toast.error('Löschen fehlgeschlagen'),
  });

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const statusLabels: Record<string, string> = {
    INBOX: 'Eingang',
    UPLOADED: 'Warteschlange',
    PROCESSING: 'Verarbeitung…',
    PROCESSED: 'Verarbeitet',
    REVIEW_REQUIRED: 'Review nötig',
    PENDING_CORRECTION: 'Korrektur nötig',
    ERROR: 'Fehler',
  };
  const statusLabel = (status: string) => statusLabels[status] || status;

  const statusColor = (status: string) => {
    switch (status) {
      case 'INBOX': return 'bg-blue-100 text-blue-700';
      case 'UPLOADED': return 'bg-gray-100 text-gray-700';
      case 'PROCESSING': return 'bg-yellow-100 text-yellow-700';
      case 'PROCESSED': return 'bg-green-100 text-green-700';
      case 'REVIEW_REQUIRED': return 'bg-orange-100 text-orange-700';
      case 'PENDING_CORRECTION': return 'bg-red-100 text-red-700';
      case 'ERROR': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const validationIcon = (status: string | null | undefined) => {
    switch (status) {
      case 'VALID': return <CheckCircle size={16} className="text-green-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-yellow-500" />;
      case 'INVALID': return <XCircle size={16} className="text-red-500" />;
      case 'PENDING': return <Clock size={16} className="text-gray-400" />;
      default: return null;
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rechnungseingang</h1>
        <p className="text-gray-500 mt-1">Belege sammeln und zur Prüfung weiterleiten</p>
      </div>

      {/* Direction Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setUploadDirection('INCOMING')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
            uploadDirection === 'INCOMING'
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <Download size={16} />
          Eingangsrechnung
        </button>
        <button
          onClick={() => setUploadDirection('OUTGOING')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
            uploadDirection === 'OUTGOING'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}
        >
          <ArrowUpRight size={16} />
          Ausgangsrechnung
        </button>
      </div>

      {/* Upload Area */}
      <div
        className={`card p-8 mb-6 border-2 border-dashed text-center transition-colors cursor-pointer ${
          isDragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.pdf,.jpg,.jpeg,.png';
          input.multiple = true;
          input.onchange = () => handleFiles(input.files);
          input.click();
        }}
      >
        {uploadMutation.isPending ? (
          <Loader2 size={32} className="mx-auto text-primary-500 animate-spin mb-2" />
        ) : (
          <Upload size={32} className="mx-auto text-gray-400 mb-2" />
        )}
        <p className="font-medium text-gray-700">
          {uploadMutation.isPending ? 'Wird hochgeladen...' : 'Belege hier ablegen oder klicken'}
        </p>
        <p className="text-sm text-gray-500 mt-1">PDF, JPG oder PNG</p>
      </div>

      {/* Invoice List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Inbox size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Kein Beleg im Eingang</p>
          <p className="text-sm mt-1">Laden Sie Belege hoch oder leiten Sie sie per E-Mail weiter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="card p-4 cursor-pointer hover:ring-2 hover:ring-primary-300 transition-shadow"
              onClick={() => navigate(`/invoices?id=${inv.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  {inv.processingStatus === 'ERROR' ? (
                    <AlertCircle size={20} className="text-red-500" />
                  ) : inv.processingStatus === 'PROCESSING' || inv.processingStatus === 'UPLOADED' ? (
                    <Loader2 size={20} className="text-yellow-500 animate-spin" />
                  ) : (
                    validationIcon(inv.validationStatus) || <FileText size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {inv.direction === 'OUTGOING' ? (inv.customerName || inv.originalFileName) : (inv.vendorName || inv.originalFileName)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      inv.direction === 'OUTGOING' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {inv.direction === 'OUTGOING' ? 'AR' : 'ER'}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusColor(inv.processingStatus)}`}>
                      {statusLabel(inv.processingStatus)}
                    </span>
                    <span className="text-xs text-gray-400">
                      BEL-{inv.belegNr}
                    </span>
                    {inv.ingestionChannel === 'EMAIL' && (
                      <span className="text-xs text-purple-600 flex items-center gap-0.5" title={inv.emailSender ?? ''}>
                        <Mail size={10} /> E-Mail
                      </span>
                    )}
                    {inv.grossAmount && (
                      <span className="text-xs font-medium text-gray-700">
                        {parseFloat(inv.grossAmount).toLocaleString('de-AT', { style: 'currency', currency: inv.currency || 'EUR' })}
                      </span>
                    )}
                  </div>
                </div>
                {!isMobile && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(inv.createdAt).toLocaleDateString('de-AT')}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/invoices?id=${inv.id}`);
                  }}
                  className="p-1.5 text-gray-400 hover:text-primary-600 rounded transition-colors shrink-0"
                  title="Öffnen"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Beleg wirklich löschen?')) {
                      deleteMutation.mutate(inv.id);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors shrink-0"
                  title="Löschen"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
