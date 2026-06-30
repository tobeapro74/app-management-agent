"use client";

interface Props {
  data: number[];       // 응답속도(ms) 배열 (최신이 오른쪽)
  width?: number;
  height?: number;
  color?: string;
}

export default function Sparkline({ data, width = 120, height = 32, color = "#6366f1" }: Props) {
  if (data.length < 2) return null;

  const pad = 2;
  const W = width - pad * 2;
  const H = height - pad * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * W;
    const y = pad + H - ((v - min) / range) * H;
    return `${x},${y}`;
  });

  const polyline = pts.join(" ");

  // 마지막 점 (최신값)
  const last = pts[pts.length - 1].split(",");
  const lx = parseFloat(last[0]);
  const ly = parseFloat(last[1]);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* 마지막 점 강조 */}
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  );
}
