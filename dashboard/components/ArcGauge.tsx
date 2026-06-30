"use client";

/**
 * 반원형 Arc 게이지 (SVG 기반)
 *
 * 좌표 설계:
 *   - 반원 중심: (cx, cy) = (W/2, H - padding)
 *   - 반원은 왼쪽(180°)에서 오른쪽(0°)으로 위쪽 호를 그림
 *   - viewBox 높이 = r + strokeW/2 + padding(위) + padding(아래) + 텍스트 영역
 *   → 어떤 값에서도 arc가 잘리지 않음
 */

interface Props {
  value: number;          // 0~100
  label: string;
  unit?: string;
  displayValue?: string;
  thresholds?: [number, number];
  invert?: boolean;       // true: 낮을수록 위험 (SSL·가용성)
  size?: number;          // 전체 너비(px)
}

function getColor(v: number, [warn, danger]: [number, number], invert: boolean) {
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
  const r   = W * 0.36;          // 반원 반지름
  const sw  = W * 0.10;          // stroke 두께
  const pad = sw / 2 + 1;        // 잘림 방지 여백

  // 중심점: x는 가운데, y는 아래쪽 (반원이 위로 열림)
  const cx  = W / 2;
  const cy  = r + pad;            // 중심 y = 반지름 + 위 여백

  // SVG 높이: 반원 꼭대기(cy-r)부터 중심(cy)까지 + 텍스트 공간
  const textH = W * 0.20;
  const H   = cy + pad + textH;

  // 각도 → 좌표 (0° = 오른쪽, 반시계 방향)
  // 반원: 180°(왼쪽) → 0°(오른쪽), 위쪽 호
  function pt(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy - r * Math.sin(rad),  // SVG y축 반전
    };
  }

  const left  = pt(180);   // 왼쪽 끝
  const right = pt(0);     // 오른쪽 끝

  // 채움: 0%=왼쪽, 100%=오른쪽
  const fillDeg  = 180 - (clamped / 100) * 180;  // 180→0
  const fillPt   = pt(fillDeg);
  const largeArc = clamped > 50 ? 1 : 0;

  // 트랙: 왼쪽 → 오른쪽 (위쪽 반원, 반시계 = sweep=0)
  const trackPath = `M ${left.x} ${left.y} A ${r} ${r} 0 1 0 ${right.x} ${right.y}`;

  // 채움: 왼쪽 → fillPt (위쪽 호, sweep=0)
  const fillPath = clamped === 0
    ? null
    : `M ${left.x} ${left.y} A ${r} ${r} 0 ${largeArc} 0 ${fillPt.x} ${fillPt.y}`;

  const shown = displayValue ?? `${Math.round(clamped)}${unit}`;

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        overflow="visible"
      >
        {/* 배경 트랙 */}
        <path
          d={trackPath}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={sw}
          strokeLinecap="round"
        />
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
        {/* 값 텍스트 — 중심 아래 */}
        <text
          x={cx}
          y={cy + pad + textH * 0.6}
          textAnchor="middle"
          fontSize={W * 0.17}
          fontWeight="700"
          fill={color}
        >
          {shown}
        </text>
      </svg>
      <span className="text-[11px] text-slate-400 leading-tight text-center mt-0.5">
        {label}
      </span>
    </div>
  );
}
