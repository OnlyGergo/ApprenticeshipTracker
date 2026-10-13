import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "~/lib/format";

export interface ChartPoint {
  date: string; // ISO
  value: number | null; // actual (null = future)
  ref: number | null; // target/reference line
}

const M = { top: 14, right: 64, bottom: 22, left: 36 };
const HEIGHT = 220;
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((n) => n >= v) ?? v);
}

/**
 * One measure over time against a reference line (one y-axis). Accent line =
 * actual, dashed grey = reference. Crosshair tooltip on hover, table for the numbers.
 */
export function CoverageChart({
  points,
  valueLabel,
  refLabel,
  unit = "",
  integer = false,
}: {
  points: ChartPoint[];
  valueLabel: string;
  refLabel: string;
  unit?: string;
  integer?: boolean; // counts: keep the four grid steps on whole numbers
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const t0 = ts(points[0]!.date);
    const t1 = Math.max(ts(points.at(-1)!.date), t0 + 86_400_000);
    const top = Math.max(1, ...points.flatMap((p) => [p.value ?? 0, p.ref ?? 0]));
    const yMax = integer ? Math.ceil(top / 4) * 4 : niceMax(top);
    const iw = width - M.left - M.right;
    const ih = HEIGHT - M.top - M.bottom;
    const x = (d: string) => M.left + ((ts(d) - t0) / (t1 - t0)) * iw;
    const y = (v: number) => M.top + ih - (v / yMax) * ih;
    const path = (key: "value" | "ref") => {
      let d = "";
      let pen = false;
      for (const p of points) {
        const v = p[key];
        if (v === null) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${x(p.date).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    // Month ticks, thinned to fit.
    const ticks: string[] = [];
    const start = new Date(t0);
    for (let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)); m.getTime() <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
      ticks.push(m.toISOString().slice(0, 10));
    }
    const every = Math.max(1, Math.ceil(ticks.length / Math.max(2, Math.floor(iw / 70))));
    return {
      x,
      y,
      iw,
      ih,
      yMax,
      grid: [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax),
      ticks: ticks.filter((_, i) => i % every === 0),
      value: path("value"),
      ref: path("ref"),
    };
  }, [points, width, integer]);

  const lastValue = [...points].reverse().find((p) => p.value !== null);
  const lastRef = [...points].reverse().find((p) => p.ref !== null);
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left + M.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(geo.x(points[i]!.date) - px) < Math.abs(geo.x(points[best]!.date) - px)) best = i;
    setHover(best);
  }

  const h = hover === null ? null : points[hover]!;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-accent" /> {valueLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-muted" /> {refLabel}
        </span>
      </div>
      <div ref={wrap} className="relative">
        <svg width={width} height={HEIGHT} className="block" role="img" aria-label={`${valueLabel} against ${refLabel} over time`}>
          {geo.grid.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={M.left + geo.iw} y1={geo.y(v)} y2={geo.y(v)} className="stroke-border" strokeWidth={1} />
              <text x={M.left - 6} y={geo.y(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {fmt(v)}
              </text>
            </g>
          ))}
          {geo.ticks.map((d) => (
            <text key={d} x={geo.x(d)} y={HEIGHT - 6} textAnchor="middle" className="fill-muted text-[11px]">
              {monthFmt.format(new Date(ts(d)))}
            </text>
          ))}
          {geo.ref && <path d={geo.ref} fill="none" className="stroke-muted" strokeWidth={1.5} strokeDasharray="5 4" />}
          {geo.value && <path d={geo.value} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {/* Direct labels at the line ends */}
          {lastRef?.ref != null && (
            <text x={geo.x(lastRef.date) + 6} y={geo.y(lastRef.ref)} dy="0.32em" className="fill-muted text-[11px] tabular-nums">
              {fmt(lastRef.ref)}
            </text>
          )}
          {lastValue?.value != null && (
            <>
              <circle cx={geo.x(lastValue.date)} cy={geo.y(lastValue.value)} r={4} className="fill-accent stroke-surface" strokeWidth={2} />
              <text x={geo.x(lastValue.date) + 8} y={geo.y(lastValue.value)} dy="0.32em" className="fill-text text-[11px] font-semibold tabular-nums">
                {fmt(lastValue.value)}
              </text>
            </>
          )}
          {h && (
            <g pointerEvents="none">
              <line x1={geo.x(h.date)} x2={geo.x(h.date)} y1={M.top} y2={M.top + geo.ih} className="stroke-muted" strokeWidth={1} />
              {h.ref !== null && <circle cx={geo.x(h.date)} cy={geo.y(h.ref)} r={3.5} className="fill-muted stroke-surface" strokeWidth={2} />}
              {h.value !== null && <circle cx={geo.x(h.date)} cy={geo.y(h.value)} r={4} className="fill-accent stroke-surface" strokeWidth={2} />}
            </g>
          )}
          <rect
            x={M.left}
            y={M.top}
            width={geo.iw}
            height={geo.ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-1 rounded-ui border border-border bg-surface-2 px-2 py-1 text-xs shadow-lg"
            style={{ left: Math.min(geo.x(h.date) + 10, width - 150) }}
          >
            <div className="text-muted">{formatDate(h.date)}</div>
            <div className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-accent" />
              <strong className="tabular-nums">{h.value === null ? "–" : fmt(h.value)}</strong>
              <span className="text-muted">{valueLabel}</span>
            </div>
            {h.ref !== null && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 border-t-2 border-dashed border-muted" />
                <strong className="tabular-nums">{fmt(h.ref)}</strong>
                <span className="text-muted">{refLabel}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <details className="text-xs text-muted">
        <summary className="cursor-pointer select-none">Show table</summary>
        <table className="mt-1 w-full max-w-md tabular-nums">
          <thead>
            <tr className="text-left">
              <th className="font-normal">Date</th>
              <th className="text-right font-normal">{valueLabel}</th>
              <th className="text-right font-normal">{refLabel}</th>
            </tr>
          </thead>
          <tbody className="text-text">
            {points.map((p) => (
              <tr key={p.date}>
                <td>{formatDate(p.date)}</td>
                <td className="text-right">{p.value === null ? "–" : fmt(p.value)}</td>
                <td className="text-right">{p.ref === null ? "–" : fmt(p.ref)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
