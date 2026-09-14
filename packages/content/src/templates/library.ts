import type { ContentTemplate } from './types.js';

/**
 * Industry-grade starter templates, versioned with the package.
 * Order is deliberate and executive-first (Abstract → Outcomes → Problem):
 * decision-makers read top-down, engineers drill down.
 */
const WHITEPAPER_SECTIONS: ContentTemplate['sections'] = [
  { id: 'abstract', heading: 'Abstract', aliases: [], required: true, guidance: '150-250 words: what, why it matters, key result.' },
  { id: 'outcomes', heading: 'Outcomes', aliases: ['Key Outcomes', 'Executive Summary'], required: true, guidance: 'Bullets a decision-maker can act on without reading further.' },
  { id: 'problem', heading: 'Problem', aliases: ['Problem Statement', 'Background'], required: true, guidance: 'The problem, who feels it, cost of inaction.' },
  { id: 'approach', heading: 'Approach', aliases: ['Method', 'Methodology', 'Solution'], required: false, guidance: 'How you addressed it; architecture and decisions.' },
  { id: 'evidence', heading: 'Evidence', aliases: ['Results', 'Findings', 'Evaluation'], required: false, guidance: 'Measurements, deployments, observed behavior - never claims without backing.' },
  { id: 'limitations', heading: 'Limitations', aliases: ['Threats to Validity', 'Caveats'], required: false, guidance: 'Where this does not apply. Honest limits build trust.' },
  { id: 'references', heading: 'References', aliases: ['Bibliography', 'Sources'], required: true, guidance: 'Every external claim cited, one per line with links where possible.' },
];

export const TEMPLATES: ContentTemplate[] = [
  {
    kind: 'essay',
    name: 'Freeform Essay',
    version: '1.0.0',
    description: 'Unstructured long-form writing. No required sections.',
    sections: [],
    requiredFrontmatter: [],
    assets: { cover: false, figures: false },
  },
  {
    kind: 'whitepaper',
    name: 'Whitepaper (Executive Order)',
    version: '1.0.0',
    description: 'Decision-maker paper: Abstract, Outcomes, Problem, Approach, Evidence, Limitations, References.',
    sections: WHITEPAPER_SECTIONS,
    requiredFrontmatter: [],
    assets: { cover: true, figures: true },
  },
  {
    kind: 'research-paper',
    name: 'Research Paper (IMRaD)',
    version: '1.0.0',
    description: 'IMRaD structure: Abstract, Introduction, Method, Results, Discussion, References.',
    sections: [
      { id: 'abstract', heading: 'Abstract', aliases: [], required: true, guidance: '150-250 words: question, method, result.' },
      { id: 'introduction', heading: 'Introduction', aliases: ['Background'], required: false, guidance: 'Context, related work, research question.' },
      { id: 'method', heading: 'Method', aliases: ['Methodology', 'Approach'], required: true, guidance: 'Reproducible steps: data, setup, procedure.' },
      { id: 'results', heading: 'Results', aliases: ['Findings', 'Evidence'], required: true, guidance: 'Observed results only - interpretation belongs in Discussion.' },
      { id: 'discussion', heading: 'Discussion', aliases: ['Analysis', 'Conclusion'], required: false, guidance: 'What the results mean, limits, future work.' },
      { id: 'references', heading: 'References', aliases: ['Bibliography', 'Sources'], required: true, guidance: 'Every external claim cited, one per line with links where possible.' },
    ],
    requiredFrontmatter: [],
    assets: { cover: false, figures: true },
  },
  {
    kind: 'journal',
    name: 'Journal Entry',
    version: '1.0.0',
    description: 'Dated working log. No required sections - presence of dated content is the contract.',
    sections: [
      { id: 'log', heading: 'Log', aliases: ['Entry', 'Notes'], required: false, guidance: 'What happened, what was tried, what was learned.' },
    ],
    requiredFrontmatter: [],
    assets: { cover: false, figures: false },
  },
  {
    kind: 'case-study',
    name: 'Case Study',
    version: '1.0.0',
    description: 'Delivery narrative: Problem, Approach, Outcomes with evidence.',
    sections: [
      { id: 'problem', heading: 'Problem', aliases: ['Context', 'Background'], required: true, guidance: 'Client situation, constraints, stakes.' },
      { id: 'approach', heading: 'Approach', aliases: ['Solution', 'Method'], required: true, guidance: 'What was built and the key decisions.' },
      { id: 'outcomes', heading: 'Outcomes', aliases: ['Results', 'Impact'], required: true, guidance: 'Measured impact - numbers over adjectives.' },
    ],
    requiredFrontmatter: [],
    assets: { cover: true, figures: true },
  },
];

export function getTemplate(kind: string): ContentTemplate | undefined {
  return TEMPLATES.find((t) => t.kind === kind);
}

export function listTemplates(): ContentTemplate[] {
  return [...TEMPLATES];
}
