// Ограничение попыток входа — как в старой версии (Laravel RateLimiter): не больше 5
// неудачных попыток с одного IP, затем блокировка на минуту; успешный вход сбрасывает счётчик.
//
// Сверх этого — общий лимит неудач со всех IP (20 в минуту). IP клиента зависит от настройки
// прокси заказчика: если прокси пропускает присланный клиентом X-Forwarded-For, IP можно
// подделать, и лимит по IP не спасёт от перебора. Общий лимит от прокси не зависит. Цена —
// при переборе вход может быть закрыт для всех до конца минуты.
//
// Попытка учитывается до проверки пароля (`acquire`), а не после: проверка scrypt идёт
// асинхронно, и иначе параллельные запросы проходили бы проверку лимита все разом.
// Хранится в памяти процесса: сервер один, а после перезапуска начать заново — нормально.

export interface LimiterOptions {
  /** Неудачных попыток с одного IP за окно. */
  maxAttempts: number;
  /** Неудачных попыток со всех IP вместе за окно. */
  maxGlobalAttempts: number;
  windowMs: number;
}

interface Entry {
  failures: number;
  /** Когда окно (и блокировка) заканчивается. */
  resetAt: number;
}

const DEFAULT_OPTIONS: LimiterOptions = { maxAttempts: 5, maxGlobalAttempts: 20, windowMs: 60_000 };

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  private global: Entry | undefined;
  private readonly options: LimiterOptions;

  constructor(options: Partial<LimiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Перед проверкой пароля: если попытки исчерпаны — сколько секунд ждать; иначе 0, и попытка
   * уже учтена как неудачная (верный пароль — {@link succeeded}).
   */
  acquire(key: string, now = Date.now()): number {
    const entry = this.current(key, now);
    const global = this.currentGlobal(now);
    const waits: number[] = [];
    if (entry && entry.failures >= this.options.maxAttempts) waits.push(entry.resetAt);
    if (global && global.failures >= this.options.maxGlobalAttempts) waits.push(global.resetAt);
    if (waits.length > 0) return Math.max(1, Math.ceil((Math.max(...waits) - now) / 1000));

    this.pruneExpired(now);
    if (entry) entry.failures++;
    else this.entries.set(key, { failures: 1, resetAt: now + this.options.windowMs });
    if (global) global.failures++;
    else this.global = { failures: 1, resetAt: now + this.options.windowMs };
    return 0;
  }

  /** Пароль верный: попытка не была неудачной, счётчик IP сбрасывается. */
  succeeded(key: string, now = Date.now()): void {
    this.entries.delete(key);
    const global = this.currentGlobal(now);
    if (global && global.failures > 0) global.failures--;
  }

  /** Сколько IP сейчас учитывается (для тестов). */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Удаляет истёкшие записи, иначе каждый новый IP с неудачной попыткой оставался бы в памяти
   * до перезапуска. Окно у всех записей одно, и они добавляются по времени, поэтому Map
   * упорядочена по resetAt: удаляем с начала до первой живой записи.
   */
  private pruneExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt > now) break;
      this.entries.delete(key);
    }
  }

  private current(key: string, now: number): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.resetAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private currentGlobal(now: number): Entry | undefined {
    if (this.global && this.global.resetAt <= now) this.global = undefined;
    return this.global;
  }
}
