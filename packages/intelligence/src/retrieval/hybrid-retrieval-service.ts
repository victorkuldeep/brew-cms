import type { EmbeddingProvider, SemanticIndexProvider } from '../domain/ports.js';
import type { SearchResultReference, SemanticMatch } from '../domain/types.js';
import type { SearchProvider, SearchQuery } from '@brew-cms/core';

export interface HybridSearchOptions {
  query: string;
  limit?: number;
  sourceId?: string;
  minScore?: number;
  semanticWeight?: number;
  keywordWeight?: number;
  metadataWeight?: number;
  recencyWeight?: number;
}

export class HybridRetrievalService {
  private readonly semanticWeight: number;
  private readonly keywordWeight: number;

  constructor(
    private readonly embeddingProvider?: EmbeddingProvider,
    private readonly semanticIndex?: SemanticIndexProvider,
    private readonly lexicalSearch?: SearchProvider,
    options: { semanticWeight?: number; keywordWeight?: number } = {}
  ) {
    this.semanticWeight = options.semanticWeight ?? 0.55;
    this.keywordWeight = options.keywordWeight ?? 0.35;
  }

  /**
   * Executes true hybrid retrieval: combining lexical keyword matching
   * and semantic vector similarity, deduplicating chunks to canonical content references.
   */
  async search(options: HybridSearchOptions): Promise<SearchResultReference[]> {
    const rawQuery = options.query.trim();
    if (!rawQuery) return [];

    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.05;

    // Detect technical exact match terms (e.g. CML, TMF 622, RCA, DAG, LWC, Agentforce)
    const hasTechnicalTerms = /\b(cml|tmf|rca|dag|lwc|agentforce|cpq|ast|ir|mcp|api)\b/i.test(rawQuery);

    // 1. Parallel retrieval from both vector index and lexical search provider
    const [semanticMatches, lexicalResults] = await Promise.all([
      this.executeSemanticSearch(rawQuery, options.sourceId, limit * 3),
      this.executeLexicalSearch(rawQuery, limit * 3),
    ]);

    // 2. Candidate fusion grouped by canonical content (sourceId + contentId)
    const candidates = new Map<
      string,
      {
        sourceId: string;
        contentId: string;
        revisionId: string;
        canonicalUrl: string;
        maxSemanticSim: number;
        lexicalScore: number;
        matchedChunkIndices: number[];
        reasons: string[];
      }
    >();

    // Process semantic matches
    for (const match of semanticMatches) {
      const key = `${match.sourceId}:${match.contentId}`;
      let entry = candidates.get(key);

      if (!entry) {
        entry = {
          sourceId: match.sourceId,
          contentId: match.contentId,
          revisionId: match.revisionId,
          canonicalUrl: match.canonicalUrl,
          maxSemanticSim: match.similarity,
          lexicalScore: 0,
          matchedChunkIndices: [match.chunkIndex],
          reasons: [`Semantic similarity: ${(match.similarity * 100).toFixed(1)}%`],
        };
        candidates.set(key, entry);
      } else {
        if (match.similarity > entry.maxSemanticSim) {
          entry.maxSemanticSim = match.similarity;
          entry.revisionId = match.revisionId;
          entry.canonicalUrl = match.canonicalUrl;
        }
        if (!entry.matchedChunkIndices.includes(match.chunkIndex)) {
          entry.matchedChunkIndices.push(match.chunkIndex);
        }
      }
    }

    // Determine max lexical score for normalization
    let maxLexScore = 1;
    for (const lex of lexicalResults) {
      if (lex.score > maxLexScore) maxLexScore = lex.score;
    }

    // Process lexical results
    for (const lex of lexicalResults) {
      // Find candidate by contentId or id
      let foundKey: string | null = null;
      for (const [key, entry] of candidates.entries()) {
        if (entry.contentId === lex.id) {
          foundKey = key;
          break;
        }
      }

      const normalizedLexScore = Math.min(1.0, lex.score / maxLexScore);

      if (foundKey) {
        const entry = candidates.get(foundKey)!;
        entry.lexicalScore = normalizedLexScore;
        entry.reasons.push(`Keyword match: ${lex.title}`);
      } else {
        // SourceId fallback for purely lexical match
        const sourceId = options.sourceId ?? 'brewcms-sqlite';
        const key = `${sourceId}:${lex.id}`;
        candidates.set(key, {
          sourceId,
          contentId: lex.id,
          revisionId: 'current',
          canonicalUrl: lex.url ?? `/documents/${lex.id}`,
          maxSemanticSim: 0,
          lexicalScore: normalizedLexScore,
          matchedChunkIndices: [],
          reasons: [`Exact keyword match: ${lex.title}`],
        });
      }
    }

    // 3. Score calculation with technical boost and candidate deduplication
    const results: SearchResultReference[] = [];

    // Dynamically adjust weights if exact technical terms were searched
    const sWeight = hasTechnicalTerms ? 0.40 : this.semanticWeight;
    const kWeight = hasTechnicalTerms ? 0.60 : this.keywordWeight;

    for (const cand of candidates.values()) {
      let finalScore = sWeight * cand.maxSemanticSim + kWeight * cand.lexicalScore;

      // Both semantic and keyword corroboration bonus
      if (cand.maxSemanticSim > 0.4 && cand.lexicalScore > 0.4) {
        finalScore = Math.min(1.0, finalScore * 1.15);
      }

      if (finalScore >= minScore) {
        results.push({
          sourceId: cand.sourceId,
          contentId: cand.contentId,
          revisionId: cand.revisionId,
          canonicalUrl: cand.canonicalUrl,
          score: Number(finalScore.toFixed(4)),
          matchedChunkIds: cand.matchedChunkIndices.map((i) => `chunk-${i}`),
          reasons: cand.reasons,
        });
      }
    }

    // 4. Deterministic ranking: sort by finalScore descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  private async executeSemanticSearch(
    query: string,
    sourceId: string | undefined,
    limit: number
  ): Promise<SemanticMatch[]> {
    if (!this.embeddingProvider || !this.semanticIndex) {
      return [];
    }
    try {
      const queryVector = await this.embeddingProvider.embedQuery(query);
      return await this.semanticIndex.search(queryVector, {
        sourceId,
        limit,
        minSimilarity: 0.1,
      });
    } catch {
      // Graceful degradation: return empty semantic matches if vector search fails
      return [];
    }
  }

  private async executeLexicalSearch(query: string, limit: number): Promise<any[]> {
    if (!this.lexicalSearch) {
      return [];
    }
    try {
      const q: SearchQuery = { query, limit };
      return await this.lexicalSearch.search(q);
    } catch {
      // Graceful degradation: return empty lexical matches if lexical search fails
      return [];
    }
  }
}
