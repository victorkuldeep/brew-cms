import type { DatabaseSync } from 'node:sqlite';

export function seedInitialData(db: DatabaseSync): void {
  // Check if database is already seeded to avoid unnecessary write operations
  const existingUser = db.prepare('SELECT id FROM users WHERE id = ?').get('usr_admin_default');
  if (existingUser) {
    return;
  }

  const now = new Date().toISOString();

  // 1. Roles
  const roles = [
    { id: 'role_owner', name: 'Owner' },
    { id: 'role_admin', name: 'Admin' },
    { id: 'role_editor', name: 'Editor' },
    { id: 'role_author', name: 'Author' },
    { id: 'role_viewer', name: 'Viewer' },
  ];

  const insertRole = db.prepare('INSERT OR IGNORE INTO roles (id, name) VALUES (?, ?)');
  for (const r of roles) {
    insertRole.run(r.id, r.name);
  }

  // 2. Default Admin User
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, display_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertUser.run('usr_admin_default', 'admin@brewcms.org', 'BrewCMS Administrator', 'active', now, now);

  const insertUserRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');
  insertUserRole.run('usr_admin_default', 'role_admin');

  // 3. Default Agent Identity
  const insertAgent = db.prepare(`
    INSERT OR IGNORE INTO agent_identities (id, name, description, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAgent.run(
    'agent_editorial_assistant',
    'BrewCMS Editorial Assistant',
    'Automated research, drafting, tagging, and SEO assistant',
    'active',
    now
  );

  const insertAgentCred = db.prepare(`
    INSERT OR IGNORE INTO agent_credentials (id, agent_identity_id, credential_hash, scopes_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAgentCred.run(
    'cred_agent_editorial',
    'agent_editorial_assistant',
    'default_hash',
    JSON.stringify(['content:read', 'content:create', 'content:update', 'content:review', 'content:search']),
    now
  );

  // 4. Default Topics & Tags
  const insertTopic = db.prepare('INSERT OR IGNORE INTO topics (id, slug, name, description) VALUES (?, ?, ?, ?)');
  insertTopic.run('top_arch', 'architecture', 'Architecture', 'System architecture, design patterns, and engineering control planes.');
  insertTopic.run('top_intel', 'intelligence', 'Intelligence', 'AI agents, model protocols, and human governance.');

  const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id, slug, name) VALUES (?, ?, ?)');
  insertTag.run('tag_nextjs', 'nextjs', 'Next.js');
  insertTag.run('tag_markdown', 'markdown', 'Markdown');
  insertTag.run('tag_mcp', 'mcp', 'MCP');
}
