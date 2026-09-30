import { useCallback, useEffect, useState } from 'react';
import { readStored, writeStored } from './storage.ts';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'webpricer.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function systemTheme(): Theme {
  return media().matches ? 'dark' : 'light';
}

function storedTheme(): Theme | null {
  const value = readStored(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (root.classList.contains('dark') === (theme === 'dark')) return;
  // На время смены темы переходы выключены: иначе кнопки и поля плавно «догоняют» новую
  // палитру, а в неактивной вкладке и вовсе застревают в старых цветах. Кроме элементов
  // с data-theme-animate: сам переключатель темы должен анимироваться.
  const freeze = document.createElement('style');
  freeze.textContent =
    '*:not([data-theme-animate]),*::before,*::after{transition:none!important}';
  document.head.append(freeze);
  root.classList.toggle('dark', theme === 'dark');
  void root.offsetHeight; // применить стили до того, как вернуть переходы
  requestAnimationFrame(() => freeze.remove());
}

/** Тема: пока пользователь не выбрал сам — как в системе; выбор запоминается. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => apply(theme), [theme]);

  useEffect(() => {
    const query = media();
    const onChange = () => {
      if (!storedTheme()) setTheme(systemTheme());
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      // Совпал с системной — выбор можно не хранить: дальше тема снова следует системе.
      writeStored(STORAGE_KEY, next === systemTheme() ? null : next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
