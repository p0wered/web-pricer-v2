import { useCallback, useEffect, useState } from 'react';
import { readStored, writeStored } from './storage.ts';

// Цветные строки таблиц (фон цвета поставщика): по умолчанию включены, выключение запоминается.
// Применяется атрибутом на <html> — его же ставит скрипт в index.html до первой отрисовки, а
// стили (index.css) убирают фон строк. Таблицам не нужно знать о настройке.

const STORAGE_KEY = 'webpricer.row-colors';

function apply(enabled: boolean): void {
  const root = document.documentElement;
  if (enabled) delete root.dataset.rowColors;
  else root.dataset.rowColors = 'off';
}

export function useRowColors(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState(() => readStored(STORAGE_KEY) !== 'off');

  useEffect(() => apply(enabled), [enabled]);

  const toggle = useCallback(() => {
    setEnabled((current) => {
      writeStored(STORAGE_KEY, current ? 'off' : null);
      return !current;
    });
  }, []);

  return { enabled, toggle };
}
