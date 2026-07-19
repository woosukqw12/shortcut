import type { CarScore, Recommendation } from "../core/scoring";

interface Props {
  recommendation: Recommendation;
  bestCar: CarScore;
  totalStops: number;
}

export default function ResultCard({ recommendation, bestCar, totalStops }: Props) {
  const probPct = Math.min(99, Math.round(recommendation.seatProb * 100));
  const seated = recommendation.expSeatedStops;
  return (
    <section
      className="rounded-xl border p-5"
      style={{ borderColor: "var(--accent)", background: "var(--surface-1)" }}
    >
      <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        가장 오래 앉아갈 수 있는 위치
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {recommendation.car}번째 칸 ·{" "}
        <span style={{ color: "var(--accent)" }}>{recommendation.positionLabel}문</span> 앞
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        앉을 확률 <strong style={{ color: "var(--text-primary)" }}>{probPct}%</strong>
        {" · "}
        {totalStops}개 역 중 약{" "}
        <strong style={{ color: "var(--text-primary)" }}>{seated.toFixed(1)}개</strong> 구간을
        앉아서 가요
      </p>
      {bestCar.topContributors.length > 0 && (
        <ul className="mt-3 space-y-1">
          {bestCar.topContributors.map((c, i) => (
            <li key={c.stationId} className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {i === 0 ? "① " : i === 1 ? "② " : "③ "}
              {c.stationName} ({c.stopsAway}정거장 앞) 하차 집중
              {c.labels.length > 0 && ` — ${c.labels.join(", ")} 위치`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
