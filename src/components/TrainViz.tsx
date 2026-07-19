import type { CarScore, Recommendation } from "../core/scoring";
import { heatColor, heatInk } from "./heat";

interface Props {
  cars: CarScore[];
  doorsPerCar: number;
  recommendation: Recommendation | null;
  selectedCar: number | null;
  onSelectCar: (car: number) => void;
}

export default function TrainViz({
  cars,
  doorsPerCar,
  recommendation,
  selectedCar,
  onSelectCar,
}: Props) {
  // 표시용 대비 확장: 쿼리 내 최솟값~최댓값을 램프 전체에 펼친다
  // (절대 점수가 아니라 칸 간 상대 비교가 목적)
  const min = Math.min(...cars.map((c) => c.norm));
  const max = Math.max(...cars.map((c) => c.norm));
  const spread = (norm: number) => (max > min ? ((norm - min) / (max - min)) * 100 : 50);

  return (
    <div>
      <div className="flex gap-0.5">
        {cars.map((c) => {
          const isBest = recommendation?.car === c.car;
          const isSelected = selectedCar === c.car;
          const fill = heatColor(spread(c.norm));
          const ink = heatInk(spread(c.norm));
          return (
            <button
              key={c.car}
              type="button"
              onClick={() => onSelectCar(c.car)}
              aria-label={`${c.car}번째 칸, ${c.rank}위`}
              className="relative flex-1 rounded-md pt-2 pb-3"
              style={{
                background: fill,
                outline: isBest
                  ? "3px solid var(--accent)"
                  : isSelected
                    ? "2px solid var(--text-muted)"
                    : "1px solid var(--border)",
                outlineOffset: isBest || isSelected ? 1 : -1,
              }}
            >
              <div className="text-center">
                <div className="text-sm font-bold" style={{ color: ink }}>
                  {c.car}
                </div>
                <div className="text-[10px] font-medium" style={{ color: ink, opacity: 0.85 }}>
                  {c.rank}위
                </div>
              </div>
              {/* 문 위치 눈금 — 추천 문은 강조 */}
              <div className="absolute inset-x-0 bottom-1 flex justify-around">
                {Array.from({ length: doorsPerCar }, (_, d) => {
                  const isBestDoor = isBest && recommendation?.door.door === d + 1;
                  return (
                    <span
                      key={d}
                      className="rounded-sm"
                      style={{
                        width: isBestDoor ? 8 : 4,
                        height: 4,
                        background: ink,
                        opacity: isBestDoor ? 1 : 0.45,
                      }}
                    />
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
        칸을 누르면 상세를 볼 수 있어요 · 번호는 승강장 바닥의 칸-문 표기 기준
      </p>
    </div>
  );
}
