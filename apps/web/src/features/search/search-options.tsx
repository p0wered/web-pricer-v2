// Кнопка «Параметры» в строке поиска: меню с переключателями поиска и выдачи.
import { SlidersHorizontal } from 'lucide-react';
import { buttonClasses } from '../../components/button.tsx';
import {
  DropdownMenu,
  MENU_TRIGGER_OPEN,
  MenuToggle,
  type MenuToggleProps,
} from '../../components/menu.tsx';
import { cx } from '../../components/ui.tsx';

interface SearchOptionsProps {
  /** Переключатели поиска и вида таблиц — одним списком, без разделителей: их немного. */
  toggles: MenuToggleProps[];
  /**
   * Включено что-то, что сужает выдачу («число целиком»): на кнопке — точка, чтобы закрытое меню
   * не прятало, почему нашлось меньше.
   */
  narrowed: boolean;
}

export function SearchOptions({ toggles, narrowed }: SearchOptionsProps) {
  return (
    <div className="relative shrink-0">
      <DropdownMenu
        label="Параметры поиска"
        title={narrowed ? 'Параметры поиска: включено «Число целиком»' : 'Параметры поиска'}
        triggerClassName={buttonClasses({
          size: 'lg',
          className: cx('relative px-3', MENU_TRIGGER_OPEN),
        })}
        trigger={
          <>
            <SlidersHorizontal aria-hidden size={16} strokeWidth={1.75} />
            <span className="hidden lg:inline">Параметры</span>
            {narrowed && (
              <span
                aria-hidden
                className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-sunken"
              />
            )}
          </>
        }
        panelClassName="right-0 w-60 origin-top-right"
      >
        {() => toggles.map((item) => <MenuToggle key={item.label} {...item} />)}
      </DropdownMenu>
    </div>
  );
}
