"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { relianceThresholds } from "@/lib/reliance";

/**
 * Small single-series charts for the teacher app and Lens. One measure per
 * chart (no dual axes), brand primary for the mark, recessive grid and axes,
 * a hover tooltip, and an sr-only table so the numbers never depend on sight.
 */

export type ChartPoint = { label: string; value: number | null };

const axis = { fontSize: 12, fill: "var(--ss-text-muted)" };

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const value = typeof payload[0]?.value === "number" ? payload[0].value : null;
  return (
    <div className="rounded-md border bg-surface px-3 py-2 text-small shadow-lift">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-mono text-foreground">
        {value === null ? "No data" : `${value}${unit}`}
      </p>
    </div>
  );
}

function DataTable({ title, data, unit }: { title: string; data: ChartPoint[]; unit: string }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.value === null ? "No data" : `${d.value}${unit}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Weekly Reliance Score (0–100) with the band thresholds as faint guides. */
export function RelianceLineChart({
  data,
  title = "Average Reliance Score by week",
  height = 200,
}: {
  data: ChartPoint[];
  title?: string;
  height?: number;
}) {
  return (
    <figure className="m-0">
      <div aria-hidden="true" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--ss-border)" />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} ticks={[0, 40, 70, 100]} tick={axis} tickLine={false} axisLine={false} />
            <ReferenceLine y={relianceThresholds.medium} stroke="var(--ss-border-strong)" strokeDasharray="4 4" />
            <ReferenceLine y={relianceThresholds.high} stroke="var(--ss-border-strong)" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ stroke: "var(--ss-border-strong)" }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string | undefined}
                  unit=""
                />
              )}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--ss-primary)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--ss-primary)", stroke: "var(--ss-surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--ss-surface)", strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable title={title} data={data} unit="" />
    </figure>
  );
}

/** Counts per category or week, as thin bars from the baseline. */
export function CountBarChart({
  data,
  title,
  unit = "",
  height = 200,
}: {
  data: ChartPoint[];
  title: string;
  unit?: string;
  height?: number;
}) {
  return (
    <figure className="m-0">
      <div aria-hidden="true" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--ss-border)" />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "var(--ss-hover)" }}
              content={(props) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label as string | undefined}
                  unit={unit}
                />
              )}
            />
            <Bar dataKey="value" fill="var(--ss-primary)" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable title={title} data={data} unit={unit} />
    </figure>
  );
}
