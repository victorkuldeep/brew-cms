export interface IdempotencyRecord {
  key: string;
  actorId: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
}

export class InMemoryIdempotencyStore {
  private cache = new Map<string, IdempotencyRecord>();

  get(key: string, actorId: string): IdempotencyRecord | null {
    const compositeKey = `${actorId}:${key}`;
    const record = this.cache.get(compositeKey);
    if (!record) return null;

    if (record.expiresAt < new Date()) {
      this.cache.delete(compositeKey);
      return null;
    }
    return record;
  }

  set(
    key: string,
    actorId: string,
    responseStatus: number,
    responseBody: unknown,
    ttlSeconds: number = 3600
  ): void {
    const compositeKey = `${actorId}:${key}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    this.cache.set(compositeKey, {
      key,
      actorId,
      responseStatus,
      responseBody,
      expiresAt,
    });
  }
}
