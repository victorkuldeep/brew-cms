import type {
  ContentNode,
  HeadingNode,
  ParagraphNode,
  CodeBlockNode,
  BlockquoteNode,
  CalloutNode,
  ListNode,
  ImageNode,
  DividerNode,
  InlineNode,
  InlineTextNode,
  InlineLinkNode,
} from '../ir/schema.js';

export function parseMarkdownToNodes(markdown: string): ContentNode[] {
  const nodes: ContentNode[] = [];
  const lines = markdown.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      i++;
      continue;
    }

    // 1. Code block fence
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      const codeBlock: CodeBlockNode = {
        type: 'codeBlock',
        code: codeLines.join('\n'),
        language: lang,
      };
      nodes.push(codeBlock);
      continue;
    }

    // 2. Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2].trim();
      const id = slugify(text);
      const heading: HeadingNode = {
        type: 'heading',
        level,
        text,
        id,
      };
      nodes.push(heading);
      i++;
      continue;
    }

    // 3. Dividers
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      const divider: DividerNode = { type: 'divider' };
      nodes.push(divider);
      i++;
      continue;
    }

    // 4. Standalone Image
    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      const src = sanitizeUrl(imageMatch[2].trim());
      const title = imageMatch[3];
      const imageNode: ImageNode = {
        type: 'image',
        src,
        alt,
        title,
      };
      nodes.push(imageNode);
      i++;
      continue;
    }

    // 5. Callouts & Blockquotes
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const combinedText = quoteLines.join('\n');

      // Check GitHub callout syntax: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
      const calloutMatch = combinedText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s+(.*))?\n?([\s\S]*)$/i);
      if (calloutMatch) {
        const variant = calloutMatch[1].toLowerCase() as
          | 'note'
          | 'tip'
          | 'important'
          | 'warning'
          | 'caution';
        const title = calloutMatch[2]?.trim() || undefined;
        const bodyText = calloutMatch[3]?.trim() || '';
        const callout: CalloutNode = {
          type: 'callout',
          variant,
          title,
          text: bodyText,
        };
        nodes.push(callout);
      } else {
        const blockquote: BlockquoteNode = {
          type: 'blockquote',
          text: combinedText,
        };
        nodes.push(blockquote);
      }
      continue;
    }

    // 6. Lists (ordered or unordered)
    const isOrdered = /^\d+\.\s+/.test(trimmed);
    const isUnordered = /^[-*+]\s+/.test(trimmed);
    if (isOrdered || isUnordered) {
      const listItems: { type: 'listItem'; text: string }[] = [];
      const listRegex = isOrdered ? /^\d+\.\s+(.*)$/ : /^[-*+]\s+(.*)$/;

      while (i < lines.length) {
        const currTrim = lines[i].trim();
        const match = currTrim.match(listRegex);
        if (match) {
          listItems.push({ type: 'listItem', text: match[1].trim() });
          i++;
        } else if (currTrim === '') {
          // Check if next non-empty line continues list
          let nextIdx = i + 1;
          while (nextIdx < lines.length && lines[nextIdx].trim() === '') nextIdx++;
          if (nextIdx < lines.length && listRegex.test(lines[nextIdx].trim())) {
            i = nextIdx;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      const listNode: ListNode = {
        type: 'list',
        ordered: isOrdered,
        items: listItems,
      };
      nodes.push(listNode);
      continue;
    }

    // 7. Regular paragraph (accumulate multi-line paragraphs until empty line)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().match(/^(\*{3,}|-{3,}|_{3,})$/) &&
      !lines[i].trim().match(/^(\d+\.|[-*+])\s+/)
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      const fullText = paraLines.join(' ');
      const inlines = parseInlines(fullText);
      const paragraph: ParagraphNode = {
        type: 'paragraph',
        children: inlines,
      };
      nodes.push(paragraph);
    }
  }

  return nodes;
}

export function parseInlines(text: string): InlineNode[] {
  const inlines: InlineNode[] = [];
  // Tokenize links and formatting
  // Link regex: [text](href "title")
  const linkRegex = /\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      inlines.push(...parseInlineFormatting(beforeText));
    }

    const linkText = match[1];
    const rawHref = match[2];
    const title = match[3];
    const safeHref = sanitizeUrl(rawHref);

    const linkNode: InlineLinkNode = {
      type: 'link',
      href: safeHref,
      title,
      children: [{ type: 'text', value: linkText }],
    };
    inlines.push(linkNode);

    lastIndex = linkRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    inlines.push(...parseInlineFormatting(text.slice(lastIndex)));
  }

  return inlines.length > 0 ? inlines : [{ type: 'text', value: text }];
}

function parseInlineFormatting(text: string): InlineTextNode[] {
  // Simplified inline parser for bold (**), italic (*), code (`)
  if (!text) return [];

  // Plain text fallback if no markdown delimiters
  if (!text.includes('*') && !text.includes('`') && !text.includes('~')) {
    return [{ type: 'text', value: text }];
  }

  // Tokenize based on `code`, **bold**, *italic*
  const tokens: InlineTextNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push({ type: 'text', value: token.slice(1, -1), code: true });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push({ type: 'text', value: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push({ type: 'text', value: token.slice(1, -1), italic: true });
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      tokens.push({ type: 'text', value: token.slice(2, -2), strikethrough: true });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return tokens;
}

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  // Reject unsafe schemes: javascript:, vbscript:, data:
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    (lower.startsWith('data:') && !lower.startsWith('data:image/'))
  ) {
    return '#unsafe-url-blocked';
  }
  return trimmed;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
