/** The Studyhall mark: an open book, one page lime and one white. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M15 8.5C11.6 5.6 6.6 4.8 2.5 6.4v18.8c4.1-1.5 9.1-.7 12.5 2.3z" fill="var(--accent)" />
      <path d="M17 8.5c3.4-2.9 8.4-3.7 12.5-2.1v18.8c-4.1-1.5-9.1-.7-12.5 2.3z" fill="var(--ink)" />
    </svg>
  );
}
