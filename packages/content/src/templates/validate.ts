import { parseMarkdownToNodes } from '../parser/markdown.js';
import { extractFrontmatter } from '../parser/frontmatter.js';
import type { ContentTemplate } from './types.js';

export interface TemplateValidation {
  ok: boolean;
  /** Required sections missing or blank, e.g. `abstract`. */
  missing: string[];
  /** Non-blocking notes, e.g. optional sections absent. */
  warnings: string[];
}

function normalizeHeading(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Plain text of a parsed node (headings excluded by the caller). */
const STRUCTURAL_KEYS = new Set(['type', 'id', 'level']);
function nodeText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeText).join(' ');
  if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (typeof rec.value === 'string') return rec.value;
    return Object.entries(rec)
      .filter(([k]) => !STRUCTURAL_KEYS.has(k))
      .map(([, v]) => nodeText(v))
      .join(' ');
  }
  return '';
}

function withoutComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, '').trim();
}

/**
 * Validates a markdown document against a template using the package's own
 * parser (no regex heading hacks). A required section passes when its H2
 * exists and the body beneath it is non-blank.
 */
export function validateDocument(
  template: ContentTemplate,
  markdown: string
): TemplateValidation {
  const missing: string[] = [];
  const warnings: string[] = [];

  const { data: frontmatter, content: body } = extractFrontmatter(markdown);
  if (!frontmatter.title || String(frontmatter.title).trim() === '') {
    missing.push('frontmatter.title');
  }
  for (const key of template.requiredFrontmatter) {
    const value = frontmatter[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(`frontmatter.${key}`);
    }
  }

  let nodes;
  try {
    nodes = parseMarkdownToNodes(body);
  } catch {
    return { ok: false, missing: ['unparseable-markdown'], warnings: [] };
  }

  // Map normalized H2 text -> body text beneath it.
  const bodies = new Map<string, string>();
  let current: string | null = null;
  let currentParts: string[] = [];
  const flush = () => {
    if (current !== null) bodies.set(current, currentParts.join('\n'));
  };
  for (const node of nodes) {
    if (node.type === 'heading' && (node as { level: number }).level === 2) {
      flush();
      current = normalizeHeading((node as { text: string }).text);
      currentParts = [];
    } else if (current !== null) {
      currentParts.push(nodeText(node));
    }
  }
  flush();

  const hasSection = (heading: string, aliases: string[]): boolean => {
    const want = [heading, ...aliases].map(normalizeHeading);
    return want.some((w) => bodies.has(w));
  };
  const sectionBlank = (heading: string, aliases: string[]): boolean => {
    const want = [heading, ...aliases].map(normalizeHeading);
    for (const w of want) {
      // A body of only HTML comments (skeleton guidance) counts as blank.
      if (withoutComments(bodies.get(w) ?? '') !== '') return false;
    }
    return true;
  };

  for (const section of template.sections) {
    const present = hasSection(section.heading, section.aliases);
    if (!present) {
      (section.required ? missing : warnings).push(
        section.required ? section.id : `optional:${section.id}`
      );
      continue;
    }
    if (section.required && sectionBlank(section.heading, section.aliases)) {
      missing.push(`${section.id}:blank`);
    }
  }

  // Journal contract: dated non-empty content (no required sections by design).
  if (template.kind === 'journal') {
    const text = body.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (text.length === 0) missing.push('journal:empty');
  }

  return { ok: missing.length === 0, missing, warnings };
}
