import { Platform } from 'react-native';

const brand = {
  red: '#FF3C00',
  redDark: '#DE370C',
  yellow: '#FBE703',
  ink: '#141414',
  muted: '#757575',
  line: '#E8E8E8',
  white: '#FFFFFF',
};

export const Colors = {
  light: {
    primary: brand.red, primaryDark: brand.redDark, primaryLight: '#FFF0EA',
    background: brand.white, surface: brand.white, surfaceSecondary: '#F5F5F5',
    backgroundElement: '#F5F5F5', backgroundSelected: '#E8E8E8',
    text: brand.ink, textSecondary: '#484848', textMuted: brand.muted,
    textInverse: brand.white, border: brand.line, divider: brand.line,
    success: '#238C52', successLight: '#E8F8EF', warning: '#CA8705',
    warningLight: '#FFF5D9', error: '#D92D20', errorLight: '#FFF0EE',
    info: '#2876C7', infoLight: '#EAF4FF', icon: brand.ink,
    tabIconDefault: '#929292', tabIconSelected: brand.ink, tint: brand.red,
    link: brand.red, overlay: 'rgba(0,0,0,0.52)', disabled: '#BDBDBD',
    placeholder: '#999999', yellow: brand.yellow, red: brand.red,
  },
  dark: {
    primary: brand.red, primaryDark: brand.redDark, primaryLight: '#402019',
    background: '#090909', surface: '#171717', surfaceSecondary: '#242424',
    backgroundElement: '#242424', backgroundSelected: '#353535',
    text: '#FAFAFA', textSecondary: '#D2D2D2', textMuted: '#A5A5A5',
    textInverse: '#FFFFFF', border: '#353535', divider: '#353535',
    success: '#53CA84', successLight: '#193126', warning: '#F9C64F',
    warningLight: '#3D3118', error: '#FF7168', errorLight: '#3B1E1B',
    info: '#A4A4A4', infoLight: '#282828', icon: '#FAFAFA',
    tabIconDefault: '#999999', tabIconSelected: '#FAFAFA', tint: brand.red,
    link: '#FF7550', overlay: 'rgba(0,0,0,0.72)', disabled: '#656565',
    placeholder: '#8C8C8C', yellow: brand.yellow, red: brand.red,
  },
};
export type ThemeMode = keyof typeof Colors;
export type AppColors = (typeof Colors)[ThemeMode];
/** Color tokens shared by light and dark themes, including template components. */
export type ThemeColor = keyof AppColors;
export const Spacing = {
  none: 0, half: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20,
  xxl: 24, xxxl: 32, section: 40, screenHorizontal: 20,
  one: 4, two: 8, three: 12, four: 16, five: 20,
  six: 24, eight: 32, ten: 40,
};
export const BorderRadius = {
  none: 0, half: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, full: 999,
};
export const FontSize = {
  xs: 11, sm: 13, base: 15, md: 16, lg: 18, xl: 20,
  xxl: 24, title: 28, display: 34,
};
export const FontWeight = {
  regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800',
} as const;
export const Layout = {
  screenMaxWidth: 600, buttonHeight: 52, inputHeight: 52,
  headerHeight: 60, bottomTabHeight: 68, productCardWidth: 170,
};
export const Shadows = {
  small: Platform.select({ ios: { shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 }, default: {} }),
  medium: Platform.select({ ios: { shadowColor: '#000000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } }, android: { elevation: 5 }, default: {} }),
  large: Platform.select({ ios: { shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 9 } }, android: { elevation: 9 }, default: {} }),
};
export const Fonts = { sans: 'ReoSans-Medium', serif: 'ReoSans-Medium', rounded: 'ReoSans-Medium', mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace' };
export const MaxContentWidth = 720;
export const BottomTabInset = 96;
