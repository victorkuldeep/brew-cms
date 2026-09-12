import type { DatabaseSync } from 'node:sqlite';
import type { User, Role, UserRepository } from '@brew-cms/core';

export class SQLiteUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseSync) {}

  async findById(id: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as any;
    return row ? this.mapRow(row) : null;
  }

  async create(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO users (id, email, display_name, avatar_url, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      user.id,
      user.email.toLowerCase().trim(),
      user.displayName,
      user.avatarUrl ?? null,
      user.status,
      now,
      now
    );

    return (await this.findById(user.id))!;
  }

  async update(id: string, updates: Partial<User>): Promise<User> {
    const current = await this.findById(id);
    if (!current) throw new Error(`User '${id}' not found`);

    const sets: string[] = ['updated_at = ?'];
    const values: any[] = [new Date().toISOString()];

    if (updates.email !== undefined) {
      sets.push('email = ?');
      values.push(updates.email.toLowerCase().trim());
    }
    if (updates.displayName !== undefined) {
      sets.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.avatarUrl !== undefined) {
      sets.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      values.push(updates.status);
    }

    values.push(id);
    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    return (await this.findById(id))!;
  }

  async list(): Promise<User[]> {
    const rows = this.db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as any[];
    return rows.map((r) => this.mapRow(r));
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const rows = this.db.prepare(`
      SELECT r.id, r.name FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(userId) as any[];
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const roles = await this.getUserRoles(userId);
    // Return permissions based on assigned roles
    const perms = new Set<string>();
    for (const r of roles) {
      if (r.name === 'Owner' || r.name === 'Admin') {
        perms.add('*');
      } else if (r.name === 'Editor') {
        perms.add('content:*');
        perms.add('media:*');
        perms.add('taxonomy:*');
        perms.add('audit:read');
      } else if (r.name === 'Author') {
        perms.add('content:read');
        perms.add('content:create');
        perms.add('content:update');
        perms.add('content:review');
      } else if (r.name === 'Viewer') {
        perms.add('content:read');
      }
    }
    return Array.from(perms);
  }

  async setUserRoles(userId: string, roleIds: string[]): Promise<void> {
    this.db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
    const insertStmt = this.db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
    for (const roleId of roleIds) {
      insertStmt.run(userId, roleId);
    }
  }

  private mapRow(row: any): User {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
