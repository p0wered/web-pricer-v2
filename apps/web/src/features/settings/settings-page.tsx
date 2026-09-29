import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useSettings } from '../../api/queries.ts';
import { AppHeader } from '../../components/app-header.tsx';
import { CARD, cx, Notice } from '../../components/ui.tsx';
import { ImportPanel } from './import-panel.tsx';
import { ImportSettingsForm } from './import-settings-form.tsx';
import { PasswordForm } from './password-form.tsx';

interface BlockProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

/** Блок настроек: заголовок, пояснение, содержимое. */
function Block({ title, description, children }: BlockProps) {
  return (
    <section className={cx(CARD, 'p-5')}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-subtle">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const settings = useSettings();

  useEffect(() => {
    document.title = 'Настройки — WebPricer';
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <AppHeader page="settings">
        <h1 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Настройки</h1>
      </AppHeader>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* Раскладка как в старой версии: слева импорт и пароль, справа настройки импорта. */}
        <div className="grid items-start gap-3 lg:grid-cols-2">
          <div className="grid gap-3">
            <Block
              title="Импорт данных"
              description="Скачать файл по настройкам импорта и обновить данные сейчас. Во время импорта поиск работает по прежним данным."
            >
              <ImportPanel />
            </Block>
            <Block
              title="Пароль для входа"
              description="Один пароль для всех сотрудников. После смены остальные сеансы завершатся."
            >
              <PasswordForm />
            </Block>
          </div>

          <Block
            title="Настройки импорта"
            description="Откуда скачивать файл и когда обновлять данные автоматически."
          >
            {settings.isPending && (
              <p className="flex items-center gap-2 text-[13px] text-subtle">
                <Loader2 aria-hidden size={15} className="animate-spin" /> Загрузка…
              </p>
            )}
            {settings.isError && <Notice tone="error">{settings.error.message}</Notice>}
            {settings.data && <ImportSettingsForm data={settings.data} />}
          </Block>
        </div>
      </main>
    </div>
  );
}
