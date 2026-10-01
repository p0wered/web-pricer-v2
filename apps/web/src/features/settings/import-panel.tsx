import type { ImportRun, ImportStatusResponse } from '@webpricer/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useImportRun, useImportStatus, useStartImport } from '../../api/queries.ts';
import { Button } from '../../components/button.tsx';
import { Reveal } from '../../components/reveal.tsx';
import { Notice } from '../../components/ui.tsx';
import { formatCount, formatRecentDateTime } from '../../lib/format.ts';

type Stage = NonNullable<ImportRun['stage']>;

const STAGES: Record<Stage, { title: string; step: number }> = {
  download: { title: 'Скачивание файла', step: 1 },
  parse: { title: 'Разбор листов', step: 2 },
  finalize: { title: 'Завершение', step: 3 },
};
const STAGE_COUNT = 3;

const megabytes = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const formatMegabytes = (bytes: number) => megabytes.format(bytes / 1024 / 1024);

const rowsPlural = new Intl.PluralRules('ru-RU');
const ROWS_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: 'строка',
  few: 'строки',
};
const formatRows = (count: number) =>
  `${formatCount(count)} ${ROWS_WORD[rowsPlural.select(count)] ?? 'строк'}`;

interface ProgressView {
  stage: Stage | null;
  /** Доля этапа от 0 до 1; `null` — неизвестна (полоса бежит без конца). */
  fraction: number | null;
  detail: string;
}

/** Что показать в индикаторе по ответу сервера. */
function describe(run: ImportRun | undefined): ProgressView {
  // Импорт завершился — полоса дозаполняется, пока область сворачивается.
  if (run?.status === 'success') return { stage: 'finalize', fraction: 1, detail: 'Готово' };
  const stage = run?.stage ?? null;
  const progress = run?.progress ?? null;

  if (progress?.stage === 'download') {
    const { bytes, totalBytes } = progress;
    return totalBytes
      ? {
          stage,
          fraction: bytes / totalBytes,
          detail: `Скачано ${formatMegabytes(bytes)} из ${formatMegabytes(totalBytes)} МБ`,
        }
      : { stage, fraction: null, detail: `Скачано ${formatMegabytes(bytes)} МБ` };
  }
  if (progress?.stage === 'parse') {
    return {
      stage,
      fraction: progress.bytesTotal ? progress.bytesDone / progress.bytesTotal : null,
      detail:
        `Лист ${formatCount(progress.sheetIndex)} из ${formatCount(progress.sheetCount)} · ` +
        `«${progress.sheetName}» · ${formatRows(progress.rowsMain + progress.rowsSpecial)}`,
    };
  }
  // Хода этапа ещё нет (или импорт из CLI — у него виден только этап).
  switch (stage) {
    case 'download':
      return { stage, fraction: null, detail: 'Подключение к серверу с файлом…' };
    case 'parse':
      return { stage, fraction: null, detail: 'Чтение книги…' };
    case 'finalize':
      return { stage, fraction: null, detail: 'Подключение новых данных к поиску…' };
    default:
      return { stage, fraction: null, detail: 'Запуск…' };
  }
}

