import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@buchungsai/shared';

interface AccessibleTenant {
  tenantId: string;
  name: string;
  slug: string;
  accessLevel: string;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  activeTenantId: string | null;
  accessibleTenants: AccessibleTenant[];
  setAuth: (user: UserProfile, accessToken: string, refreshToken: string) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserProfile) => void;
  setOnboardingComplete: () => void;
  setActiveTenant: (tenantId: string | null) => void;
  setAccessibleTenants: (tenants: AccessibleTenant[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      activeTenantId: null,
      accessibleTenants: [],

      setAuth: (user, accessToken, refreshToken) =>
        set({
          user,
          accessToken,
          refreshToken,
          isAuthenticated: true,
          activeTenantId: null,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (user) => set({ user }),

      setOnboardingComplete: () =>
        set((state) => ({
          user: state.user ? { ...state.user, onboardingComplete: true } : null,
        })),

      setActiveTenant: (tenantId) =>
        set({ activeTenantId: tenantId }),

      setAccessibleTenants: (tenants) =>
        set({ accessibleTenants: tenants }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          activeTenantId: null,
          accessibleTenants: [],
        }),
    }),
    {
      name: 'buchungsai-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        activeTenantId: state.activeTenantId,
      }),
    },
  ),
);
