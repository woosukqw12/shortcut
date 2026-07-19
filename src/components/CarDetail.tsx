import type { CarScore, DoorScore } from "../core/scoring";
import { heatColor } from "./heat";

interface Props {
  car: CarScore;
  doors: DoorScore[];
}

export default function CarDetail({ car, doors }: Props) {
  const carDoors = doors.filter((d) => d.door.car === car.car);
  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <h3 className="mb-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {car.car}번째 칸 · 전체 {car.rank}위
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
        앉을 확률 {Math.min(99, Math.round(car.seatProb * 100))}% · 기대 착석{" "}
        {car.expSeatedStops.toFixed(1)}정거장 (가장 좋은 문 기준)
      </p>

      <div className="mb-4 flex items-end gap-2">
        {carDoors.map((d) => (
          <div key={d.door.door} className="flex-1 text-center">
            <div
              className="mx-auto flex h-16 w-full items-end rounded-md"
              style={{ background: "var(--page)", border: "1px solid var(--hairline)" }}
            >
              <div
                className="w-full rounded-md"
                style={{
                  height: `${Math.max(4, d.norm)}%`,
                  background: heatColor(d.norm),
                }}
              />
            </div>
            <div className="mt-1 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {d.door.car}-{d.door.door}
            </div>
          </div>
        ))}
      </div>

      {car.topContributors.length > 0 ? (
        <ul className="space-y-1.5">
          {car.topContributors.map((c) => (
            <li key={c.stationId} className="flex items-baseline gap-2 text-sm">
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {c.stationName}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {c.stopsAway}정거장 앞{c.labels.length > 0 && ` · ${c.labels.join(" · ")}`}
                {" · "}기여 {Math.round(c.share * 100)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          이 칸에 크게 기여하는 하차 역이 없어요
        </p>
      )}
    </section>
  );
}
