import type { ContentTemplate } from './types.js';

/**
 * Renders a new-document skeleton: frontmatter shell plus one H2 per section
 * with author guidance as HTML comments (invisible when rendered).
 */
export function renderSkeleton(template: ContentTemplate, title = 'Untitled'): string {
  const lines: string[] = [
    '---',
    `title: "${title.replace(/"/g, '')}"`,
    `template: "${template.kind}"`,
    `templateVersion: "${template.version}"`,
    'status: "draft"',
    '---',
    '',
    `# ${title}`,
    '',
  ];
  for (const section of template.sections) {
    if (section.guidance) lines.push(`<!-- ${section.guidance} -->`);
    lines.push(`## ${section.heading}`, '');
  }
  return lines.join('\n');
}
