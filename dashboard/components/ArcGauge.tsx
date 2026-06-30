"use client";

/**
 * 반원형 Arc 게이지 (SVG 기반, 외부 라이브러리 없음)
 *
 * value       : 0~100 게이지 채움 비율
 * thresholds  : [warn, danger] — invert=false 이면 value >= 기준이 경고/위험
 *                               invert=true  이면 value <= 기준이 경고/위험 (SSL·가용성)
 */

interface Props {
  value: number;
  label: string;
  unit?: string;
  displayValue?: string;
  thresholds?: [number, number];
  invert?: boolean;
  size?: number;
}

function getColor(value: number, [warn, danger]: [number, number], invert: boolean) {
  if (!invert) {
    if (value >= danger) return "#ef4444";
    if (value >= warn)   return "#f59e0b";
    return "#10b981";
  } else {
    // 낮을수록 위험 (SSL 잔여일, 가용성)
    if (value <= danger) return "#ef4444";
    if (value <= warn)   return "#f59e0b";
    return "#10b981";
  }
}

export default function ArcGauge({
  value,
  label,
  unit = "%",
  displayValue,
  thresholds = [70, 90],
  invert = false,
  size = 110,
}: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const color   = getColor(clamped, thresholds, invert);

  const cx = size / 2;
  const cy = size / 2 + 6;
  const r  = size * 0.37;
  const sw = size * 0.1;

  function polarToXY(deg: number) {
    const rad = ((deg - 180) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const s0  = polarToXY(0);   // 왼쪽 끝
  const s180 = polarToXY(180); // 오른쪽 끝
  const fillDeg  = (clamped / 100) * 180;
  const fillPt   = polarToXY(fillDeg);
  const largeArc = fillDeg > 90 ? 1 : 0;

  const trackPath = `M ${s0.x} ${s0.y} A ${r} ${r} 0 1 1 ${s180.x} ${s180.y}`;
  const fillPath  = clamped === 0
    ? null
    : `M ${s0.x} ${s0.y} A ${r} ${r} 0 ${largeArc} 1 ${fillPt.x} ${fillPt.y}`;

  const shown = displayValue ?? `${Math.round(clamped)}${unit}`;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        {/* 배경 트랙 */}
        <path d={trackPath} fill="none" stroke="#e2e8f0" strokeWidth={sw} strokeLinecap="round" />
        {/* 채움 */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            style={{ transition: "stroke 0.5s ease" }}
          />
        )}
        {/* 값 */}
        <text
          x={cx} y={cy - 1}
          textAnchor="middle"
          fontSize={size * 0.155}
          fontWeight="700"
          fill={color}
        >
          {shown}
        </text>
      </svg>
      <span className="text-[11px] text-slate-400 leading-tight text-center">{label}</span>
    </div>
  );
}
