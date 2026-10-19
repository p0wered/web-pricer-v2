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
}

export function SearchOptions({ toggles }: SearchOptionsProps) {
  // Включён хоть один параметр — кнопка «нажата», как были EN→RU и год: закрытое меню не прячет,
  // что поиск или таблицы работают не как обычно.
  const active = toggles.filter((item) => item.on).map((item) => `«${item.label}»`);
  return (
    <div className="relative shrink-0">
      <DropdownMenu
        label="Параметры поиска"
        title={
          active.length > 0 ? `Параметры поиска: включено ${active.join(', ')}` : 'Параметры поиска'
        }
        triggerClassName={buttonClasses({
          size: 'lg',
          pressed: active.length > 0,
          className: cx('px-3', MENU_TRIGGER_OPEN),
        })}
        trigger={
          <>
            <SlidersHorizontal aria-hidden size={16} strokeWidth={1.75} />
            <span className="hidden lg:inline">Параметры</span>
          </>
        }
        panelClassName="right-0 w-60 origin-top-right"
      >
        {() => toggles.map((item) => <MenuToggle key={item.label} {...item} />)}
      </DropdownMenu>
    </div>
  );
}
