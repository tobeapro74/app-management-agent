"use client";

interface Props {
  value: number;
  label: string;
  unit?: string;
  displayValue?: string;
  thresholds?: [number, number];
  invert?: boolean;
  size?: number;
}

function getColor(v: number, [warn, danger]: [number, number], invert: boolean): string {
  if (!invert) {
    if (v >= danger) return "#ef4444";
    if (v >= warn)   return "#f59e0b";
  } else {
    if (v <= danger) return "#ef4444";
    if (v <= warn)   return "#f59e0b";
  }
  return "#10b981";
}

export default function ArcGauge({
  value,
  label,
  unit = "%",
  displayValue,
  thresholds = [70, 90],
  invert = false,
  size = 100,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const color   = getColor(clamped, thresholds, invert);

  const W   = size;
  const r   = W * 0.36;
  const sw  = W * 0.10;
  const pad = sw / 2 + 2;

  const cx  = W / 2;
  const cy  = r + pad;

  const textH = W * 0.22;
  const H     = cy + pad + textH;

  function pt(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }

  const left  = pt(180);
  const right = pt(0);

  const fillDeg  = 180 - (clamped / 100) * 180;
  const fillPt   = pt(fillDeg);
  const largeArc = clamped > 50 ? 1 : 0;

  const trackPath = `M ${left.x} ${left.y} A ${r} ${r} 0 1 0 ${right.x} ${right.y}`;
  const fillPath  = clamped === 0
    ? null
    : `M ${left.x} ${left.y} A ${r} ${r} 0 ${largeArc} 0 ${fillPt.x} ${fillPt.y}`;

  // 멀티컬러 그라데이션 ID (size 기반으로 unique)
  const gradId = `arc-grad-${size}-${label.replace(/\s/g, "")}`;

  const shown = displayValue ?? `${Math.round(clamped)}${unit}`;

  return (
    <div className="flex flex-col items-center gap-0 select-none">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        <defs>
          {/* 멀티컬러 그라데이션 트랙 */}
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            {invert ? (
              <>
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.35" />
                <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.35" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* 어두운 원형 내부 배경 */}
        <circle cx={cx} cy={cy} r={r - sw * 0.1} fill="rgba(0,0,0,0.25)" />

        {/* 배경 트랙 — 멀티컬러 */}
        <path
          d={trackPath}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {/* 채움 — 단색 (상태 색상) */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            style={{ transition: "stroke 0.5s ease, d 0.5s ease" }}
          />
        )}
        {/* 값 텍스트 */}
        <text
          x={cx}
          y={cy + pad + textH * 0.55}
          textAnchor="middle"
          fontSize={W * 0.16}
          fontWeight="700"
          fill={color}
          fontFamily="var(--font-geist-mono, monospace)"
        >
          {shown}
        </text>
      </svg>
      <span className="text-[10px] text-slate-400 leading-tight text-center mt-0.5 font-medium tracking-wide uppercase">
        {label}
      </span>
    </div>
  );
}
