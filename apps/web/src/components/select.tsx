import { Check, ChevronDown } from 'lucide-react';
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { FIELD_INPUT } from './input.tsx';
import { popoverClasses, scrollIntoList, usePopover } from './popover.tsx';
import { cx } from './ui.tsx';

/**
 * Кнопка-поле выпадающего списка: выглядит как TextInput, подпись Field остаётся наверху.
 * Пока список открыт, фокус остаётся на кнопке (aria-activedescendant), поэтому
 * `peer-focus` у подписи продолжает работать.
 */
export const TRIGGER =
  `${FIELD_INPUT} group relative cursor-pointer pr-9 text-left select-none ` +
  'aria-expanded:border-accent aria-expanded:bg-surface';

export function TriggerChevron() {
  return (
    <ChevronDown
      aria-hidden
      size={16}
      className="absolute top-1/2 right-3 -translate-y-1/2 text-subtle transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none"
    />
  );
}

/** Enter и пробел обрабатываются в keydown; без этого кнопка ещё и «кликнет» (в Firefox — на keyup). */
export function preventSpaceClick(event: KeyboardEvent) {
  if (event.key === ' ') event.preventDefault();
}

/** Клик по кнопке мышью: Safari не переводит на неё фокус сам, а клавиатура нужна и после клика. */
export function focusOnClick(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget.focus();
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  id: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  /** Больше одной колонки — сетка (числа месяца): стрелки вверх/вниз ходят по строкам. */
  columns?: number;
  'aria-describedby'?: string | undefined;
  'aria-invalid'?: boolean;
  className?: string;
}

const TYPEAHEAD_RESET_MS = 700;

/** Выпадающий список по шаблону WAI-ARIA «select-only combobox». */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  columns = 1,
  className,
  ...aria
}: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popover = usePopover(triggerRef, panelRef);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const typeahead = useRef({ text: '', at: 0 });
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-opt-${index}`;
  const grid = columns > 1;
  const selected = options[selectedIndex];

  const open = () => {
    setActive(selectedIndex);
    popover.show();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    popover.hide();
  };

  // Открытие — выбранный пункт по центру списка; дальше — просто держим активный в видимой части.
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`#${CSS.escape(optionId(selectedIndex))}`);
    if (popover.open && list && item) scrollIntoList(list, item, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- только в момент открытия
  }, [popover.open]);

  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`);
    if (popover.open && list && item) scrollIntoList(list, item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const findByText = (key: string): number => {
    const now = Date.now();
    const state = typeahead.current;
    state.text = now - state.at > TYPEAHEAD_RESET_MS ? key : state.text + key;
    state.at = now;
    const typed = state.text.toLocaleLowerCase('ru');
    // Одна буква (или одна и та же подряд) — следующий пункт на неё после текущего,
    // разные буквы — первый пункт с таким началом.
    const cycling = [...typed].every((char) => char === typed[0]);
    const text = cycling ? typed.slice(0, 1) : typed;
    const from = popover.open ? active : selectedIndex;
    const start = cycling ? from + 1 : from;
    for (let step = 0; step < options.length; step++) {
      const index = (start + step) % options.length;
      if (options[index]?.label.toLocaleLowerCase('ru').startsWith(text)) return index;
    }
    return -1;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      setActive(Math.min(last, Math.max(0, to)));
    };

    if (!popover.open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Как у системного select: буква без открытия списка сразу меняет значение.
        const index = findByText(event.key);
        if (index >= 0) choose(index);
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        return move(active + columns);
      case 'ArrowUp':
        return move(active - columns);
      case 'ArrowRight':
        return grid ? move(active + 1) : undefined;
      case 'ArrowLeft':
        return grid ? move(active - 1) : undefined;
      case 'Home':
        return move(0);
      case 'End':
        return move(last);
      case 'Enter':
      case ' ':
        event.preventDefault();
        return choose(active);
      case 'Tab':
        return choose(active);
      case 'Escape':
        event.preventDefault();
        return popover.hide();
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const index = findByText(event.key);
          if (index >= 0) setActive(index);
        }
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
        aria-controls={listId}
        aria-activedescendant={popover.open ? optionId(active) : undefined}
        {...aria}
        onClick={(event) => {
          focusOnClick(event);
          if (popover.open) popover.hide();
          else open();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={preventSpaceClick}
        onBlur={popover.hide}
        className={cx(TRIGGER, className)}
      >
        <span className="block truncate">{selected?.label}</span>
        <TriggerChevron />
      </button>

      <div
        ref={panelRef}
        // Клик по пункту или полосе прокрутки не должен забирать фокус у кнопки.
        onMouseDown={(event) => event.preventDefault()}
        className={popoverClasses(popover.open, popover.placement, grid ? 'w-max' : undefined)}
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className={cx('relative max-h-72 overflow-y-auto', grid && 'grid gap-0.5')}
          style={
            grid ? { gridTemplateColumns: `repeat(${columns}, minmax(2.25rem, 1fr))` } : undefined
          }
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex;
            const isActive = popover.open && index === active;
            return (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                onMouseMove={() => index !== active && setActive(index)}
                onClick={() => choose(index)}
                className={cx(
                  'cursor-pointer text-sm transition-colors duration-100',
                  grid
                    ? 'tabular grid h-9 place-items-center rounded-lg'
                    : 'flex h-9 items-center justify-between gap-6 rounded-lg pr-2 pl-2.5 whitespace-nowrap',
                  grid && isSelected
                    ? 'bg-accent font-medium text-accent-fg'
                    : cx('text-fg', isActive && 'bg-row-hover', isSelected && 'font-medium'),
                )}
              >
                {option.label}
                {!grid && (
                  <Check
                    aria-hidden
                    size={15}
                    strokeWidth={2.25}
                    className={cx('text-accent', !isSelected && 'invisible')}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
