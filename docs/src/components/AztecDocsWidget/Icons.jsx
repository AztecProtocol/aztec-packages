import React from "react";

export function AztecMark({ size = 24, color = "currentColor", stroke = 0 }) {
  const c = size / 2;
  const rings = [0.96, 0.7, 0.44, 0.2];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {rings.map((r, i) => {
        const half = (size * r) / 2;
        const d = `M ${c} ${c - half} L ${c + half} ${c} L ${c} ${c + half} L ${c - half} ${c} Z`;
        return (
          <path
            key={i}
            d={d}
            fill={i % 2 === 0 ? color : "none"}
            stroke={i % 2 === 0 ? "none" : color}
            strokeWidth={stroke || Math.max(1, size * 0.04)}
          />
        );
      })}
    </svg>
  );
}

export const Icons = {
  close: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 18}
      height={p.size || 18}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  ),
  send: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 18}
      height={p.size || 18}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  ),
  chat: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 22}
      height={p.size || 22}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a8 8 0 0 1-11.5 7.2L3 20l1-4.8A8 8 0 1 1 21 12z" />
    </svg>
  ),
  refresh: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  ),
  arrowUpRight: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 12}
      height={p.size || 12}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  ),
  doc: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 12}
      height={p.size || 12}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  ),
  expand: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="M21 3l-7 7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
  collapse: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 14}
      height={p.size || 14}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <path d="M14 10l7-7" />
      <path d="M3 21l7-7" />
    </svg>
  ),
  thumbUp: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 13}
      height={p.size || 13}
      fill={p.filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l5-8a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7" />
    </svg>
  ),
  thumbDown: (p) => (
    <svg
      viewBox="0 0 24 24"
      width={p.size || 13}
      height={p.size || 13}
      fill={p.filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
      <path d="M17 13l-5 8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2l2-7a2 2 0 0 1 2-1h10" />
    </svg>
  ),
};
