import type { Topic, Tag, Series } from '../domain/types.js';
import type { TaxonomyRepository } from '../ports/repositories.js';
import { NotFoundError, ConflictError } from '../domain/errors.js';

export class TaxonomyService {
  constructor(private readonly taxonomyRepo: TaxonomyRepository) {}

  // Topics
  async createTopic(topic: Topic): Promise<Topic> {
    const existing = await this.taxonomyRepo.findTopicBySlug(topic.slug);
    if (existing) throw new ConflictError(`Topic with slug '${topic.slug}' already exists.`);
    return this.taxonomyRepo.createTopic(topic);
  }

  async getTopic(id: string): Promise<Topic> {
    const topic = await this.taxonomyRepo.findTopicById(id);
    if (!topic) throw new NotFoundError('Topic', id);
    return topic;
  }

  async listTopics(): Promise<Topic[]> {
    return this.taxonomyRepo.listTopics();
  }

  // Tags
  async createTag(tag: Tag): Promise<Tag> {
    const existing = await this.taxonomyRepo.findTagBySlug(tag.slug);
    if (existing) throw new ConflictError(`Tag with slug '${tag.slug}' already exists.`);
    return this.taxonomyRepo.createTag(tag);
  }

  async listTags(): Promise<Tag[]> {
    return this.taxonomyRepo.listTags();
  }

  async setDocumentTags(documentId: string, tagIds: string[]): Promise<void> {
    return this.taxonomyRepo.setDocumentTags(documentId, tagIds);
  }

  async getDocumentTags(documentId: string): Promise<Tag[]> {
    return this.taxonomyRepo.getDocumentTags(documentId);
  }

  // Series
  async createSeries(series: Series): Promise<Series> {
    const existing = await this.taxonomyRepo.findSeriesBySlug(series.slug);
    if (existing) throw new ConflictError(`Series with slug '${series.slug}' already exists.`);
    return this.taxonomyRepo.createSeries(series);
  }

  async listSeries(): Promise<Series[]> {
    return this.taxonomyRepo.listSeries();
  }

  async setDocumentSeries(documentId: string, seriesId: string, position: number): Promise<void> {
    return this.taxonomyRepo.setDocumentSeries(documentId, seriesId, position);
  }

  async getDocumentSeries(documentId: string): Promise<{ series: Series; position: number } | null> {
    return this.taxonomyRepo.getDocumentSeries(documentId);
  }
}
