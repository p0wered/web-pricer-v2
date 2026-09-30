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
        <div className="flex flex-col gap-4">
          {/* Меню позиционируется от этой строки — под её правым краем. */}
          <nav className="relative flex items-center justify-between" aria-label="Приложение">
            <Link
              to="/search"
              className={buttonClasses({ variant: 'ghost', size: 'lg', className: '-ml-3' })}
            >
              <ChevronLeft aria-hidden size={16} strokeWidth={1.75} />
              Поиск
            </Link>
            <AppMenu settings={false} />
          </nav>
          <h1 className="px-1 text-[26px] font-bold tracking-[-0.02em] text-fg">Настройки</h1>
        </div>

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
