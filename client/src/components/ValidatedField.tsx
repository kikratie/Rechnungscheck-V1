import { useState, useRef } from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { CHECK_TO_FIELDS } from '@buchungsai/shared';
import type { ValidationCheck, TrafficLightStatus } from '@buchungsai/shared';

// Build inverted map: field name → check rule IDs
const FIELD_TO_CHECKS: Record<string, string[]> = {};
for (const [rule, fields] of Object.entries(CHECK_TO_FIELDS)) {
  for (const field of fields) {
    if (!FIELD_TO_CHECKS[field]) FIELD_TO_CHECKS[field] = [];
    FIELD_TO_CHECKS[field].push(rule);
  }
}

const STATUS_PRIORITY: Record<TrafficLightStatus, number> = {
  RED: 0, YELLOW: 1, GREEN: 2, GRAY: 3,
};

function getFieldStatus(
  fieldName: string,
  checks: ValidationCheck[],
): { status: TrafficLightStatus | null; relevantChecks: ValidationCheck[] } {
  const relevantRules = FIELD_TO_CHECKS[fieldName] || [];
  const relevantChecks = checks.filter(c => relevantRules.includes(c.rule));

  if (relevantChecks.length === 0) return { status: null, relevantChecks: [] };

  const worstStatus = relevantChecks.reduce<TrafficLightStatus>((worst, check) => {
    return STATUS_PRIORITY[check.status] < STATUS_PRIORITY[worst] ? check.status : worst;
  }, 'GRAY');

  return { status: worstStatus, relevantChecks };
}

const statusStyles: Record<TrafficLightStatus, string> = {
  GREEN: 'bg-green-50 border-l-2 border-green-500',
  YELLOW: 'bg-yellow-50 border-l-2 border-yellow-500',
  RED: 'bg-red-50 border-l-2 border-red-500',
  GRAY: 'bg-gray-50 border-l-2 border-gray-300',
};

const statusIcons: Record<TrafficLightStatus, React.ReactNode> = {
  GREEN: <CheckCircle size={12} className="text-green-600 shrink-0" />,
  YELLOW: <AlertTriangle size={12} className="text-yellow-600 shrink-0" />,
  RED: <XCircle size={12} className="text-red-600 shrink-0" />,
  GRAY: null,
};

interface ValidatedFieldProps {
  label: string;
  value: string | null;
  fieldName: string;
  checks: ValidationCheck[];
  className?: string;
}

export function ValidatedField({ label, value, fieldName, checks, className = '' }: ValidatedFieldProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const { status, relevantChecks } = getFieldStatus(fieldName, checks);

  // No validation for this field — render plain
  if (!status) {
    return (
      <div className={`flex justify-between text-sm py-1.5 px-2 ${className}`}>
        <dt className="text-gray-500">{label}</dt>
        <dd className="text-right font-medium text-gray-900">{value || '—'}</dd>
      </div>
    );
  }

  return (
    <div
      className={`relative flex justify-between items-center text-sm py-1.5 px-2 rounded-r cursor-pointer transition-colors ${statusStyles[status]} ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(prev => !prev)}
    >
      <dt className="text-gray-500 flex items-center gap-1.5">
        {statusIcons[status]}
        {label}
      </dt>
      <dd className="text-right font-medium text-gray-900">{value || '—'}</dd>

      {/* Tooltip with check details */}
      {showTooltip && relevantChecks.length > 0 && (
        <div
          ref={tooltipRef}
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px] max-w-[360px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-1.5">
            {relevantChecks.map((check, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {check.status === 'GREEN' ? <CheckCircle size={12} className="text-green-600 shrink-0 mt-0.5" /> :
                 check.status === 'YELLOW' ? <AlertTriangle size={12} className="text-yellow-600 shrink-0 mt-0.5" /> :
                 check.status === 'RED' ? <XCircle size={12} className="text-red-600 shrink-0 mt-0.5" /> :
                 null}
                <div className="flex-1 min-w-0">
                  <span className="text-gray-700">{check.message}</span>
                  {check.legalBasis && (
                    <span className="text-gray-400 ml-1">({check.legalBasis})</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Export getFieldStatus for use in InvoiceSplitView */
export { getFieldStatus, FIELD_TO_CHECKS };
