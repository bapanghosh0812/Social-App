import { logger } from '../config/logger.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class RedisCacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private hitCount = 0;
  private missCount = 0;

  constructor() {
    // Periodic eviction of expired keys every 30s
    setInterval(() => this.cleanup(), 30000);
  }

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  public async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  public async invalidatePattern(pattern: string): Promise<void> {
    const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  public getStats() {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.hitCount + this.missCount > 0 
        ? `${((this.hitCount / (this.hitCount + this.missCount)) * 100).toFixed(1)}%` 
        : '100%'
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

export const redis = new RedisCacheService();