/** Этап, полоса прогресса и подробности под ней. */
function ImportProgress({ view }: { view: ProgressView }) {
  const percent =
    view.fraction === null ? null : Math.min(100, Math.max(0, Math.floor(view.fraction * 100)));
  const stage = view.stage ? STAGES[view.stage] : null;
  return (
    <div className="flex flex-col gap-2 pt-4">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <p className="font-medium text-fg">
          {stage?.title ?? 'Запуск импорта'}
          {stage && (
            <span className="font-normal text-subtle">
              {' '}
              · этап {stage.step} из {STAGE_COUNT}
            </span>
          )}
        </p>
        {percent !== null && <span className="text-muted tabular-nums">{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={stage?.title ?? 'Запуск импорта'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={view.detail}
        className="relative h-1.5 overflow-hidden rounded-full bg-sunken"
      >
        {percent === null ? (
          <div className="progress-bar absolute inset-0 rounded-full" />
        ) : (
          // key — на новом этапе полоса начинается заново, а не отъезжает назад анимацией.
          <div
            key={view.stage}
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <p className="truncate text-[13px] text-subtle tabular-nums">{view.detail}</p>
    </div>
  );
}

const TRIGGERS: Record<ImportRun['trigger'], string> = {
  schedule: 'по расписанию',
  manual: 'вручную',
  cli: 'из командной строки',
};

/** Итог последнего завершённого импорта: когда и как запущен, а при неудаче — какая ошибка. */
function LastImport({ run }: { run: ImportRun | null }) {
  if (!run) {
    return <p className="text-[13px] text-subtle">Импорт ещё не выполнялся</p>;
  }
  const when = `${formatRecentDateTime(run.finishedAt ?? run.startedAt)} · ${TRIGGERS[run.trigger]}`;
  if (run.status === 'failed') {
    return (
      <div className="flex gap-2 text-[13px]">
        <CircleAlert
          aria-hidden
          size={15}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-danger"
        />
        <div className="min-w-0">
          <p className="text-fg">Последний импорт не удался: {when}</p>
          <p className="text-danger">{run.errorMessage ?? 'Ошибка при импорте.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 text-[13px]">
      <CircleCheck aria-hidden size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-success" />
      <p className="min-w-0 text-subtle">Последний импорт: {when}</p>
    </div>
  );
}

/** Ручной импорт: запуск, ход и итог (как кнопка «Начать импорт» в старой версии). */
export function ImportPanel({ nextRunAt }: { nextRunAt: string | null }) {
  const [runId, setRunId] = useState<number | null>(null);
  const [joined, setJoined] = useState(false);
  const start = useStartImport();
  // Импорт мог идти ещё до открытия страницы (расписание, CLI, другая вкладка) — подхватываем.
  const importStatus = useImportStatus();
  const activeId = runId ?? importStatus.data?.running?.id ?? null;
  const run = useImportRun(activeId);
  const queryClient = useQueryClient();

  const status = run.data?.status;
  const running = start.isPending || status === 'running' || (activeId !== null && !run.data);
  const finished = run.data && run.data.status !== 'running' ? run.data : null;
  // Только что завершившийся на глазах импорт — и есть последний; иначе берём с сервера.
  const lastRun = finished ?? importStatus.data?.last;

  useEffect(() => {
    if (!finished) return;
    // Завершившийся импорт — теперь последний: иначе при следующем запуске, пока он идёт,
    // строка «Последний импорт» вернулась бы к ответу, полученному при открытии страницы.
    queryClient.setQueryData<ImportStatusResponse>(['import-status'], (old) =>
      old && (!old.last || old.last.id <= finished.id) ? { ...old, last: finished } : old,
    );
    // После успешного импорта поиск должен брать свежие данные.
    if (finished.status === 'success') void queryClient.invalidateQueries({ queryKey: ['search'] });
  }, [finished, queryClient]);

  const launch = () =>
    start.mutate(undefined, {
      onSuccess: ({ runId: id, alreadyRunning }) => {
        setRunId(id);
        setJoined(alreadyRunning);
      },
    });

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Обновить данные сейчас</p>
          <p className="text-[13px] text-subtle">
            {nextRunAt
              ? `Во время импорта поиск работает по прежним данным`
              : 'Скачать файл по настройкам импорта'}
          </p>
        </div>
        {/* Кнопка не меняется, пока идёт импорт, — ход показывает полоса ниже. */}
        <Button icon={Download} disabled={running} onClick={launch}>
          Запустить импорт
        </Button>
      </div>

      <Reveal open={running}>
        <ImportProgress view={describe(run.data)} />
      </Reveal>

      <div className="flex flex-col gap-3 pt-3 empty:hidden">
        {joined && running && (
          <Notice tone="info">
            Импорт уже был запущен (по расписанию или другим пользователем) — показываем его ход.
          </Notice>
        )}
        {start.isError && <Notice tone="error">{start.error.message}</Notice>}
      </div>

      {/* Пока идёт импорт, итог прошлого не показываем — рядом с полосой он читался бы как
          итог текущего. Строка возвращается уже с результатом нового импорта. */}
      <Reveal open={!running && lastRun !== undefined}>
        <div aria-live="polite" className="pt-3">
          {lastRun !== undefined && <LastImport run={lastRun} />}
        </div>
      </Reveal>
    </div>
  );
}
