// Две панели с разделителем: перетаскивание с привязкой к 30 / 50 / 70 %, двойной щелчок —
// сброс, стрелки клавиатуры. Пропорция запоминается.
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react';
import { cx } from '../../components/ui.tsx';
import { readStored, writeStored } from '../../lib/storage.ts';

const STORAGE_KEY = 'webpricer.split';
const DEFAULT_RATIO = 0.45;
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;
const SNAP_POINTS = [0.3, 0.45, 0.7];
const SNAP_DISTANCE = 0.015;
const KEY_STEP = 0.02;

const clamp = (value: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));

function snap(value: number): number {
  const point = SNAP_POINTS.find((candidate) => Math.abs(candidate - value) <= SNAP_DISTANCE);
  return point ?? value;
}

function initialRatio(): number {
  const stored = Number(readStored(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? clamp(stored) : DEFAULT_RATIO;
}

export function SplitPanes({ left, right }: { left: ReactNode; right: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const [dragging, setDragging] = useState(false);

  const commit = (value: number) => {
    const next = clamp(value);
    setRatio(next);
    writeStored(STORAGE_KEY, next.toFixed(3));
  };

  const ratioAt = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? snap(clamp((clientX - rect.left) / rect.width)) : ratio;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging) setRatio(ratioAt(event.clientX));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    commit(ratioAt(event.clientX));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowLeft: ratio - KEY_STEP,
      ArrowRight: ratio + KEY_STEP,
      Home: MIN_RATIO,
      End: MAX_RATIO,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  const snapped = SNAP_POINTS.includes(ratio);
  const percent = Math.round(ratio * 100);

  return (
    <div
      ref={containerRef}
      className={cx(
        'flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-0',
        dragging && 'cursor-col-resize select-none',
      )}
    >
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-none"
        style={{ flexBasis: `${ratio * 100}%` }}
      >
        {left}
      </div>

      {/* Разделитель живёт в промежутке между блоками: при наведении появляется «ручка». */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина таблиц: стрелки влево и вправо, двойной щелчок — сброс"
        aria-valuemin={MIN_RATIO * 100}
        aria-valuemax={MAX_RATIO * 100}
        aria-valuenow={percent}
        aria-valuetext={`Стоп-лист ${percent} %, детали ${100 - percent} %`}
        tabIndex={0}
        title="Потяните, чтобы изменить ширину таблиц; двойной щелчок — сброс"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragging(false)}
        onDoubleClick={() => commit(DEFAULT_RATIO)}
        onKeyDown={onKeyDown}
        className="group relative hidden w-2 shrink-0 cursor-col-resize rounded-full outline-none md:block"
      >
        <span
          aria-hidden
          className={cx(
            'absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors duration-150',
            dragging
              ? snapped
                ? 'bg-accent'
                : 'bg-accent/60'
              : 'bg-line-strong/0 group-hover:bg-line-strong group-focus-visible:bg-accent',
          )}
        />
        {dragging && (
          <span
            aria-hidden
            className="tabular pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-md bg-fg px-2 py-1 text-[11px] font-medium whitespace-nowrap text-bg shadow-popover"
          >
            {percent} : {100 - percent}
          </span>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{right}</div>
    </div>
  );
}
