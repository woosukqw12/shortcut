import type { LineData, Station } from "../data/schema";
import { DEFAULT_PARAMS, doorWeightVector, type ScoringParams } from "./doorWeights";
import { hourToIndex, trainsPerHour } from "./timeslot";
import type { Direction, DoorId, Route, TimeSlot } from "./types";

/**
 * 확률 모델: 문 앞에 서 있을 때, 각 중간 역에서 좌석을 확보할 확률을
 * p(s) = 1 − exp(−freed(s)/C(s)) 로 두고 (freed = 열차 1대당 그 문 구역 하차 인원),
 * 아직 못 앉았을 확률(생존)을 곱해가며 두 지표를 함께 계산한다:
 *   - seatProb        : 도착 전까지 한 번이라도 앉을 확률
 *   - expSeatedStops  : 기대 착석 정거장 수 = Σ 생존(s)·p(s)·(남은 정거장 수)
 *
 * 혼잡도 통계(역·방향·요일·시간별 정원 대비 %)가 있으면 실측 보정한다:
 *   - 방향 비율: 하차 통계는 양방향 합산 → 도착 열차의 재차 인원에 비례해 배분
 *     (내 방향 혼잡도 / 양방향 혼잡도 합, 0.15~0.85로 클램프)
 *   - 경쟁 상수 C(s): 좌석이 빌 때 그 문 구역의 입석 인원이 경쟁자
 *     C = 1 + κ · max(0, 정원×혼잡도 − 좌석수)/문수. 데이터 없으면 고정값 폴백
 *
 * 추천 순위는 α 가중 결합: rank = α·앉을확률 + (1−α)·기대착석/최대착석.
 * α가 클수록 "한 번이라도 확실히 앉기"(확률), 작을수록 "앉는 시간 최대화"(기댓값)를 우선한다.
 */

export interface DoorScore {
  door: DoorId;
  /** 도착 전까지 앉을 확률 0~1 */
  seatProb: number;
  /** 기대 착석 정거장 수 */
  expSeatedStops: number;
  /** α 가중 결합 점수 0~1 (순위 기준) */
  rankScore: number;
  /** 0~100, 쿼리 내 최대 rankScore = 100 (상대 점수) */
  norm: number;
}

export interface CarContributor {
  stationId: string;
  stationName: string;
  stopsAway: number;
  /** hotspot 근거 라벨 (예: "3호선 환승"), 균등 폴백이면 빈 배열 */
  labels: string[];
  /** 이 칸 최고 문의 기대 착석에서 해당 역이 차지하는 비율 0~1 */
  share: number;
}

export interface CarScore {
  car: number;
  /** 칸에서 가장 좋은 문 기준 */
  seatProb: number;
  expSeatedStops: number;
  rankScore: number;
  norm: number;
  /** 1 = 최고 */
  rank: number;
  topContributors: CarContributor[];
}

export interface Recommendation {
  car: number;
  door: DoorId;
  /** "3-2" 형태 승강장 표기 */
  positionLabel: string;
  seatProb: number;
  expSeatedStops: number;
}

export interface ScoreResult {
  doors: DoorScore[];
  cars: CarScore[];
  /** 중간 역이 없거나(인접 역) 하차 데이터가 전무하면 null */
  recommendation: Recommendation | null;
  totalStops: number;
}

/** 시간대 평균 혼잡도(%). 데이터 없으면 null */
function meanCongestion(station: Station, dir: Direction, slot: TimeSlot): number | null {
  const series = station.congestion[dir]?.[slot.dayType];
  if (!series) return null;
  let sum = 0;
  for (const h of slot.hours) sum += series[hourToIndex(h)] ?? 0;
  const mean = sum / slot.hours.length;
  return mean > 0 ? mean : null;
}

/** 하차 인원 중 내 방향 비율 — 도착 열차 재차 인원(혼잡도)에 비례 배분 */
function directionShare(
  station: Station,
  dir: Direction,
  slot: TimeSlot,
  params: ScoringParams,
): number {
  const mine = meanCongestion(station, dir, slot);
  const other = meanCongestion(station, dir === "up" ? "down" : "up", slot);
  if (mine === null || other === null) return params.directionShare;
  return Math.min(0.85, Math.max(0.15, mine / (mine + other)));
}

/** 좌석 경쟁 상수 — 혼잡도로 문 구역 입석 인원을 추정 */
function competitionAt(
  station: Station,
  dir: Direction,
  slot: TimeSlot,
  data: LineData,
  params: ScoringParams,
): number {
  const cong = meanCongestion(station, dir, slot);
  if (cong === null) return params.competition;
  const standeesPerDoor = Math.max(
    0,
    (params.capacityPerCar * cong) / 100 - params.seatsPerCar,
  ) / data.doorsPerCar;
  return Math.max(1, 1 + params.kappa * standeesPerDoor);
}

