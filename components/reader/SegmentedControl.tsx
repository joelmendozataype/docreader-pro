'use client';

import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';

import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** nombre accesible si label no es texto */
  ariaLabel?: string;
  className?: string;
}

/**
 * Grupo de opciones exclusivas con el patrón ARIA radiogroup:
 * Tab entra en la opción elegida y las flechas cambian de opción.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: number | null = null;
    if (event.key in keys) next = (index + keys[event.key] + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="space-y-1.5">
      <p id={labelId} className="text-muted-foreground text-xs font-medium">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="bg-muted flex rounded-lg p-0.5">
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'focus-visible:ring-ring/50 flex-1 rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3',
                checked
                  ? 'bg-background text-foreground font-medium shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                option.className,
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
