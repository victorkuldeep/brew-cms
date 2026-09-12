import { z } from 'zod';

export const CreateDocumentRequestSchema = z.object({
  type: z.enum(['post', 'page']),
  slug: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().optional().nullable(),
  sourceMarkdown: z.string(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  seo: z
    .object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      ogImage: z.string().optional(),
      noIndex: z.boolean().optional(),
    })
    .optional()
    .nullable(),
});

export const UpdateDocumentRequestSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().optional().nullable(),
  sourceMarkdown: z.string().optional(),
  frontmatter: z.record(z.string(), z.unknown()).optional(),
  seo: z
    .object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      ogImage: z.string().optional(),
      noIndex: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  changeSummary: z.string().optional().nullable(),
});

export const PublishDocumentRequestSchema = z.object({
  revisionId: z.string().optional(),
});

export const ScheduleDocumentRequestSchema = z.object({
  scheduledAt: z.string().datetime(),
  revisionId: z.string().optional(),
});

export const CreateTopicRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});

export const CreateTagRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export const CreateSeriesRequestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
});