/** 시간대 평균 "열차 1대당" 하차 인원 (방향 비율 적용 전) */
function alightPerTrain(station: Station, slot: TimeSlot): number {
  const series = station.alightByHour[slot.dayType];
  let sum = 0;
  for (const h of slot.hours) {
    sum += (series[hourToIndex(h)] ?? 0) / trainsPerHour(h, slot.dayType);
  }
  return sum / slot.hours.length;
}

export function scoreRoute(
  route: Route,
  slot: TimeSlot,
  data: LineData,
  paramsIn: Partial<ScoringParams> = {},
): ScoreResult {
  const params: ScoringParams = { ...DEFAULT_PARAMS, ...paramsIn };
  const doorCount = data.carCount * data.doorsPerCar;

  const survive = new Float64Array(doorCount).fill(1);
  const seatProb = new Float64Array(doorCount);
  const expSeated = new Float64Array(doorCount);
  // 설명 생성용: 문별 × 중간역별 기대 착석 기여
  const doorStationContrib = route.intermediates.map(() => new Float64Array(doorCount));

  route.intermediates.forEach(({ station, stopsAway, dir }, sIdx) => {
    if (!station.hasRidership) return; // 통계 없는 역(타 운영사 구간 등)은 기여 0
    const perTrain = alightPerTrain(station, slot) * directionShare(station, dir, slot, params);
    if (perTrain <= 0) return;
    const C = competitionAt(station, dir, slot, data, params);
    const remaining = route.totalStops - stopsAway;
    const w = doorWeightVector(station, dir, data, params);
    for (let i = 0; i < doorCount; i++) {
      // perTrain·w[i] = 이 문 구역에서 열차 1대당 내리는 인원
      const p = 1 - Math.exp(-(perTrain * w[i]) / C);
      const gain = survive[i] * p;
      seatProb[i] += gain;
      expSeated[i] += gain * remaining;
      doorStationContrib[sIdx][i] = gain * remaining;
      survive[i] *= 1 - p;
    }
  });

  // α 가중 결합 점수 (0~1): 확실히 앉기(seatProb) vs 앉는 시간(기대 착석 비율)
  const maxSeatable = Math.max(1, route.totalStops - 1);
  const rankScores = new Float64Array(doorCount);
  for (let i = 0; i < doorCount; i++) {
    rankScores[i] =
      params.alpha * seatProb[i] + (1 - params.alpha) * (expSeated[i] / maxSeatable);
  }
  const maxRank = Math.max(...rankScores);

  const doors: DoorScore[] = Array.from({ length: doorCount }, (_, i) => ({
    door: { car: Math.floor(i / data.doorsPerCar) + 1, door: (i % data.doorsPerCar) + 1 },
    seatProb: seatProb[i],
    expSeatedStops: expSeated[i],
    rankScore: rankScores[i],
    norm: maxRank > 0 ? (rankScores[i] / maxRank) * 100 : 0,
  }));

  // 칸 지표 = 그 칸에서 가장 좋은 문 (사용자는 한 문 앞에 선다)
  const bestDoorOfCar: number[] = [];
  for (let car = 0; car < data.carCount; car++) {
    let best = car * data.doorsPerCar;
    for (let d = 1; d < data.doorsPerCar; d++) {
      const i = car * data.doorsPerCar + d;
      if (rankScores[i] > rankScores[best]) best = i;
    }
    bestDoorOfCar.push(best);
  }
  const rankOrder = bestDoorOfCar
    .map((doorIdx, car) => ({ v: rankScores[doorIdx], car }))
    .sort((a, b) => b.v - a.v);
  const rankByCar = new Map(rankOrder.map(({ car }, idx) => [car, idx + 1]));

  const cars: CarScore[] = bestDoorOfCar.map((doorIdx, carIdx) => {
    const exp = expSeated[doorIdx];
    const topContributors: CarContributor[] = route.intermediates
      .map(({ station, stopsAway, dir }, sIdx) => ({
        stationId: station.id,
        stationName: station.name,
        stopsAway,
        labels: station.hotspots[dir]
          .filter((h) => h.car === carIdx + 1)
          .map((h) => h.label),
        share: exp > 0 ? doorStationContrib[sIdx][doorIdx] / exp : 0,
      }))
      .filter((c) => c.share > 0)
      .sort((a, b) => b.share - a.share)
      .slice(0, 3);
    return {
      car: carIdx + 1,
      seatProb: seatProb[doorIdx],
      expSeatedStops: exp,
      rankScore: rankScores[doorIdx],
      norm: maxRank > 0 ? (rankScores[doorIdx] / maxRank) * 100 : 0,
      rank: rankByCar.get(carIdx)!,
      topContributors,
    };
  });

  let recommendation: Recommendation | null = null;
  if (maxRank > 0) {
    const bestIdx = rankScores.indexOf(maxRank);
    const d = doors[bestIdx];
    recommendation = {
      car: d.door.car,
      door: d.door,
      positionLabel: `${d.door.car}-${d.door.door}`,
      seatProb: d.seatProb,
      expSeatedStops: d.expSeatedStops,
    };
  }

  return { doors, cars, recommendation, totalStops: route.totalStops };
}
