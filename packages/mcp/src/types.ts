import type { PolicyDecision } from '@brew-cms/core';

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpToolParameter {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
}

export interface McpToolCallResult {
  status: PolicyDecision | 'COMPLETED' | 'FAILED';
  actionRunId?: string;
  documentId?: string;
  revisionId?: string;
  policy?: {
    decision: PolicyDecision;
    reason?: string;
  };
  output?: unknown;
  error?: string;
  nextAction?: string;
}
