import { z } from 'zod';

export const InlineTextNodeSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  code: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
});

export type InlineTextNode = z.infer<typeof InlineTextNodeSchema>;

export const InlineLinkNodeSchema = z.object({
  type: z.literal('link'),
  href: z.string(),
  title: z.string().optional(),
  children: z.array(InlineTextNodeSchema),
});

export type InlineLinkNode = z.infer<typeof InlineLinkNodeSchema>;

export const InlineNodeSchema = z.discriminatedUnion('type', [
  InlineTextNodeSchema,
  InlineLinkNodeSchema,
]);

export type InlineNode = z.infer<typeof InlineNodeSchema>;

export const HeadingNodeSchema = z.object({
  type: z.literal('heading'),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  text: z.string(),
  id: z.string(),
});

export const ParagraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  children: z.array(InlineNodeSchema),
});

export const CodeBlockNodeSchema = z.object({
  type: z.literal('codeBlock'),
  code: z.string(),
  language: z.string().optional(),
  filename: z.string().optional(),
});

export const BlockquoteNodeSchema = z.object({
  type: z.literal('blockquote'),
  text: z.string(),
});

export const CalloutNodeSchema = z.object({
  type: z.literal('callout'),
  variant: z.enum(['note', 'tip', 'important', 'warning', 'caution']),
  title: z.string().optional(),
  text: z.string(),
});

export const ListItemNodeSchema = z.object({
  type: z.literal('listItem'),
  text: z.string(),
});

export const ListNodeSchema = z.object({
  type: z.literal('list'),
  ordered: z.boolean(),
  items: z.array(ListItemNodeSchema),
});

export const ImageNodeSchema = z.object({
  type: z.literal('image'),
  src: z.string(),
  alt: z.string(),
  title: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const DividerNodeSchema = z.object({
  type: z.literal('divider'),
});

export type HeadingNode = z.infer<typeof HeadingNodeSchema>;
export type ParagraphNode = z.infer<typeof ParagraphNodeSchema>;
export type CodeBlockNode = z.infer<typeof CodeBlockNodeSchema>;
export type BlockquoteNode = z.infer<typeof BlockquoteNodeSchema>;
export type CalloutNode = z.infer<typeof CalloutNodeSchema>;
export type ListItemNode = z.infer<typeof ListItemNodeSchema>;
export type ListNode = z.infer<typeof ListNodeSchema>;
export type ImageNode = z.infer<typeof ImageNodeSchema>;
export type DividerNode = z.infer<typeof DividerNodeSchema>;

export const ContentNodeSchema = z.discriminatedUnion('type', [
  HeadingNodeSchema,
  ParagraphNodeSchema,
  CodeBlockNodeSchema,
  BlockquoteNodeSchema,
  CalloutNodeSchema,
  ListNodeSchema,
  ImageNodeSchema,
  DividerNodeSchema,
]);

export type ContentNode = z.infer<typeof ContentNodeSchema>;

export const ContentIRSchema = z.object({
  version: z.string(), // e.g. "1.0.0"
  frontmatter: z.record(z.unknown()),
  nodes: z.array(ContentNodeSchema),
});

export type ContentIR = z.infer<typeof ContentIRSchema>;
