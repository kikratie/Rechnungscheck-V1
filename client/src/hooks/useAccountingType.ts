import { useAuthStore } from '../store/authStore';
import type { AccountingTypeValue } from '@buchungsai/shared';

export function useAccountingType(): AccountingTypeValue {
  const user = useAuthStore((state) => state.user);
  return user?.accountingType || 'EA';
}
