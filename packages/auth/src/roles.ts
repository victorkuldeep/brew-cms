export const DEFAULT_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  AUTHOR: 'Author',
  VIEWER: 'Viewer',
  AGENT: 'Agent',
} as const;

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  Owner: ['*'],
  Admin: [
    'content:*',
    'media:*',
    'taxonomy:*',
    'user:*',
    'audit:*',
    'agent:*',
    'settings:*',
  ],
  Editor: [
    'content:read',
    'content:create',
    'content:update',
    'content:review',
    'content:approve',
    'content:publish',
    'content:unpublish',
    'content:delete',
    'media:read',
    'media:create',
    'media:delete',
    'taxonomy:manage',
    'audit:read',
  ],
  Author: [
    'content:read',
    'content:create',
    'content:update',
    'content:review',
    'media:read',
    'media:create',
  ],
  Viewer: [
    'content:read',
    'media:read',
  ],
};
