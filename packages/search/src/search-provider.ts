import type { SearchProvider, SearchDocument, SearchQuery, SearchResult } from './types.js';

export class InMemorySearchProvider implements SearchProvider {
  private documents = new Map<string, SearchDocument>();

  async index(document: SearchDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  async remove(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const rawTokens = query.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (rawTokens.length === 0) return [];

    const results: SearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (query.type && doc.type !== query.type) continue;
      if (query.topicId && (!doc.topics || !doc.topics.includes(query.topicId))) continue;
      if (query.tagId && (!doc.tags || !doc.tags.includes(query.tagId))) continue;

      const titleLower = doc.title.toLowerCase();
      const textLower = doc.contentText.toLowerCase();
      let score = 0;

      for (const token of rawTokens) {
        if (titleLower.includes(token)) score += 3.0; // Title boost
        if (doc.topics && doc.topics.some((t) => t.toLowerCase().includes(token))) score += 2.0;
        if (doc.tags && doc.tags.some((t) => t.toLowerCase().includes(token))) score += 1.5;
        if (textLower.includes(token)) score += 1.0;
      }

      if (score > 0) {
        results.push({
          id: doc.id,
          title: doc.title,
          excerpt: doc.excerpt,
          score: Number(score.toFixed(2)),
          url: doc.url,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;

    return results.slice(offset, offset + limit);
  }
}
