import type { EventBus, Actor } from '@brew-cms/core';
import type { DomainEvent } from './types.js';

type EventHandler = (event: DomainEvent) => Promise<void> | void;

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private allHandlers = new Set<EventHandler>();

  async publish(event: {
    type: string;
    payload: unknown;
    correlationId?: string;
    actor?: Actor;
  }): Promise<void> {
    const fullEvent: DomainEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: event.type,
      payload: event.payload,
      actor: event.actor,
      correlationId: event.correlationId,
      timestamp: new Date(),
    };

    const specific = this.handlers.get(event.type) || new Set();
    const promises: Promise<void>[] = [];

    for (const handler of specific) {
      promises.push(Promise.resolve(handler(fullEvent)));
    }
    for (const handler of this.allHandlers) {
      promises.push(Promise.resolve(handler(fullEvent)));
    }

    await Promise.all(promises);
  }

  subscribe(eventType: string, handler: EventHandler): () => void {
    if (eventType === '*') {
      this.allHandlers.add(handler);
      return () => {
        this.allHandlers.delete(handler);
      };
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    const set = this.handlers.get(eventType)!;
    set.add(handler);

    return () => {
      set.delete(handler);
    };
  }
}
