/**
 * Ilustraciones ligeras en SVG para estados vacíos y de error.
 * Usan currentColor y variables del tema: se ven bien en claro, oscuro y sepia.
 */

import { cn } from '@/lib/utils';

export function EmptyLibraryIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={cn('h-28 w-auto', className)} aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="128" rx="78" ry="8" fill="var(--muted)" />
      {/* estante de libros */}
      <rect
        x="38"
        y="44"
        width="18"
        height="80"
        rx="3"
        fill="var(--muted)"
        stroke="currentColor"
        strokeOpacity=".25"
      />
      <rect
        x="58"
        y="34"
        width="14"
        height="90"
        rx="3"
        fill="var(--secondary)"
        stroke="currentColor"
        strokeOpacity=".25"
      />
      <rect
        x="74"
        y="52"
        width="16"
        height="72"
        rx="3"
        fill="var(--muted)"
        stroke="currentColor"
        strokeOpacity=".25"
      />
      {/* documento con flecha de subida */}
      <g transform="translate(104 22)">
        <path
          d="M8 0h40l18 18v76a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V6a6 6 0 0 1 6-6z"
          fill="var(--card)"
          stroke="currentColor"
          strokeOpacity=".35"
          strokeWidth="2"
        />
        <path
          d="M48 0v14a4 4 0 0 0 4 4h14"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".35"
          strokeWidth="2"
        />
        <g stroke="var(--primary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M34 72V40" />
          <path d="M22 52l12-12 12 12" />
        </g>
        <path d="M14 84h40" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function MissingDocumentIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 130" className={cn('h-24 w-auto', className)} aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="120" rx="58" ry="7" fill="var(--muted)" />
      <path
        d="M50 10h40l20 20v74a6 6 0 0 1-6 6H50a6 6 0 0 1-6-6V16a6 6 0 0 1 6-6z"
        fill="var(--card)"
        stroke="currentColor"
        strokeOpacity=".35"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <text
        x="77"
        y="80"
        textAnchor="middle"
        fontSize="38"
        fontWeight="700"
        fill="var(--primary)"
        fontFamily="var(--font-sans)"
      >
        ?
      </text>
    </svg>
  );
}
