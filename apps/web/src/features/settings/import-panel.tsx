import type { ImportRun } from '@webpricer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useImportRun, useStartImport } from '../../api/queries.ts';
import { Button, Notice } from '../../components/ui.tsx';
import { formatCount } from '../../lib/format.ts';

const STAGE_TEXT: Record<NonNullable<ImportRun['stage']>, string> = {
  download: 'Скачивание файла…',
  parse: 'Разбор листов…',
  finalize: 'Завершение…',
};

/** Ручной импорт: запуск, ход и итог (как кнопка «Начать импорт» в старой версии). */
export function ImportPanel() {
  const [runId, setRunId] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const start = useStartImport();
  const run = useImportRun(runId);
  const queryClient = useQueryClient();

  const status = run.data?.status;
  const running = start.isPending || status === 'running' || (runId !== null && !run.data);

  // После успешного импорта поиск должен брать свежие данные.
  useEffect(() => {
    if (status === 'success') void queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [status, queryClient]);

  const launch = () =>
    start.mutate(undefined, {
      onSuccess: ({ runId: id, alreadyRunning }) => {
        setRunId(id);
        setJoined(alreadyRunning);
      },
    });

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          icon={running ? undefined : Download}
          disabled={running}
          onClick={launch}
        >
          {running && <Loader2 aria-hidden size={15} strokeWidth={2} className="animate-spin" />}
          {running ? 'Импорт выполняется…' : 'Запустить импорт'}
        </Button>
        {running && run.data?.stage && (
          <span className="text-[13px] text-muted" aria-live="polite">
            {STAGE_TEXT[run.data.stage]}
          </span>
        )}
      </div>

      {joined && running && (
        <Notice tone="info">
          Импорт уже был запущен (по расписанию или другим пользователем) — показываем его ход.
        </Notice>
      )}
      {start.isError && <Notice tone="error">{start.error.message}</Notice>}
      {status === 'success' && run.data && (
        <Notice tone="success">
          Импорт завершён: детали — {formatCount(run.data.rowsMain ?? 0)} строк, стоп-лист —{' '}
          {formatCount(run.data.rowsSpecial ?? 0)} строк.
        </Notice>
      )}
      {status === 'failed' && run.data && (
        <Notice tone="error">{run.data.errorMessage ?? 'Ошибка при импорте.'}</Notice>
      )}
    </div>
  );
}
