import type { LineData, Station } from "../data/schema";
import type { Direction } from "./types";

export interface ScoringParams {
  /** hotspot 쏠림 비중 — 나머지 (1−λ)는 균등 분포 */
  lambda: number;
  /** hotspot 주변 가우시안 커널 폭 (문 인덱스 단위) */
  sigma: number;
  /**
   * 좌석 경쟁 상수 C 폴백 — 혼잡도 데이터가 없는 역에서 사용.
   * 좌석 확보 확률 p = 1 − exp(−(열차당 그 문 하차 인원)/C). 클수록 보수적.
   */
  competition: number;
  /** 방향 비율 폴백 — 혼잡도 데이터가 없어 방향 배분을 못 할 때 (절반 가정) */
  directionShare: number;
  /** 혼잡도→경쟁 환산: C = 1 + κ·(문 구역 입석 인원) */
  kappa: number;
  /** 혼잡도 100% 기준 칸당 정원 (국토부 기준 160명) */
  capacityPerCar: number;
  /** 칸당 좌석 수 (일반 전동차 ~54석, 혼잡도 34% = 좌석 만석) */
  seatsPerCar: number;
  /** 추천 성향: α·앉을확률 + (1−α)·기대착석비율. 1=확실히 앉기(확률), 0=앉는 시간(기댓값) */
  alpha: number;
}

export const DEFAULT_PARAMS: ScoringParams = {
  lambda: 0.6,
  sigma: 2,
  competition: 3,
  directionShare: 0.5,
  kappa: 0.5,
  capacityPerCar: 160,
  seatsPerCar: 54,
  alpha: 0.3,
};

export function doorIndex(car: number, door: number, doorsPerCar: number): number {
  return (car - 1) * doorsPerCar + (door - 1);
}

/**
 * 역 s에서 하차하는 승객이 열차 내 어디에 있는지의 분포 (문 단위, 합=1).
 * 승객은 자기 목적지의 환승 통로·계단과 가까운 문 근처에 몰린다는 가정:
 * W_s = (1−λ)·균등 + λ·(hotspot별 가우시안 커널 평균)
 * hotspot 데이터가 없는 역은 순수 균등 분포로 폴백.
 */
export function doorWeightVector(
  station: Station,
  dir: Direction,
  data: LineData,
  params: ScoringParams = DEFAULT_PARAMS,
): Float64Array {
  const doorCount = data.carCount * data.doorsPerCar;
  const uniform = 1 / doorCount;
  const hotspots = station.hotspots[dir].filter((h) => h.car <= data.carCount);
  const weights = new Float64Array(doorCount);

  if (hotspots.length === 0) {
    weights.fill(uniform);
    return weights;
  }

  weights.fill((1 - params.lambda) * uniform);
  const twoSigmaSq = 2 * params.sigma * params.sigma;
  for (const h of hotspots) {
    const center = doorIndex(h.car, h.door, data.doorsPerCar);
    // 도메인이 유한하므로 커널을 잘라낸 뒤 재정규화해 hotspot당 질량을 정확히 1로 맞춘다
    const kernel = new Float64Array(doorCount);
    let mass = 0;
    for (let i = 0; i < doorCount; i++) {
      const d = i - center;
      kernel[i] = Math.exp(-(d * d) / twoSigmaSq);
      mass += kernel[i];
    }
    for (let i = 0; i < doorCount; i++) {
      weights[i] += (params.lambda / hotspots.length) * (kernel[i] / mass);
    }
  }
  return weights;
}
