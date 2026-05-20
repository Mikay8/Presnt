export const defaultTheme = {
  colors: {
    primary:    '#F08862',
    secondary:  '#E26B4A',
    accent:     '#E0B250',
    background: '#1A1411',
    surface:    '#251B17',
    surfaceAlt: '#2E2520',
    text:       '#FBF6EE',
    textMuted:  '#A89687',
    textSubtle: '#6E5E54',
    border:     '#2E2520',
    error:      '#DC5A4A',
    warning:    '#E0B250',
    success:    '#7BA776',
  },
  typography: {
    fontFamily: {
      regular: 'SpaceGrotesk_400Regular',
      medium:  'SpaceGrotesk_500Medium',
      bold:    'SpaceGrotesk_600SemiBold',
    },
    size: {
      xs:  11,
      sm:  13,
      md:  15,
      lg:  17,
      xl:  20,
      xxl: 26,
      h1:  32,
    },
    lineHeight: {
      tight:  1.2,
      normal: 1.5,
      loose:  1.8,
    },
  },
  spacing: {
    xs:  4,
    sm:  8,
    md:  16,
    lg:  24,
    xl:  32,
    xxl: 48,
  },
  radius: {
    sm:   6,
    md:   12,
    lg:   18,
    full: 9999,
  },
  shadow: {
    sm: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4,  shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    md: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8,  shadowOffset: { width: 0, height: 4 }, elevation: 4 },
    lg: { shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  },
};

export const lightTheme = {
  ...defaultTheme,
  colors: {
    ...defaultTheme.colors,
    primary:    '#E26B4A',
    secondary:  '#C0432C',
    accent:     '#C99432',
    background: '#FBF6EE',
    surface:    '#FFFFFF',
    surfaceAlt: '#F3EADC',
    text:       '#2A1F1A',
    textMuted:  '#8B7B6E',
    textSubtle: '#C9BFB1',
    border:     '#EDE3D4',
    error:      '#C0392B',
    warning:    '#C99432',
    success:    '#5C8A57',
  },
};

export type AppTheme = typeof defaultTheme;
