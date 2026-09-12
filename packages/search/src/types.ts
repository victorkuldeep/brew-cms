import type { SearchDocument, SearchQuery, SearchResult, SearchProvider } from '@brew-cms/core';

export type { SearchDocument, SearchQuery, SearchResult, SearchProvider };

export interface RecommendationCandidate {
  id: string;
  type: string;
  title: string;
  authorId: string;
  topics?: string[];
  tags?: string[];
  series?: string[];
  publishedAt?: Date | null;
}

export interface RecommendationResult {
  documentId: string;
  score: number;
  reasons: string[];
}
