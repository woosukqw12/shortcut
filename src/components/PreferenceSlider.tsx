/**
 * 추천 성향 α: 확실성 vs 기댓값의 리스크 트레이드오프.
 * 0 = 앉는 시간 최대로(기대 착석 정거장 우선 — 못 앉을 위험 감수),
 * 1 = 한 번이라도 확실히(앉을 확률 우선 — 늦게 앉더라도).
 * 점수 = α·앉을확률 + (1−α)·기대착석비율
 */
interface Props {
  alpha: number;
  onChange: (alpha: number) => void;
}

export default function PreferenceSlider({ alpha, onChange }: Props) {
  const mode =
    alpha <= 0.2 ? "앉는 시간 우선" : alpha >= 0.8 ? "확실히 앉기 우선" : "균형";
  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <div className="mb-1 flex items-center justify-between text-xs">
        <span style={{ color: "var(--text-muted)" }}>추천 성향</span>
        <span className="font-medium" style={{ color: "var(--text-secondary)" }}>
          {mode}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(alpha * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label="추천 성향: 앉는 시간 최대화와 확실히 앉기 사이 가중치"
        className="w-full"
        style={{ accentColor: "var(--accent)" }}
      />
      <div className="flex justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span>🛋️ 앉는 시간 최대로</span>
        <span>⚡ 한 번이라도 확실히</span>
      </div>
    </div>
  );
}
