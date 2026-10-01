import { ChevronLeft, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { useSettings } from '../../api/queries.ts';
import { AppMenu } from '../../components/app-header.tsx';
import { buttonClasses } from '../../components/button.tsx';
import { Notice } from '../../components/ui.tsx';
import { ImportPanel } from './import-panel.tsx';
import { ImportSettingsForm } from './import-settings-form.tsx';
import { PasswordForm } from './password-form.tsx';
import { Section } from './section.tsx';

export function SettingsPage() {
  const settings = useSettings();

  useEffect(() => {
    document.title = 'Настройки — WebPricer';
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      {/* Одна колонка: разделы идут сверху вниз в порядке смысла — импорт, потом пароль. */}
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8 px-4 pt-3 pb-12">
        {/* Меню позиционируется от этой строки — под её правым краем. */}
        <header className="relative flex items-center justify-between">
          <Link
            to="/search"
            className={buttonClasses({ variant: 'ghost', size: 'lg', className: 'pl-1.5' })}
          >
            <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
            Поиск
          </Link>
          {/* По центру всей строки, а не промежутка между кнопками — их ширина разная. */}
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold tracking-[-0.01em] text-fg">
            Настройки
          </h1>
          <nav aria-label="Приложение">
            <AppMenu settings={false} variant="ghost" />
          </nav>
        </header>

        <Section title="Импорт данных">
          <ImportPanel nextRunAt={settings.data?.nextRunAt ?? null} />
        </Section>

        {settings.isPending && (
          <p className="flex items-center gap-2 px-1 text-[13px] text-subtle">
            <Loader2 aria-hidden size={15} className="animate-spin" /> Загрузка настроек…
          </p>
        )}
        {settings.isError && <Notice tone="error">{settings.error.message}</Notice>}
        {settings.data && <ImportSettingsForm data={settings.data} />}

        <PasswordForm />
      </div>
    </div>
  );
}
