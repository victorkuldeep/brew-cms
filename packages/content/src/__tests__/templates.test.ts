import { describe, it, expect } from 'vitest';
import { getTemplate, listTemplates } from '../templates/library.js';
import { renderSkeleton } from '../templates/skeleton.js';
import { validateDocument } from '../templates/validate.js';
import { TEMPLATE_LIBRARY_VERSION } from '../templates/types.js';

describe('content templates', () => {
  it('ships five versioned templates', () => {
    expect(TEMPLATE_LIBRARY_VERSION).toBe('1.0.0');
    expect(listTemplates().map((t) => t.kind).sort()).toEqual(
      ['case-study', 'essay', 'journal', 'research-paper', 'whitepaper']
    );
  });

  it('whitepaper follows executive order with required gates', () => {
    const t = getTemplate('whitepaper')!;
    expect(t.sections.map((s) => s.id)).toEqual(
      ['abstract', 'outcomes', 'problem', 'approach', 'evidence', 'limitations', 'references']
    );
    expect(t.sections.filter((s) => s.required).map((s) => s.id).sort()).toEqual(
      ['abstract', 'outcomes', 'problem', 'references']
    );
  });

  it('skeleton contains every section heading plus guidance', () => {
    const out = renderSkeleton(getTemplate('research-paper')!, 'My Study');
    for (const h of ['## Abstract', '## Introduction', '## Method', '## Results', '## Discussion', '## References']) {
      expect(out).toContain(h);
    }
    expect(out).toContain('template: "research-paper"');
  });

  it('essay requires nothing but a title', () => {
    const out = validateDocument(getTemplate('essay')!, '---\ntitle: "Notes"\n---\n\nFreeform text.\n');
    expect(out.ok).toBe(true);
  });

  it('rejects whitepapers missing required sections', () => {
    const out = validateDocument(
      getTemplate('whitepaper')!,
      '---\ntitle: "Thin"\n---\n\n## Abstract\n\nSomething.\n'
    );
    expect(out.ok).toBe(false);
    expect(out.missing).toContain('outcomes');
    expect(out.missing).toContain('problem');
    expect(out.missing).toContain('references');
  });

  it('accepts aliases and rejects blank required sections', () => {
    const base = (refs: string) =>
      '---\ntitle: "Full"\n---\n\n## Abstract\n\nReal content here.\n\n## Outcomes\n\n- one\n\n## Problem\n\nHard.\n\n## References\n\n' +
      refs +
      '\n';
    const good = validateDocument(getTemplate('whitepaper')!, base('[1] A source https://example.com\n'));
    expect(good.ok).toBe(true);
    const blankRefs = validateDocument(getTemplate('whitepaper')!, base(''));
    expect(blankRefs.ok).toBe(false);
    expect(blankRefs.missing).toContain('references:blank');
  });

  it('treats skeleton guidance comments as blank', () => {
    const skeleton = renderSkeleton(getTemplate('whitepaper')!, 'Draft');
    const out = validateDocument(getTemplate('whitepaper')!, skeleton);
    expect(out.ok).toBe(false);
    expect(out.missing).toContain('abstract:blank');
  });

  it('rejects title-less documents', () => {
    const out = validateDocument(getTemplate('journal')!, '## Log\n\nDid things.\n');
    expect(out.ok).toBe(false);
    expect(out.missing).toContain('frontmatter.title');
  });

  it('returns undefined for unknown kinds', () => {
    expect(getTemplate('thesis')).toBeUndefined();
  });
});
