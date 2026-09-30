import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { popoverClasses, scrollIntoList, usePopover } from './popover.tsx';
import { focusOnClick, preventSpaceClick, TRIGGER, TriggerChevron } from './select.tsx';
import { cx } from './ui.tsx';

interface TimePickerProps {
  id: string;
  /** «ЧЧ:ММ». */
  value: string;
  onChange: (value: string) => void;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean;
  className?: string;
}

type Column = 0 | 1;

const COLUMNS: readonly Column[] = [0, 1];
const LIMITS = [24, 60] as const;
const COLUMN_LABELS = ['Часы', 'Минуты'] as const;
const DIGITS_RESET_MS = 1200;

const pad = (n: number) => String(n).padStart(2, '0');

function parse(value: string): [number, number] {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return [Number.isInteger(h) ? h : 0, Number.isInteger(m) ? m : 0];
}

/**
 * Выбор времени: две колонки (часы и минуты) в выпадающей панели.
 * С клавиатуры: ↑/↓ меняют значение активной колонки, ←/→ переключают колонку,
 * цифры набирают время как в системном поле («0930»), Enter/Esc закрывают.
 */
export function TimePicker({ id, value, onChange, className, ...aria }: TimePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);
  const popover = usePopover(triggerRef, panelRef);
  const [column, setColumn] = useState<Column>(0);
  const digits = useRef({ text: '', at: 0 });
  const parts = parse(value);
  const optionId = (col: Column, n: number) => `${id}-${col}-${n}`;

  const set = (col: Column, n: number) => {
    const next: [number, number] = [...parts];
    next[col] = n;
    const formatted = `${pad(next[0])}:${pad(next[1])}`;
    if (formatted !== value) onChange(formatted);
  };

  const switchColumn = (col: Column) => {
    setColumn(col);
    digits.current.text = '';
  };

  const open = () => {
    switchColumn(0);
    popover.show();
  };

  const scrollColumns = (center: boolean) => {
    [hoursRef.current, minutesRef.current].forEach((list, col) => {
      const item = list?.children[parts[col as Column]];
      if (list && item instanceof HTMLElement) scrollIntoList(list, item, center);
    });
  };

  // При открытии — выбранные значения по центру колонок, дальше — держим их в видимой части.
  useLayoutEffect(() => {
    if (!popover.open) return;
    scrollColumns(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только в момент открытия
  }, [popover.open]);

  useEffect(() => {
    if (!popover.open) return;
    scrollColumns(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /** Набор цифрами: вторая цифра дополняет первую, если получается допустимое число. */
  const typeDigit = (digit: number) => {
    const now = Date.now();
    const state = digits.current;
    if (now - state.at > DIGITS_RESET_MS) state.text = '';
    state.at = now;

    let col = column;
    let text = state.text + digit;
    if (Number(text) >= LIMITS[col]) {
      // «25» в часах: 2 уже стоит, 5 — начало минут.
      if (col === 0) col = 1;
      text = String(digit);
    }
    set(col, Number(text));
    const complete = text.length === 2 || Number(text) * 10 >= LIMITS[col];
    if (col !== column) setColumn(col);
    if (complete && col === 0) {
      setColumn(1);
      state.text = '';
    } else {
      state.text = complete ? '' : text;
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      if (!popover.open) open();
      return typeDigit(Number(event.key));
    }

    if (!popover.open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }

    const limit = LIMITS[column];
    const step = (delta: number) => {
      event.preventDefault();
      digits.current.text = '';
      set(column, (parts[column] + delta + limit) % limit);
    };

    switch (event.key) {
      case 'ArrowDown':
        return step(1);
      case 'ArrowUp':
        return step(-1);
      case 'PageDown':
        return step(column === 0 ? 6 : 10);
      case 'PageUp':
        return step(column === 0 ? -6 : -10);
      case 'Home':
        event.preventDefault();
        return set(column, 0);
      case 'End':
        event.preventDefault();
        return set(column, limit - 1);
      case 'ArrowLeft':
        event.preventDefault();
        return switchColumn(0);
      case 'ArrowRight':
      case ':':
      case '.':
        event.preventDefault();
        return switchColumn(1);
      case 'Enter':
      case ' ':
      case 'Escape':
        event.preventDefault();
        return popover.hide();
      case 'Tab':
        return popover.hide();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={popover.open}
        aria-controls={`${id}-0 ${id}-1`}
        aria-activedescendant={popover.open ? optionId(column, parts[column]) : undefined}
        {...aria}
        onClick={(event) => {
          focusOnClick(event);
          if (popover.open) popover.hide();
          else open();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={preventSpaceClick}
        onBlur={popover.hide}
        className={cx(TRIGGER, 'tabular', className)}
      >
        {value}
        <TriggerChevron />
      </button>

      <div
        ref={panelRef}
        onMouseDown={(event) => event.preventDefault()}
        className={popoverClasses(popover.open, popover.placement, 'flex gap-1')}
      >
        {COLUMNS.map((col) => {
          const isActiveColumn = col === column;
          return (
            <div key={col} className="flex min-w-16 flex-1 flex-col">
              <div className="px-1 pt-1 pb-1.5 text-center text-[11px] font-medium text-subtle">
                {COLUMN_LABELS[col]}
              </div>
              <div
                ref={col === 0 ? hoursRef : minutesRef}
                id={`${id}-${col}`}
                role="listbox"
                aria-label={COLUMN_LABELS[col]}
                className="relative flex max-h-56 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]"
              >
                {Array.from({ length: LIMITS[col] }, (_, n) => {
                  const isSelected = n === parts[col];
                  return (
                    <div
                      key={n}
                      id={optionId(col, n)}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        set(col, n);
                        // Часы, потом минуты: после минут выбор закончен.
                        if (col === 0) switchColumn(1);
                        else popover.hide();
                      }}
                      className={cx(
                        'tabular grid h-8 shrink-0 cursor-pointer place-items-center rounded-lg text-sm transition-colors duration-100',
                        !isSelected && 'text-fg hover:bg-row-hover',
                        isSelected &&
                          (isActiveColumn
                            ? 'bg-accent font-medium text-accent-fg'
                            : 'bg-accent-soft font-medium text-accent-text'),
                      )}
                    >
                      {pad(n)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
