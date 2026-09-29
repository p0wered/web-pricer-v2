// Ограничение попыток входа — как в старой версии (Laravel RateLimiter): не больше 5
// неудачных попыток с одного IP, затем блокировка на минуту; успешный вход сбрасывает счётчик.
// Хранится в памяти процесса: сервер один, а после перезапуска начать заново — нормально.

export interface LimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

interface Entry {
  failures: number;
  /** Когда окно (и блокировка) заканчивается. */
  resetAt: number;
}

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly options: LimiterOptions;

  constructor(options: LimiterOptions = { maxAttempts: 5, windowMs: 60_000 }) {
    this.options = options;
  }

  /** Сколько секунд ждать, если попытки исчерпаны; иначе 0. */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.current(key, now);
    if (!entry || entry.failures < this.options.maxAttempts) return 0;
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.current(key, now);
    if (entry) entry.failures++;
    else this.entries.set(key, { failures: 1, resetAt: now + this.options.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private current(key: string, now: number): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
