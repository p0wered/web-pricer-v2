import { ClipboardPaste, Copy, Scissors, Search, X } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Button } from '../../components/button.tsx';
import { applyLayoutConversion } from '../../lib/keyboard-layout.ts';
import { readStored, writeStored } from '../../lib/storage.ts';

const LAYOUT_KEY = 'webpricer.layout-convert';

// Буфер обмена браузер даёт только на HTTPS (и localhost); на http-адресе кнопки неактивны.
const clipboardAvailable = () => typeof navigator !== 'undefined' && Boolean(navigator.clipboard);

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [convert, setConvert] = useState(() => readStored(LAYOUT_KEY) === 'true');
  const clipboard = clipboardAvailable();
  const clipboardHint = clipboard ? undefined : 'Буфер обмена доступен только по HTTPS';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const toggleConvert = () => {
    setConvert((current) => {
      writeStored(LAYOUT_KEY, String(!current));
      return !current;
    });
    inputRef.current?.focus();
  };

  const paste = async () => {
    try {
      onChange((await navigator.clipboard.readText()).trim());
    } catch {
      // Пользователь не разрешил чтение буфера — ничего не делаем.
    }
    inputRef.current?.focus();
  };

  const copy = async (clear: boolean) => {
    try {
      await navigator.clipboard.writeText(value);
      if (clear) onChange('');
    } catch {
      // Нет доступа к буферу.
    }
    inputRef.current?.focus();
  };

  return (
    <form role="search" onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
      <div className="relative min-w-40 flex-1 lg:max-w-[640px]">
        <Search
          aria-hidden
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
        />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(event) => onChange(applyLayoutConversion(value, event.target.value, convert))}
          placeholder="Введите запрос"
          aria-label="Запрос"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className={
            'h-9 w-full border border-transparent rounded-lg bg-sunken pr-9 pl-9 text-sm text-fg transition duration-150 ' +
            'focus:border-accent focus:bg-surface focus:outline-none focus:ring-0 ' +
            '[&::-webkit-search-cancel-button]:hidden'
          }
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            aria-label="Очистить запрос"
            title="Очистить"
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-subtle hover:bg-line hover:text-fg"
          >
            <X aria-hidden size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      <Button type="submit" variant="primary">
        Найти
      </Button>
      <Button
        pressed={convert}
        onClick={toggleConvert}
        title="Переводить набранное в английской раскладке в русскую"
      >
        EN→RU
      </Button>
      <div className="hidden items-center gap-2 sm:flex" role="group" aria-label="Буфер обмена">
        <Button
          variant="secondary"
          icon={ClipboardPaste}
          disabled={!clipboard}
          onClick={paste}
          title={clipboardHint ?? 'Вставить из буфера'}
          aria-label="Вставить"
        >
          <span className="hidden 2xl:inline">Вставить</span>
        </Button>
        <Button
          variant="secondary"
          icon={Copy}
          disabled={!clipboard || !value}
          onClick={() => copy(false)}
          title={clipboardHint ?? 'Копировать запрос'}
          aria-label="Копировать"
        >
          <span className="hidden 2xl:inline">Копировать</span>
        </Button>
        <Button
          variant="secondary"
          icon={Scissors}
          disabled={!clipboard || !value}
          onClick={() => copy(true)}
          title={clipboardHint ?? 'Вырезать запрос'}
          aria-label="Вырезать"
        >
          <span className="hidden 2xl:inline">Вырезать</span>
        </Button>
      </div>
    </form>
  );
}
