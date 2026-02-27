import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { DocumentViewer } from './DocumentViewer';

interface InvoiceSplitViewProps {
  invoiceId: string;
  mimeType?: string;
  originalFileName?: string;
  onBack: () => void;
  /** Header content: badges, action buttons */
  headerContent?: React.ReactNode;
  /** Right panel content: InvoiceDetailContent */
  children: React.ReactNode;
}

export function InvoiceSplitView({
  invoiceId,
  mimeType,
  originalFileName,
  onBack,
  headerContent,
  children,
}: InvoiceSplitViewProps) {
  // Escape key to go back
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onBack();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Zurück zur Liste
        </button>
        {headerContent && (
          <div className="flex items-center gap-2 ml-auto">
            {headerContent}
          </div>
        )}
      </div>

      {/* Split content */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Document viewer (60%) */}
        <div className="w-3/5 border-r border-gray-200 bg-gray-100">
          <DocumentViewer
            invoiceId={invoiceId}
            mimeType={mimeType}
            originalFileName={originalFileName}
            className="h-full"
          />
        </div>

        {/* Right: Data panel (40%) */}
        <div className="w-2/5 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
