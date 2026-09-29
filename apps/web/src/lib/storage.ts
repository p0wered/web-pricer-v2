// localStorage для личных удобств (тема, раскладка, ширина панелей). Может быть недоступен
// (приватный режим, запрет сайта) — тогда просто работаем без сохранения.

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Без сохранения — не страшно.
  }
}
