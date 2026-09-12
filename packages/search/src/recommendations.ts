import type { RecommendationCandidate, RecommendationResult } from './types.js';

export interface RecommendationEngineConfig {
  seriesWeight?: number;
  topicWeight?: number;
  tagWeight?: number;
  authorWeight?: number;
  recencyWeight?: number;
  recencyDaysThreshold?: number;
}

export class DeterministicRecommendationEngine {
  constructor(private readonly config: RecommendationEngineConfig = {}) {}

  getRecommendations(
    target: RecommendationCandidate,
    candidates: RecommendationCandidate[],
    limit: number = 5
  ): RecommendationResult[] {
    const seriesW = this.config.seriesWeight ?? 0.35;
    const topicW = this.config.topicWeight ?? 0.25;
    const tagW = this.config.tagWeight ?? 0.15;
    const authorW = this.config.authorWeight ?? 0.10;
    const recencyW = this.config.recencyWeight ?? 0.10;
    const thresholdDays = this.config.recencyDaysThreshold ?? 30;

    const scored: RecommendationResult[] = [];

    const now = Date.now();
    const targetTopics = new Set(target.topics || []);
    const targetTags = new Set(target.tags || []);
    const targetSeries = new Set(target.series || []);

    for (const candidate of candidates) {
      if (candidate.id === target.id) continue;

      let score = 0;
      const reasons: string[] = [];

      // 1. Same series
      if (candidate.series && candidate.series.some((s) => targetSeries.has(s))) {
        score += seriesW;
        reasons.push('same_series');
      }

      // 2. Shared topics
      if (candidate.topics) {
        const sharedTopics = candidate.topics.filter((t) => targetTopics.has(t));
        if (sharedTopics.length > 0) {
          const topicScore = Math.min(sharedTopics.length * (topicW / 2), topicW);
          score += topicScore;
          reasons.push('shared_topic');
        }
      }

      // 3. Shared tags
      if (candidate.tags) {
        const sharedTags = candidate.tags.filter((t) => targetTags.has(t));
        if (sharedTags.length > 0) {
          const tagScore = Math.min(sharedTags.length * (tagW / 3), tagW);
          score += tagScore;
          reasons.push('shared_tags');
        }
      }

      // 4. Same author
      if (candidate.authorId === target.authorId) {
        score += authorW;
        reasons.push('same_author');
      }

      // 5. Recency
      if (candidate.publishedAt) {
        const diffDays = (now - new Date(candidate.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays <= thresholdDays) {
          score += recencyW;
          reasons.push('recent_publication');
        }
      }

      if (score > 0) {
        scored.push({
          documentId: candidate.id,
          score: Number(Math.min(score, 1.0).toFixed(2)),
          reasons,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
