import { describe, it, expect } from 'vitest';
import { InMemorySearchProvider } from '../search-provider.js';
import { DeterministicRecommendationEngine } from '../recommendations.js';

describe('Search & Recommendation Engine', () => {
  it('indexes and searches documents with relevance boosting', async () => {
    const provider = new InMemorySearchProvider();

    await provider.index({
      id: 'doc_1',
      type: 'post',
      title: 'Architectural Content Systems',
      contentText: 'This article discusses general CMS design.',
      authorId: 'author_1',
      topics: ['Architecture'],
    });

    await provider.index({
      id: 'doc_2',
      type: 'post',
      title: 'Introduction to Next.js',
      contentText: 'Next.js can be used to build architectural content systems.',
      authorId: 'author_2',
    });

    const results = await provider.search({ query: 'architectural' });
    expect(results).toHaveLength(2);
    // doc_1 has 'architectural' in title AND topic boost, so doc_1 must be ranked first
    expect(results[0].id).toBe('doc_1');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('produces explainable recommendations based on series, topics, and tags', () => {
    const engine = new DeterministicRecommendationEngine();

    const targetDoc = {
      id: 'target_1',
      type: 'post',
      title: 'Operating Modern Content Systems',
      authorId: 'author_kuldeep',
      series: ['content-engineering'],
      topics: ['architecture'],
      tags: ['cms', 'typescript'],
    };

    const candidates = [
      {
        id: 'candidate_series_and_topic',
        type: 'post',
        title: 'Content IR Specifications',
        authorId: 'author_kuldeep',
        series: ['content-engineering'],
        topics: ['architecture'],
        tags: ['cms'],
        publishedAt: new Date(),
      },
      {
        id: 'candidate_unrelated',
        type: 'post',
        title: 'Unrelated Recipe',
        authorId: 'other_author',
        topics: ['cooking'],
        tags: ['food'],
      },
    ];

    const recs = engine.getRecommendations(targetDoc, candidates);
    expect(recs).toHaveLength(1);
    expect(recs[0].documentId).toBe('candidate_series_and_topic');
    expect(recs[0].score).toBeGreaterThan(0.5);
    expect(recs[0].reasons).toContain('same_series');
    expect(recs[0].reasons).toContain('shared_topic');
    expect(recs[0].reasons).toContain('shared_tags');
    expect(recs[0].reasons).toContain('same_author');
  });
});
