export interface ColorTokens {
  canvas: string;
  surface: string;
  surfaceStrong: string;
  ink: string;
  inkSoft: string;
  muted: string;
  line: string;
  accent: string;
  accentSoft: string;
  white: string;
}

export interface BrewTheme {
  name: string;
  colors: ColorTokens;
}

export const defaultBrewCmsTheme: BrewTheme = {
  name: 'default',
  colors: {
    canvas: '#F5F1E8',
    surface: '#FBF9F4',
    surfaceStrong: '#EFE9DD',
    ink: '#191817',
    inkSoft: '#4F4B45',
    muted: '#77736C',
    line: '#D8D1C5',
    accent: '#9A7653',
    accentSoft: '#C9B39A',
    white: '#FFFFFF',
  },
};

export const coffeeDiscussionsTheme: BrewTheme = {
  name: 'coffee-discussions',
  colors: {
    canvas: '#F5F1E8',
    surface: '#FBF9F4',
    surfaceStrong: '#EFE9DD',
    ink: '#191817',
    inkSoft: '#4F4B45',
    muted: '#77736C',
    line: '#D8D1C5',
    accent: '#9A7653',
    accentSoft: '#C9B39A',
    white: '#FFFFFF',
  },
};

export const victorKuldeepTheme: BrewTheme = {
  name: 'victor-kuldeep',
  colors: {
    canvas: '#F7F6F2',
    surface: '#FCFBF9',
    surfaceStrong: '#EFECE6',
    ink: '#181716',
    inkSoft: '#4B4845',
    muted: '#78746F',
    line: '#D9D5CC',
    accent: '#8B6F55',
    accentSoft: '#BFABA0',
    white: '#FFFFFF',
  },
};

export function generateCssVariables(theme: BrewTheme = defaultBrewCmsTheme): string {
  const { colors } = theme;
  return `
    --color-canvas: ${colors.canvas};
    --color-surface: ${colors.surface};
    --color-surface-strong: ${colors.surfaceStrong};
    --color-ink: ${colors.ink};
    --color-ink-soft: ${colors.inkSoft};
    --color-muted: ${colors.muted};
    --color-line: ${colors.line};
    --color-accent: ${colors.accent};
    --color-accent-soft: ${colors.accentSoft};
    --color-white: ${colors.white};
  `.trim();
}
