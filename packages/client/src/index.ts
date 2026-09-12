import type { Document, Revision, Topic, Tag, Series, MediaAsset } from '@brew-cms/core';
import { renderContentToHtml } from '@brew-cms/content';

export interface BrewClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
  defaultRevalidate?: number;
}

export interface ListDocumentsOptions {
  type?: 'post' | 'page' | 'guide';
  status?: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
  limit?: number;
  offset?: number;
  q?: string;
  revalidate?: number;
}

export class BrewClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BrewClientError';
  }
}

export class BrewClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetcher: typeof fetch;
  private readonly defaultRevalidate: number;

  constructor(options: BrewClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.defaultRevalidate = options.defaultRevalidate ?? 60;
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      revalidate?: number;
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchInit: RequestInit & { next?: { revalidate?: number } } = {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    };

    // Support Next.js fetch caching if available
    if (options.revalidate !== undefined || this.defaultRevalidate !== undefined) {
      fetchInit.next = { revalidate: options.revalidate ?? this.defaultRevalidate };
    }

    const res = await this.fetcher(url.toString(), fetchInit);

    if (!res.ok) {
      let errBody: any = null;
      try {
        errBody = await res.json();
      } catch {
        // Ignored
      }
      throw new BrewClientError(
        errBody?.error?.message || `HTTP ${res.status}: ${res.statusText}`,
        res.status,
        errBody?.error?.code,
        errBody?.error?.details
      );
    }

    return (await res.json()) as T;
  }

  public readonly documents = {
    list: async (options: ListDocumentsOptions = {}): Promise<{ items: Document[]; total: number }> => {
      const { revalidate, ...query } = options;
      return this.request<{ items: Document[]; total: number }>('/api/v1/documents', {
        query: query as Record<string, string | number | undefined>,
        revalidate,
      });
    },

    getById: async (id: string, options?: { revalidate?: number }): Promise<Document> => {
      return this.request<Document>(`/api/v1/documents/${id}`, {
        revalidate: options?.revalidate,
      });
    },

    getBySlug: async (slug: string, options?: { revalidate?: number }): Promise<Document | null> => {
      const { items } = await this.documents.list({ q: slug, limit: 10, revalidate: options?.revalidate });
      return items.find((d) => d.slug === slug) ?? null;
    },

    getRevisions: async (
      documentId: string,
      options?: { revalidate?: number }
    ): Promise<{ revisions: Revision[] }> => {
      return this.request<{ revisions: Revision[] }>(`/api/v1/documents/${documentId}/revisions`, {
        revalidate: options?.revalidate,
      });
    },
  };

  public readonly taxonomies = {
    listTopics: async (options?: { revalidate?: number }): Promise<Topic[]> => {
      const res = await this.request<{ items: Topic[] }>('/api/v1/topics', {
        revalidate: options?.revalidate,
      });
      return res.items;
    },

    listTags: async (options?: { revalidate?: number }): Promise<Tag[]> => {
      const res = await this.request<{ items: Tag[] }>('/api/v1/tags', {
        revalidate: options?.revalidate,
      });
      return res.items;
    },

    listSeries: async (options?: { revalidate?: number }): Promise<Series[]> => {
      const res = await this.request<{ items: Series[] }>('/api/v1/series', {
        revalidate: options?.revalidate,
      });
      return res.items;
    },
  };

  public readonly media = {
    list: async (options?: { mimeType?: string; limit?: number; revalidate?: number }): Promise<MediaAsset[]> => {
      const { revalidate, ...query } = options ?? {};
      const res = await this.request<{ items: MediaAsset[] }>('/api/v1/media', {
        query,
        revalidate,
      });
      return res.items;
    },
  };

  /**
   * Helper to safely render document Content IR to clean, sanitized HTML.
   */
  public renderHtml(contentIr: any): string {
    return renderContentToHtml(contentIr);
  }
}

export function createBrewClient(options: BrewClientOptions): BrewClient {
  return new BrewClient(options);
}
