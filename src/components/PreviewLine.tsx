"use client";

import { Line } from "@react-three/drei";
import type { Vec2 } from "@/lib/geometry";

interface PreviewLineProps {
  points: Vec2[];
  color?: string;
}

export function PreviewLine({ points, color = "#22d3ee" }: PreviewLineProps) {
  if (points.length < 2) return null;
  const pts = points.map((p) => [p.x, 0, p.z] as [number, number, number]);
  return (
    <Line
      points={pts}
      color={color}
      lineWidth={2}
      dashed
      dashSize={0.18}
      gapSize={0.1}
      raycast={() => null}
    />
  );
}
