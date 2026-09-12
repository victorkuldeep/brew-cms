import { describe, it, expect } from 'vitest';
import { compileContent } from '@brew-cms/content';
import { createBrewClient, BrewClient } from '../index.js';

describe('@brew-cms/client SDK', () => {
  it('instantiates client with base options', () => {
    const client = createBrewClient({
      baseUrl: 'http://localhost:3000',
      apiKey: 'brew_live_test123',
    });
    expect(client).toBeInstanceOf(BrewClient);
    expect(client.documents).toBeDefined();
    expect(client.taxonomies).toBeDefined();
    expect(client.media).toBeDefined();
  });

  it('fetches documents using custom fetch implementation', async () => {
    const mockFetch = async (url: string, init?: any) => {
      expect(url).toContain('/api/v1/documents?limit=10&status=PUBLISHED');
      expect(init?.headers?.Authorization).toBe('Bearer brew_live_key');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'doc_1',
              title: 'Coffee Beans Guide',
              slug: 'coffee-beans-guide',
              status: 'PUBLISHED',
              type: 'post',
            },
          ],
          total: 1,
        }),
      } as any;
    };

    const client = createBrewClient({
      baseUrl: 'https://cms.example.com',
      apiKey: 'brew_live_key',
      fetch: mockFetch as any,
    });

    const result = await client.documents.list({ limit: 10, status: 'PUBLISHED' });
    expect(result.items.length).toBe(1);
    expect(result.items[0].slug).toBe('coffee-beans-guide');
  });

  it('handles API errors properly', async () => {
    const mockErrorFetch = async () => {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'NOT_FOUND',
            message: 'Document with ID doc_missing was not found.',
          },
        }),
      } as any;
    };

    const client = createBrewClient({
      baseUrl: 'https://cms.example.com',
      fetch: mockErrorFetch as any,
    });

    await expect(client.documents.getById('doc_missing')).rejects.toThrow(
      'Document with ID doc_missing was not found.'
    );
  });

  it('renders Content IR safely to HTML', () => {
    const client = createBrewClient({ baseUrl: 'http://localhost:3000' });
    const compiled = compileContent('# Specialty Coffee Roasting\n\nLight roasts preserve acidity.');

    const html = client.renderHtml(compiled.contentIr);
    expect(html).toContain('Specialty Coffee Roasting');
    expect(html).toContain('<p>Light roasts preserve acidity.</p>');
  });
});
