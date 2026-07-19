import { useMemo } from "react";
import type { DayType, LineData } from "../data/schema";
import { scoreRoute } from "../core/scoring";
import { SERVICE_HOURS, hourLabel, hourSlot } from "../core/timeslot";
import type { Route } from "../core/types";

interface Props {
  route: Route;
  data: LineData;
  dayType: DayType;
  alpha: number;
  /** 현재 계산에 쓰인 시(hour)들 — 해당 막대 강조 */
  activeHours: number[];
  onPickHour: (hour: number) => void;
}

/**
 * 출발 시간별 기대 착석 전망 — 같은 경로를 매 시각으로 계산해
 * "언제 출발하면 가장 오래 앉아가는지" 비교한다. 막대를 누르면 그 시각으로 계산.
 */
export default function DepartureChart({
  route,
  data,
  dayType,
  alpha,
  activeHours,
  onPickHour,
}: Props) {
  const byHour = useMemo(
    () =>
      SERVICE_HOURS.map((h) => {
        const rec = scoreRoute(route, hourSlot(h, dayType), data, { alpha }).recommendation;
        return { hour: h, exp: rec?.expSeatedStops ?? 0 };
      }),
    [route, data, dayType, alpha],
  );

  const maxExp = Math.max(...byHour.map((b) => b.exp));
  if (maxExp <= 0) return null;
  const best = byHour.reduce((a, b) => (b.exp > a.exp ? b : a));

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        출발 시간별 앉아갈 전망
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        가장 여유: <strong style={{ color: "var(--accent)" }}>{hourLabel(best.hour)}</strong> 출발
        (약 {Math.round(best.exp)}정거장 착석) · 막대를 누르면 그 시각 기준으로 계산해요
      </p>
      <div className="flex items-end gap-[2px]" style={{ height: 72 }} role="group" aria-label="시간별 기대 착석 정거장">
        {byHour.map(({ hour, exp }) => {
          const active = activeHours.includes(hour);
          return (
            <button
              key={hour}
              type="button"
              aria-label={`${hourLabel(hour)} 출발, 기대 착석 ${exp.toFixed(1)}정거장`}
              onClick={() => onPickHour(hour)}
              className="flex-1 rounded-t-sm"
              style={{
                height: `${Math.max(3, (exp / maxExp) * 100)}%`,
                background: active ? "var(--accent)" : "#86b6ef",
                outline: active ? "2px solid var(--accent)" : "none",
                outlineOffset: 1,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex text-[10px]" style={{ color: "var(--text-muted)" }}>
        {SERVICE_HOURS.map((h) => (
          <span key={h} className="flex-1 text-center">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </section>
  );
}
