import { createHash } from 'node:crypto';
import type { SemanticChunk } from '../domain/types.js';

export interface ChunkerOptions {
  /** Target token count per chunk (approx 4 chars per token). Default: 750 */
  targetTokens?: number;
  /** Minimum tokens to form a standalone chunk. Default: 300 */
  minTokens?: number;
  /** Maximum tokens per chunk. Default: 900 */
  maxTokens?: number;
  /** Overlap between consecutive chunks in tokens. Default: 60 */
  overlapTokens?: number;
}

export const CHUNKER_VERSION = '1.0.0';

/**
 * Estimates token count using standard English heuristic (~4 chars per token).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.trim().length / 4);
}

/**
 * Generates a deterministic SHA-256 hash of the chunk text.
 */
export function computeChunkHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Deterministically partitions plain/markdown document text into semantic chunks
 * bounded between 600-900 tokens, preserving heading context and paragraph boundaries.
 */
export function chunkText(
  text: string,
  options: ChunkerOptions = {},
  title?: string
): SemanticChunk[] {
  const targetTokens = options.targetTokens ?? 750;
  const maxTokens = options.maxTokens ?? 900;
  const minTokens = options.minTokens ?? 300;
  const overlapTokens = options.overlapTokens ?? 60;

  const cleanText = text.trim();
  if (!cleanText) {
    return [];
  }

  const totalTokens = estimateTokenCount(cleanText);

  // If document is small enough to fit in a single chunk, return 1 chunk directly
  if (totalTokens <= maxTokens) {
    return [
      {
        chunkIndex: 0,
        chunkHash: computeChunkHash(cleanText),
        text: cleanText,
        tokenCountEstimate: totalTokens,
        headingContext: title,
      },
    ];
  }

  // Split into structural sections (split by headings or double newlines)
  const rawSections = cleanText.split(/(?=\n#{1,4}\s+)|(?:\n\s*\n)/g);
  const sections = rawSections.map((s) => s.trim()).filter((s) => s.length > 0);

  const chunks: SemanticChunk[] = [];
  let currentChunkParts: string[] = [];
  let currentTokens = 0;
  let currentHeading = title;
  let chunkIndex = 0;

  for (const section of sections) {
    // Check if section starts with a markdown heading
    const headingMatch = section.match(/^#{1,4}\s+(.+)$/m);
    if (headingMatch && headingMatch[1]) {
      currentHeading = headingMatch[1].trim();
    }

    const sectionTokens = estimateTokenCount(section);

    // If a single section exceeds maxTokens, subdivide by sentences
    if (sectionTokens > maxTokens) {
      if (currentChunkParts.length > 0) {
        const chunkTextContent = currentChunkParts.join('\n\n');
        chunks.push({
          chunkIndex: chunkIndex++,
          chunkHash: computeChunkHash(chunkTextContent),
          text: chunkTextContent,
          tokenCountEstimate: currentTokens,
          headingContext: currentHeading,
        });
        currentChunkParts = [];
        currentTokens = 0;
      }

      // Break long section into sentences
      const sentences = section.split(/(?<=[.!?])\s+/g);
      let sentenceChunk: string[] = [];
      let sentenceTokens = 0;

      for (const sent of sentences) {
        const sTokens = estimateTokenCount(sent);
        if (sentenceTokens + sTokens > targetTokens && sentenceTokens >= minTokens) {
          const sentText = sentenceChunk.join(' ');
          chunks.push({
            chunkIndex: chunkIndex++,
            chunkHash: computeChunkHash(sentText),
            text: sentText,
            tokenCountEstimate: sentenceTokens,
            headingContext: currentHeading,
          });
          // Add overlap from tail
          const overlapWords = sentText.split(/\s+/).slice(-overlapTokens);
          sentenceChunk = [overlapWords.join(' '), sent];
          sentenceTokens = estimateTokenCount(sentenceChunk.join(' '));
        } else {
          sentenceChunk.push(sent);
          sentenceTokens += sTokens;
        }
      }

      if (sentenceChunk.length > 0) {
        const sentText = sentenceChunk.join(' ');
        currentChunkParts.push(sentText);
        currentTokens += sentenceTokens;
      }
      continue;
    }

    // Normal section accumulation
    if (currentTokens + sectionTokens > targetTokens && currentTokens >= minTokens) {
      const chunkTextContent = currentChunkParts.join('\n\n');
      chunks.push({
        chunkIndex: chunkIndex++,
        chunkHash: computeChunkHash(chunkTextContent),
        text: chunkTextContent,
        tokenCountEstimate: currentTokens,
        headingContext: currentHeading,
      });

      // Maintain modest overlap: take the last sentence/part if available
      const lastPart = currentChunkParts[currentChunkParts.length - 1];
      if (lastPart && estimateTokenCount(lastPart) <= overlapTokens * 2) {
        currentChunkParts = [lastPart, section];
        currentTokens = estimateTokenCount(currentChunkParts.join('\n\n'));
      } else {
        currentChunkParts = [section];
        currentTokens = sectionTokens;
      }
    } else {
      currentChunkParts.push(section);
      currentTokens += sectionTokens;
    }
  }

  // Push trailing chunk
  if (currentChunkParts.length > 0) {
    const chunkTextContent = currentChunkParts.join('\n\n');
    chunks.push({
      chunkIndex: chunkIndex++,
      chunkHash: computeChunkHash(chunkTextContent),
      text: chunkTextContent,
      tokenCountEstimate: currentTokens,
      headingContext: currentHeading,
    });
  }

  return chunks;
}
