import { useAuthStore } from '../store/authStore';

export function useFeatureVisible(moduleKey: string): boolean {
  const { user } = useAuthStore();
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.role === 'TAX_ADVISOR') return true;
  return user.featureVisibility?.[moduleKey as keyof typeof user.featureVisibility] ?? true;
}

/**
 * Returns a filter function that checks feature visibility for navigation items.
 * Items without a featureKey are always visible.
 */
export function useFeatureFilter() {
  const { user } = useAuthStore();

  return (featureKey?: string): boolean => {
    if (!featureKey) return true;
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    if (user.role === 'TAX_ADVISOR') return true;
    return user.featureVisibility?.[featureKey as keyof typeof user.featureVisibility] ?? true;
  };
}
