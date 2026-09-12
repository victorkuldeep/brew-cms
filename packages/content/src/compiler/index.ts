import { extractFrontmatter } from '../parser/frontmatter.js';
import { parseMarkdownToNodes } from '../parser/markdown.js';
import { computeContentHash } from './hasher.js';
import { calculateMetrics } from './metrics.js';
import { renderContentToHtml } from '../renderer/html.js';
import { extractSearchText } from '../renderer/text.js';
import { ContentIRSchema, type ContentIR } from '../ir/schema.js';

export const COMPILER_VERSION = '1.0.0';

export interface CompileOptions {
  compilerVersion?: string;
  frontmatterDefaults?: Record<string, unknown>;
}

export interface CompileResult {
  sourceMarkdown: string;
  frontmatter: Record<string, unknown>;
  contentIr: ContentIR;
  contentHash: string;
  compilerVersion: string;
  wordCount: number;
  readingTimeSeconds: number;
  html: string;
  searchText: string;
}

export function compileContent(
  source: string,
  options?: CompileOptions
): CompileResult {
  const version = options?.compilerVersion ?? COMPILER_VERSION;

  // 1. Extract frontmatter
  const { data: extractedFm, content: bodyMarkdown } = extractFrontmatter(source);
  const frontmatter = { ...(options?.frontmatterDefaults ?? {}), ...extractedFm };

  // 2. Parse Markdown to Content IR nodes
  const nodes = parseMarkdownToNodes(bodyMarkdown);

  // 3. Assemble and validate Content IR
  const rawIr = {
    version,
    frontmatter,
    nodes,
  };
  const contentIr = ContentIRSchema.parse(rawIr);

  // 4. Calculate plain text & metrics
  const searchText = extractSearchText(contentIr);
  const { wordCount, readingTimeSeconds } = calculateMetrics(searchText);

  // 5. Compute cryptographic content hash
  const contentHash = computeContentHash({
    compilerVersion: version,
    frontmatter: contentIr.frontmatter,
    nodes: contentIr.nodes,
  });

  // 6. Compile safe HTML representation
  const html = renderContentToHtml(contentIr);

  return {
    sourceMarkdown: source,
    frontmatter,
    contentIr,
    contentHash,
    compilerVersion: version,
    wordCount,
    readingTimeSeconds,
    html,
    searchText,
  };
}
