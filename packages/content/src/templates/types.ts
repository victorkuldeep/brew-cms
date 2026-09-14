import { z } from 'zod';

/**
 * Typed scholarly forms. `essay` is free-form; every other kind carries a
 * machine-checkable section contract so BrewCMS can scaffold, validate, and
 * render papers — not just store markdown.
 */
export const ContentKindSchema = z.enum([
  'essay',
  'whitepaper',
  'research-paper',
  'journal',
  'case-study',
]);

export type ContentKind = z.infer<typeof ContentKindSchema>;

export const TemplateSectionSchema = z.object({
  /** Stable id, e.g. `abstract`. */
  id: z.string().min(1),
  /** Exact H2 heading text, e.g. `Abstract`. */
  heading: z.string().min(1),
  /** Accepted alternate headings, matched case-insensitively. */
  aliases: z.array(z.string()).default([]),
  /** Missing required sections fail validation. */
  required: z.boolean().default(false),
  /** One-line author guidance rendered as an HTML comment in skeletons. */
  guidance: z.string().default(''),
});

export type TemplateSection = z.infer<typeof TemplateSectionSchema>;

export const ContentTemplateSchema = z.object({
  kind: ContentKindSchema,
  name: z.string().min(1),
  /** Template revision — bump when sections/rules change. */
  version: z.string().default('1.0.0'),
  description: z.string().default(''),
  sections: z.array(TemplateSectionSchema),
  /** Frontmatter keys the kind requires (besides `title`). */
  requiredFrontmatter: z.array(z.string()).default([]),
  /** Declared media needs, wired to the media library by consumers. */
  assets: z
    .object({
      cover: z.boolean().default(false),
      figures: z.boolean().default(false),
    })
    .default({ cover: false, figures: false }),
});

export type ContentTemplate = z.infer<typeof ContentTemplateSchema>;

export const TEMPLATE_LIBRARY_VERSION = '1.0.0';
