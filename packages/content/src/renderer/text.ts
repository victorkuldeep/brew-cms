import type { ContentIR, ContentNode, InlineNode } from '../ir/schema.js';

export function extractSearchText(ir: ContentIR): string {
  const parts: string[] = [];

  for (const node of ir.nodes) {
    extractNodeText(node, parts);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function extractNodeText(node: ContentNode, parts: string[]): void {
  switch (node.type) {
    case 'heading':
      parts.push(node.text);
      break;

    case 'paragraph':
      for (const child of node.children) {
        extractInlineText(child, parts);
      }
      break;

    case 'blockquote':
    case 'callout':
      if (node.type === 'callout' && node.title) {
        parts.push(node.title);
      }
      parts.push(node.text);
      break;

    case 'list':
      for (const item of node.items) {
        parts.push(item.text);
      }
      break;

    case 'codeBlock':
      parts.push(node.code);
      break;

    case 'image':
      if (node.alt) parts.push(node.alt);
      if (node.title) parts.push(node.title);
      break;

    case 'divider':
      break;
  }
}

function extractInlineText(inline: InlineNode, parts: string[]): void {
  if (inline.type === 'link') {
    for (const child of inline.children) {
      extractInlineText(child, parts);
    }
  } else {
    parts.push(inline.value);
  }
}
