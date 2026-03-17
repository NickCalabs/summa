export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private backoffUntil = 0;

  constructor(
    private maxTokens: number = 25,
    private refillIntervalMs: number = 60_000
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }

  acquire(): boolean {
    if (Date.now() < this.backoffUntil) return false;
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    return false;
  }

  async waitForToken(): Promise<void> {
    while (!this.acquire()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  reportRateLimit() {
    this.backoffUntil = Date.now() + 60_000;
    this.tokens = 0;
  }
}

export class TtlCache<T> {
  private store = new Map<string, { data: T; expiresAt: number }>();
  private maxSize: number;

  constructor(maxSize: number = 500) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T, ttlMs: number) {
    // Evict expired entries if at capacity
    if (this.store.size >= this.maxSize) {
      const now = Date.now();
      for (const [k, v] of this.store) {
        if (now > v.expiresAt) this.store.delete(k);
      }
      // If still at capacity after eviction, remove oldest entry
      if (this.store.size >= this.maxSize) {
        const firstKey = this.store.keys().next().value;
        if (firstKey !== undefined) this.store.delete(firstKey);
      }
    }
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}
