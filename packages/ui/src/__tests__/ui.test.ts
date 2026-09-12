import { describe, it, expect } from 'vitest';
import { generateCssVariables, defaultBrewCmsTheme, cn } from '../index.js';

describe('BrewCMS Design System UI Tokens', () => {
  it('generates standard CSS variables for default theme', () => {
    const css = generateCssVariables(defaultBrewCmsTheme);
    expect(css).toContain('--color-canvas: #F5F1E8');
    expect(css).toContain('--color-surface: #FBF9F4');
    expect(css).toContain('--color-ink: #191817');
    expect(css).toContain('--color-accent: #9A7653');
  });

  it('merges tailwind class names correctly', () => {
    const className = cn('p-4 text-sm', false && 'hidden', 'p-6');
    expect(className).toBe('text-sm p-6');
  });
});
