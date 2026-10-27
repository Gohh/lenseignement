import Redis from 'ioredis';
import { serverEnv } from './env';

/** Session serveur : les jetons ne quittent jamais le serveur, le navigateur ne reçoit qu'un identifiant opaque. */
export interface SessionData {
  subject: string;
  displayName: string;
  roles: string[];
  accessToken: string;
  /** Expiration du jeton d'accès, en secondes depuis l'époque Unix. */
  accessTokenExpiresAt: number;
  refreshToken?: string;
  idToken?: string;
}

/** État temporaire entre la redirection vers le fournisseur d'identité et le retour (PKCE, nonce). */
export interface LoginState {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
}

interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Lit puis supprime la clé de façon atomique (usage unique). */
  take(key: string): Promise<string | null>;
  expire(key: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async take(key: string) {
    const value = await this.get(key);
    this.entries.delete(key);
    return value;
  }
  async expire(key: string, ttlSeconds: number) {
    const entry = this.entries.get(key);
    if (entry) entry.expiresAt = Date.now() + ttlSeconds * 1000;
  }
  async del(key: string) {
    this.entries.delete(key);
  }
}

class RedisStore implements KeyValueStore {
  constructor(private readonly redis: Redis) {}

  get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }
  take(key: string) {
    return this.redis.getdel(key);
  }
  async expire(key: string, ttlSeconds: number) {
    await this.redis.expire(key, ttlSeconds);
  }
  async del(key: string) {
    await this.redis.del(key);
  }
}

// Conservé sur globalThis pour survivre au rechargement à chaud en développement.
const globalForStore = globalThis as unknown as { lseSessionStore?: KeyValueStore };

function store(): KeyValueStore {
  if (!globalForStore.lseSessionStore) {
    const env = serverEnv();
    globalForStore.lseSessionStore =
      env.SESSION_STORE === 'memory'
        ? new MemoryStore()
        : new RedisStore(new Redis(env.REDIS_URL, { keyPrefix: 'lse:', lazyConnect: false }));
  }
  return globalForStore.lseSessionStore;
}

/** Inactivité maximale d'une session (30 min, aligné sur Keycloak). */
export const SESSION_IDLE_SECONDS = 30 * 60;
const LOGIN_STATE_TTL_SECONDS = 10 * 60;

export const sessionStore = {
  async load(id: string): Promise<SessionData | null> {
    const raw = await store().get(`session:${id}`);
    if (!raw) return null;
    await store().expire(`session:${id}`, SESSION_IDLE_SECONDS);
    return JSON.parse(raw) as SessionData;
  },
  save(id: string, data: SessionData) {
    return store().set(`session:${id}`, JSON.stringify(data), SESSION_IDLE_SECONDS);
  },
  destroy(id: string) {
    return store().del(`session:${id}`);
  },
  saveLoginState(state: string, data: LoginState) {
    return store().set(`login:${state}`, JSON.stringify(data), LOGIN_STATE_TTL_SECONDS);
  },
  async takeLoginState(state: string): Promise<LoginState | null> {
    const raw = await store().take(`login:${state}`);
    return raw ? (JSON.parse(raw) as LoginState) : null;
  },
};
