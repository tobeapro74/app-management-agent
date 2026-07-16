"use client";

/**
 * 반원 게이지 — circle + clip-path + stroke-dashoffset 방식
 *
 * arc path를 일절 사용하지 않아 방향 버그가 원천 차단됨.
 *
 * 구조:
 *   viewBox="0 0 120 64"
 *   circle cx=60 cy=60 r=50  → clip-path로 위 절반만 표시
 *   원 둘레 = 2π×50 ≈ 314
 *   반원 = 절반 = 157
 *   rotate(-180deg, 60 60) → 왼쪽(9시)에서 시작해 오른쪽(3시)으로 채움
 *   strokeDashoffset = 157 × (1 - ratio)
 */

interface Props {
  value: number;          // 0~100
  label: string;
  displayValue?: string;
  thresholds?: [number, number];
  invert?: boolean;
}

function getColor(v: number, [warn, danger]: [number, number], invert: boolean): string {
  if (!invert) {
    if (v >= danger) return "#ef4444";
    if (v >= warn)   return "#f59e0b";
  } else {
    if (v <= danger) return "#ef4444";
    if (v <= warn)   return "#f59e0b";
  }
  return "#22c55e";
}

const R    = 50;
const CIRC = 2 * Math.PI * R;   // ≈ 314.16
const HALF = CIRC / 2;          // ≈ 157.08  (반원 길이)

export default function ArcGauge({
  value,
  label,
  displayValue,
  thresholds = [70, 90],
  invert = false,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const color   = getColor(clamped, thresholds, invert);

  // 반원 기준 offset: 0% → 157(빔), 100% → 0(꽉 참)
  const offset = HALF * (1 - clamped / 100);

  const shown = displayValue ?? `${Math.round(clamped)}%`;

  return (
    <div className="flex flex-col items-center select-none w-full">
      <span className="text-[10px] text-slate-500 tracking-wider uppercase mb-0.5">
        {label}
      </span>
      <svg viewBox="0 0 120 64" className="w-full" style={{ maxWidth: 110 }}>
        <defs>
          {/* 위쪽 절반만 보여주는 clip */}
          <clipPath id={`half-${label.replace(/\s/g, "")}`}>
            <rect x="0" y="0" width="120" height="62" />
          </clipPath>
        </defs>

        {/* 배경 원 (회색 트랙) */}
        <circle
          cx="60" cy="60" r={R}
          fill="none"
          stroke="#1e293b"
          strokeWidth="10"
          clipPath={`url(#half-${label.replace(/\s/g, "")})`}
        />

        {/* 채움 원: rotate(-180deg)로 왼쪽(9시)에서 시작 */}
        <circle
          cx="60" cy="60" r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          clipPath={`url(#half-${label.replace(/\s/g, "")})`}
          strokeDasharray={`${HALF} ${CIRC}`}
          strokeDashoffset={offset}
          transform="rotate(-180 60 60)"
          style={{ transition: "stroke-dashoffset 0.4s ease-out, stroke 0.2s ease-out" }}
        />

        {/* 값 텍스트 */}
        <text
          x="60" y="50"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill={color}
          fontFamily="monospace"
        >
          {shown}
        </text>
      </svg>
    </div>
  );
}
