import { create } from 'zustand';
import { defaultTheme, lightTheme, AppTheme } from '@/lib/theme';

type ColorScheme = 'dark' | 'light';

interface ThemeStore {
  theme: AppTheme;
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  setOrgBranding: (branding: Partial<AppTheme['colors']>) => void;
  reset: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: defaultTheme,
  colorScheme: 'dark',

  setColorScheme: (scheme) =>
    set({
      colorScheme: scheme,
      theme: scheme === 'light' ? lightTheme : defaultTheme,
    }),

  // Org branding from Supabase overrides color tokens at login.
  // Call this after fetching org data — resets on logout via reset().
  setOrgBranding: (branding) =>
    set((state) => ({
      theme: {
        ...state.theme,
        colors: { ...state.theme.colors, ...branding },
      },
    })),

  reset: () =>
    set((state) => ({
      theme: state.colorScheme === 'light' ? lightTheme : defaultTheme,
    })),
}));
