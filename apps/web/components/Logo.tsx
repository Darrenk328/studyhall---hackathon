import { useId } from "react";

/** The Studyhall mark: an open book whose two pages share one rainbow gradient. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4f8bff" />
          <stop offset="0.38" stopColor="#8f6bff" />
          <stop offset="0.7" stopColor="#e86bd0" />
          <stop offset="1" stopColor="#ffae5c" />
        </linearGradient>
      </defs>
      <path d="M15 8.5C11.6 5.6 6.6 4.8 2.5 6.4v18.8c4.1-1.5 9.1-.7 12.5 2.3z" fill={`url(#${id})`} />
      <path d="M17 8.5c3.4-2.9 8.4-3.7 12.5-2.1v18.8c-4.1-1.5-9.1-.7-12.5 2.3z" fill={`url(#${id})`} opacity="0.85" />
    </svg>
  );
}
