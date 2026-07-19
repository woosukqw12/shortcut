import { useMemo, useState } from "react";
import type { Journey } from "../core/journey";
import { directionLabel } from "../core/route";
import { scoreRoute } from "../core/scoring";
import type { TimeSlot } from "../core/types";
import type { DayType } from "../data/schema";
import CarDetail from "./CarDetail";
import DepartureChart from "./DepartureChart";
import DirectionBanner from "./DirectionBanner";
import FeedbackWidget from "./FeedbackWidget";
import ResultCard from "./ResultCard";
import TrainViz from "./TrainViz";

interface Props {
  journey: Journey;
  slot: TimeSlot;
  slotLabel: string;
  alpha: number;
  dayType: DayType;
  onPickHour: (hour: number) => void;
}

/**
 * 여정 결과 — 구간마다 착석 추천(주 결과)과 피드백 위젯을 내고, 환승역의 빠른환승 문
 * 위치는 구간 사이 배너에 부가 정보로 보여준다. 출발 시간 차트는 직행 여정만 지원.
 * 부모에서 key로 여정 식별자를 넘겨 여정이 바뀌면 칸 선택 상태가 초기화되게 한다.
 */
export default function JourneyView({ journey, slot, slotLabel, alpha, dayType, onPickHour }: Props) {
  const [selectedCars, setSelectedCars] = useState<Record<number, number | null>>({});

  const results = useMemo(
    () => journey.legs.map((leg) => scoreRoute(leg.route, slot, leg.data, { alpha })),
    [journey, slot, alpha],
  );

  const multi = journey.legs.length > 1;
  const single = !multi ? { leg: journey.legs[0], result: results[0] } : null;

  return (
    <div className="space-y-4">
      {multi && (
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          환승 {journey.legs.length - 1}회 · 총 {journey.totalStops}개 역 이동 · {slotLabel} 기준
        </div>
      )}

      {journey.legs.map((leg, i) => {
        const result = results[i];
        const rec = result.recommendation;
        const bestCar = rec ? result.cars.find((c) => c.car === rec.car)! : null;
        const selected = selectedCars[i] ?? null;
        const detailCar = selected ? result.cars.find((c) => c.car === selected) : null;
        const next = journey.legs[i + 1];

        return (
          <div key={i} className="space-y-4">
            {multi ? (
              <DirectionBanner route={leg.route} data={leg.data} prefix={`${i + 1}구간 · `} />
            ) : (
              <DirectionBanner route={leg.route} data={leg.data} slotLabel={slotLabel} />
            )}

            {rec && bestCar ? (
              <ResultCard recommendation={rec} bestCar={bestCar} totalStops={result.totalStops} />
            ) : (
              <section
                className="rounded-xl border p-5 text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface-1)",
                  color: "var(--text-secondary)",
                }}
              >
                {leg.route.intermediates.length === 0
                  ? "바로 다음 역이라 중간에 내리는 승객이 없어요. 아무 칸이나 타세요 🙂"
                  : "중간 역들의 하차 통계가 없어 추천을 만들 수 없어요."}
              </section>
            )}

            {rec && (
              <TrainViz
                cars={result.cars}
                doorsPerCar={leg.data.doorsPerCar}
                recommendation={rec}
                selectedCar={selected}
                onSelectCar={(car) =>
                  setSelectedCars((prev) => ({ ...prev, [i]: car === selected ? null : car }))
                }
              />
            )}

            {detailCar && <CarDetail car={detailCar} doors={result.doors} />}

            {rec && (
              <FeedbackWidget
                queryKey={`${leg.data.line}|${leg.route.origin.id}|${leg.route.destination.id}|${slot.id}|leg${i}`}
                label={multi ? `${i + 1}구간 · ${leg.data.lineName}` : undefined}
                intermediates={leg.route.intermediates.map(({ station, stopsAway }) => ({
                  id: station.id,
                  name: station.name,
                  stopsAway,
                }))}
                entry={{
                  line: leg.data.line,
                  originId: leg.route.origin.id,
                  destId: leg.route.destination.id,
                  hour: slot.hours[0],
                  dayType,
                  alpha,
                  totalStops: leg.route.totalStops,
                  legIndex: i,
                  transfers: journey.legs.length - 1,
                  recCar: rec.car,
                  recDoor: rec.door.door,
                  predictedProb: Math.round(rec.seatProb * 100) / 100,
                  predictedExpSeated: Math.round(rec.expSeatedStops * 10) / 10,
                  predictedBoardProb: Math.round(rec.boardSeatProb * 100) / 100,
                }}
              />
            )}

            {next && (
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
              >
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  🔄 {leg.route.destination.name}에서 {next.data.lineName} 환승 ·{" "}
                  {directionLabel(next.data, next.route.direction)}
                </span>
                {leg.transferFastDoor && (
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    환승 통로와 가까운 문은 {leg.transferFastDoor.car}-{leg.transferFastDoor.door}문
                    — 내리기 직전에 옮겨 서면 갈아타기가 빨라요
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {single?.result.recommendation && (
        <DepartureChart
          route={single.leg.route}
          data={single.leg.data}
          dayType={dayType}
          alpha={alpha}
          activeHours={slot.hours}
          onPickHour={onPickHour}
        />
      )}
    </div>
  );
}
