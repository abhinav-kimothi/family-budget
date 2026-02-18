"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

const SUCCESS = "#00E676";
const WARNING = "#FF5252";

export function DashboardSparkline({
  data,
  positiveColor = SUCCESS,
  negativeColor = WARNING,
}: {
  data: { value: number }[];
  positiveColor?: string;
  negativeColor?: string;
}) {
  if (!data.length) return null;
  const last = data[data.length - 1]?.value ?? 0;
  const color = last >= 0 ? positiveColor : negativeColor;

  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={true}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
