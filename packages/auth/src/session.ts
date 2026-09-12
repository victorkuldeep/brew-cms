import { randomBytes } from 'node:crypto';
import type { User, Role } from '@brew-cms/core';

export interface SessionData {
  sessionId: string;
  userId: string;
  user: User;
  roles: Role[];
  permissions: string[];
  createdAt: Date;
  expiresAt: Date;
}

export interface SessionStore {
  createSession(data: Omit<SessionData, 'sessionId' | 'createdAt'>): Promise<SessionData>;
  getSession(sessionId: string): Promise<SessionData | null>;
  deleteSession(sessionId: string): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionData>();

  async createSession(data: Omit<SessionData, 'sessionId' | 'createdAt'>): Promise<SessionData> {
    const sessionId = randomBytes(32).toString('hex');
    const session: SessionData = {
      ...data,
      sessionId,
      createdAt: new Date(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
