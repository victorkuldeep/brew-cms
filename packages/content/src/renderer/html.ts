import type {
  ContentIR,
  ContentNode,
  InlineNode,
} from '../ir/schema.js';

export function renderContentToHtml(ir: ContentIR): string {
  return ir.nodes.map(renderNodeToHtml).join('\n');
}

export function renderNodeToHtml(node: ContentNode): string {
  switch (node.type) {
    case 'heading': {
      const idAttr = node.id ? ` id="${escapeHtml(node.id)}"` : '';
      return `<h${node.level}${idAttr}>${escapeHtml(node.text)}</h${node.level}>`;
    }

    case 'paragraph': {
      const inlinesHtml = node.children.map(renderInlineToHtml).join('');
      return `<p>${inlinesHtml}</p>`;
    }

    case 'codeBlock': {
      const langClass = node.language ? ` class="language-${escapeHtml(node.language)}"` : '';
      return `<pre><code${langClass}>${escapeHtml(node.code)}</code></pre>`;
    }

    case 'blockquote':
      return `<blockquote><p>${escapeHtml(node.text)}</p></blockquote>`;

    case 'callout': {
      const titleHtml = node.title ? `<p class="callout-title"><strong>${escapeHtml(node.title)}</strong></p>` : '';
      return `<div class="callout callout-${escapeHtml(node.variant)}">${titleHtml}<p>${escapeHtml(node.text)}</p></div>`;
    }

    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const itemsHtml = node.items.map((item) => `<li>${escapeHtml(item.text)}</li>`).join('');
      return `<${tag}>${itemsHtml}</${tag}>`;
    }

    case 'image': {
      const titleAttr = node.title ? ` title="${escapeHtml(node.title)}"` : '';
      return `<figure><img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt)}"${titleAttr} loading="lazy" /></figure>`;
    }

    case 'divider':
      return `<hr />`;

    default:
      return '';
  }
}

export function renderInlineToHtml(inline: InlineNode): string {
  if (inline.type === 'link') {
    const titleAttr = inline.title ? ` title="${escapeHtml(inline.title)}"` : '';
    const inner = inline.children.map(renderInlineToHtml).join('');
    return `<a href="${escapeHtml(inline.href)}"${titleAttr} rel="noopener noreferrer">${inner}</a>`;
  }

  let text = escapeHtml(inline.value);
  if (inline.bold) text = `<strong>${text}</strong>`;
  if (inline.italic) text = `<em>${text}</em>`;
  if (inline.code) text = `<code>${text}</code>`;
  if (inline.strikethrough) text = `<del>${text}</del>`;

  return text;
}

export function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
