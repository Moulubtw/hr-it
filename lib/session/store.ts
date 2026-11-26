/**
 * Session storage. On the static site sessions live in the visitor's
 * browser (localStorage); the in-memory store is for tests.
 */
import { sessionSchema, type Session } from "@/lib/schema";

export const LOCK_SECONDS = 90;

export interface SessionStore {
  get(id: string): Promise<Session | null>;
  set(session: Session): Promise<void>;
  /** One AI operation per session at a time (double clicks). */
  lock(id: string): Promise<boolean>;
  unlock(id: string): Promise<void>;
}

function createLocks(now: () => number) {
  const locks = new Map<string, number>();
  return {
    async lock(id: string) {
      const until = locks.get(id);
      if (until && until > now()) return false;
      locks.set(id, now() + LOCK_SECONDS * 1000);
      return true;
    },
    async unlock(id: string) {
      locks.delete(id);
    },
  };
}

export function createMemoryStore(now: () => number = Date.now): SessionStore {
  const map = new Map<string, Session>();
  return {
    async get(id) {
      const hit = map.get(id);
      return hit ? structuredClone(hit) : null;
    },
    async set(session) {
      map.set(session.id, structuredClone(session));
    },
    ...createLocks(now),
  };
}

const PREFIX = "hrit:session:";

export function createLocalStore(storage: Storage = localStorage, now: () => number = Date.now): SessionStore {
  return {
    async get(id) {
      try {
        const raw = storage.getItem(PREFIX + id);
        if (!raw) return null;
        const parsed = sessionSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    async set(session) {
      try {
        storage.setItem(PREFIX + session.id, JSON.stringify(session));
      } catch {
        throw new Error("Не удалось сохранить сессию в браузере: память переполнена или недоступна.");
      }
    },
    ...createLocks(now),
  };
}
