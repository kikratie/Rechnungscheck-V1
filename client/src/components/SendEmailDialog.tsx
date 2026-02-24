import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { sendMailApi, getMailStatusApi } from '../api/mail';
import {
  X, Send, Loader2, CheckCircle, AlertTriangle, MailWarning,
} from 'lucide-react';

interface SendEmailDialogProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  entityType?: string;
  entityId?: string;
}

export function SendEmailDialog({
  onClose,
  onSuccess,
  defaultTo = '',
  defaultSubject = '',
  defaultBody = '',
  entityType,
  entityId,
}: SendEmailDialogProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sent, setSent] = useState(false);

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['mail-status'],
    queryFn: getMailStatusApi,
    staleTime: 60_000,
  });

  const configured = statusData?.data?.configured ?? false;

  const mutation = useMutation({
    mutationFn: () => sendMailApi({ to, subject, body, entityType, entityId }),
    onSuccess: () => {
      setSent(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    },
  });

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send size={18} className="text-primary-600" />
            E-Mail senden
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Success state */}
        {sent ? (
          <div className="flex flex-col items-center py-8 text-green-600">
            <CheckCircle size={48} className="mb-3" />
            <p className="font-medium text-lg">E-Mail gesendet!</p>
            <p className="text-sm text-gray-500 mt-1">Die Nachricht wurde erfolgreich verschickt.</p>
          </div>
        ) : statusLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : !configured ? (
          /* SMTP not configured warning */
          <div className="py-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
              <MailWarning size={24} className="text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">E-Mail-Versand nicht eingerichtet</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Bitte SMTP-Einstellungen in der Server-Konfiguration hinterlegen
                  (SMTP_HOST, SMTP_USER, SMTP_PASS).
                </p>
                <p className="text-xs text-yellow-600 mt-2">
                  Unterstützt: Gmail, Outlook, eigener SMTP-Server, etc.
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={onClose} className="btn-secondary text-sm">
                Schließen
              </button>
            </div>
          </div>
        ) : (
          /* Email form */
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">An *</label>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="input-field text-sm"
                placeholder="empfaenger@example.at"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Betreff *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input-field text-sm"
                placeholder="Betreff der E-Mail"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nachricht *</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="input-field text-sm min-h-[180px] resize-y"
                placeholder="Ihre Nachricht..."
              />
            </div>

            {/* Error */}
            {mutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
                <AlertTriangle size={16} />
                {(mutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
                  || (mutation.error as Error).message
                  || 'E-Mail konnte nicht gesendet werden'}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !to.trim() || !subject.trim() || !body.trim()}
                className="btn-primary flex items-center gap-1.5 text-sm flex-1 justify-center disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Senden
              </button>
              <button
                onClick={onClose}
                disabled={mutation.isPending}
                className="btn-secondary text-sm flex-1"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
