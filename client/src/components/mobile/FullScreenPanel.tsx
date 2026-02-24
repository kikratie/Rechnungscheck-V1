import { useEffect, useRef } from 'react';
import { ChevronLeft, X } from 'lucide-react';

interface FullScreenPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function FullScreenPanel({ isOpen, onClose, title, children }: FullScreenPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Close on back button (Android)
  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      onClose();
    };

    window.history.pushState({ fullScreenPanel: true }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b border-gray-200 bg-white shrink-0"
           style={{ minHeight: '56px', paddingTop: 'var(--safe-area-top)' }}>
        <button
          onClick={onClose}
          className="touch-target text-gray-600"
          aria-label="Zurück"
        >
          <ChevronLeft size={24} />
        </button>
        {title && (
          <h2 className="text-base font-semibold text-gray-900 truncate flex-1 text-center mx-2">
            {title}
          </h2>
        )}
        <button
          onClick={onClose}
          className="touch-target text-gray-400"
          aria-label="Schließen"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}
