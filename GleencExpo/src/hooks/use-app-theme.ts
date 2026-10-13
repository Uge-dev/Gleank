import { LiveContext } from '@/features/live/state';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { useContext } from 'react';
import { AccountContext } from '@/features/account/account-state';
import { useColorScheme } from './use-color-scheme';
import { BorderRadius, Colors, FontSize, FontWeight, Layout, Shadows, Spacing, type ThemeMode, } from '@/constants/theme';
export function useAppTheme() {
    const systemColorScheme = useColorScheme();
    const account = useContext(AccountContext);
    const live = useContext(LiveContext);
    const setting = !FRONTEND_PREVIEW ? live?.account?.settings?.theme : account?.preferences.appearance;
    const appearance: 'system'|'light'|'dark' = setting === 'dark' || setting === 'light' ? setting : 'system';
    const mode: ThemeMode = appearance === 'system' ? (systemColorScheme === 'dark' ? 'dark' : 'light') : appearance;
    return {
        mode,
        isDark: mode === 'dark',
        colors: Colors[mode],
        spacing: Spacing,
        borderRadius: BorderRadius,
        fontSize: FontSize,
        fontWeight: FontWeight,
        layout: Layout,
        shadows: Shadows,
    };
}
export type AppTheme = ReturnType<typeof useAppTheme>;
