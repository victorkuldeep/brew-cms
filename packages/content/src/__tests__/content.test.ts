import { describe, it, expect } from 'vitest';
import { compileContent } from '../compiler/index.js';
import { computeContentHash } from '../compiler/hasher.js';
import { sanitizeUrl } from '../parser/markdown.js';

describe('Content Kernel & IR Compiler', () => {
  const sampleMarkdown = `---
title: "The Future of Content Systems"
author: "victorkuldeep"
tags: ["architecture", "nextjs", "cms"]
featured: true
---

# The Future of Content Systems

Modern applications require **governed** and *structured* content.

> [!NOTE] Design Principle
> Revisions must be immutable and deterministic.

Here is an architectural sample:

\`\`\`typescript
interface ContentIR {
  version: string;
}
\`\`\`

- First item
- Second item

![Architecture Diagram](https://example.com/arch.png "Architecture")
`;

  it('compiles Markdown and frontmatter into structured Content IR', () => {
    const result = compileContent(sampleMarkdown);

    expect(result.frontmatter.title).toBe('The Future of Content Systems');
    expect(result.frontmatter.featured).toBe(true);
    expect(result.frontmatter.tags).toEqual(['architecture', 'nextjs', 'cms']);

    expect(result.contentIr.version).toBe('1.0.0');
    expect(result.contentIr.nodes).toHaveLength(7);

    // Node 0: Heading
    expect(result.contentIr.nodes[0]).toMatchObject({
      type: 'heading',
      level: 1,
      text: 'The Future of Content Systems',
      id: 'the-future-of-content-systems',
    });

    // Node 1: Paragraph
    expect(result.contentIr.nodes[1].type).toBe('paragraph');

    // Node 2: Callout
    expect(result.contentIr.nodes[2]).toMatchObject({
      type: 'callout',
      variant: 'note',
      title: 'Design Principle',
    });

    // Node 4: Code block
    expect(result.contentIr.nodes[4]).toMatchObject({
      type: 'codeBlock',
      language: 'typescript',
    });
  });

  it('produces deterministic SHA-256 content hashes', () => {
    const run1 = compileContent(sampleMarkdown);
    const run2 = compileContent(sampleMarkdown);

    expect(run1.contentHash).toBe(run2.contentHash);
    expect(run1.contentHash).toMatch(/^[a-f0-9]{64}$/);

    // Changing frontmatter order does not affect hash (canonical sorting)
    const hashA = computeContentHash({ b: 2, a: 1 });
    const hashB = computeContentHash({ a: 1, b: 2 });
    expect(hashA).toBe(hashB);
  });

  it('accurately calculates word counts and reading times', () => {
    const result = compileContent(sampleMarkdown);

    expect(result.wordCount).toBeGreaterThan(15);
    expect(result.readingTimeSeconds).toBeGreaterThan(0);
    expect(result.searchText).toContain('The Future of Content Systems');
    expect(result.searchText).toContain('Revisions must be immutable');
  });

  it('safely renders HTML and sanitizes unsafe javascript: URLs', () => {
    const malicious = `[Click me](javascript:alert('pwned'))`;
    const result = compileContent(malicious);

    expect(result.html).not.toContain('javascript:alert');
    expect(result.html).toContain('#unsafe-url-blocked');

    const sanitized = sanitizeUrl('javascript:evil()');
    expect(sanitized).toBe('#unsafe-url-blocked');
  });
});
