import { useEffect } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ isOpen, onClose, title, children }: BottomSheetProps) {
  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 animate-fade-in"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up"
           style={{ paddingBottom: 'var(--safe-area-bottom)' }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Title */}
        {title && (
          <div className="px-4 pb-3 border-b border-gray-100 shrink-0">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto overscroll-contain p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
