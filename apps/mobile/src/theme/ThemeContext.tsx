import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';
import { useAppStore, type ThemePreference } from '../stores/appStore';
import { colorsForScheme, type AppColors } from './colors';

export type ResolvedScheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ResolvedScheme;
  colors: AppColors;
  isDark: boolean;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveScheme(
  preference: ThemePreference,
  system: ColorSchemeName
): ResolvedScheme {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  return system === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme() ?? 'dark'
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'dark');
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveScheme(preference, systemScheme);
    return {
      preference,
      scheme,
      colors: colorsForScheme(scheme),
      isDark: scheme === 'dark',
      setPreference: setThemePreference,
    };
  }, [preference, systemScheme, setThemePreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      preference: 'system',
      scheme: 'dark',
      colors: colorsForScheme('dark'),
      isDark: true,
      setPreference: () => undefined,
    };
  }
  return ctx;
}

export function useThemeColors(): AppColors {
  return useTheme().colors;
}
