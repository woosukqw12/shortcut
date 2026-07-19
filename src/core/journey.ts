import type { LineData, StationIndexEntry, StationsIndex, TransferLink } from "../data/schema";
import { resolveRoute } from "./route";
import type { Route } from "./types";

/**
 * 환승 포함 여정 계획 (환승 1회까지).
 * 후보 = 직행(출발·도착을 모두 담는 노선 변형) + 1회 환승(출발 노선 변형 × 도착 노선
 * 변형의 공유 물리 역에서 갈아타기). 비용 = 정거장 수 합 + 환승당 페널티(도보·대기 환산),
 * 최소 비용 후보를 고른다. 5호선 본선↔마천지선도 같은 틀로 풀린다(강동이 공유 역).
 * 좌석 추천은 구간별로 기존 scoreRoute를 그대로 쓰고, 환승역의 빠른환승 문 위치는
 * 부가 정보로만 제공한다 (주 추천은 착석 기준이라는 제품 결정).
 */

/** 환승 페널티 폴백 (실측 도보 시간이 없는 링크): 도보+대기 ≈ 3정거장 상당 */
export const TRANSFER_PENALTY_STOPS = 3;
/** 다음 열차 대기 근사 (배차 절반 ≈ 3분 ≈ 1.5정거장) — 실측 도보에 더한다 */
export const TRANSFER_WAIT_STOPS = 1.5;
/** 역간 이동 ≈ 2분 기준으로 도보 시간을 정거장 수로 환산 */
const SECONDS_PER_STOP = 120;

/** 링크별 환승 페널티 (정거장 상당) — 실측 도보 시간이 있으면 그것 기준 */
export function transferPenaltyStops(link: TransferLink | undefined): number {
  if (!link || link.walkSeconds === null) return TRANSFER_PENALTY_STOPS;
  return link.walkSeconds / SECONDS_PER_STOP + TRANSFER_WAIT_STOPS;
}

export interface JourneyLeg {
  /** 이 구간이 타는 노선 변형 */
  data: LineData;
  route: Route;
  /**
   * 다음 구간이 있을 때: 환승 통로와 가까운 문 위치 (이 구간 도착 방향 기준).
   * 하차 통계가 아니라 빠른환승 원천 데이터에서 온 부가 정보. 없으면 null
   */
  transferFastDoor: { car: number; door: number } | null;
  /** 다음 구간이 있을 때: 실측 환승 도보 시간(초). 데이터 없으면 null */
  transferWalkSeconds: number | null;
  /** 다음 구간이 있을 때: 환승 통로에서 나오면 서게 되는 다음 노선 위치 (다음 구간 방향 기준) */
  transferBoardPos: { car: number; door: number } | null;
}

export interface Journey {
  legs: JourneyLeg[];
  /** 실제 이동 정거장 수 합 (환승 페널티 제외) */
  totalStops: number;
}

/** 이름(별칭 포함)으로 물리 역 찾기 */
export function findEntry(index: StationsIndex, name: string): StationIndexEntry | null {
  return index.find((e) => e.name === name || e.aliases?.includes(name)) ?? null;
}

/** 변형 노선 키("5m")에서 기본 노선 키("5") */
const baseLineKey = (line: string) => line.replace(/m$/, "");

/** 구간 도착 시점의 진행 방향 (loop-tail은 중간에 방향이 바뀔 수 있다) */
function arrivalDir(route: Route) {
  return route.intermediates.at(-1)?.dir ?? route.direction;
}

/** 환승역 도착 방향 기준, 다음 노선으로의 빠른환승 문 위치 */
function fastTransferDoor(
  leg: Route,
  nextLine: LineData,
): { car: number; door: number } | null {
  const label = `${baseLineKey(nextLine.line)}호선 환승`;
  const h = leg.destination.hotspots[arrivalDir(leg)].find(
    (h) => h.kind === "transfer" && h.label === label,
  );
  return h ? { car: h.car, door: h.door } : null;
}

/**
 * 두 물리 역을 잇는 최적 여정. 환승 1회로도 연결되지 않으면 null.
 * variantsByLine에는 출발·도착 역이 속한 모든 노선의 변형 데이터가 있어야 한다.
 */
export function planJourney(
  origin: StationIndexEntry,
  dest: StationIndexEntry,
  index: StationsIndex,
  variantsByLine: Map<string, LineData[]>,
  transfers: TransferLink[] = [],
): Journey | null {
  const linkByKey = new Map(transfers.map((t) => [`${t.from}|${t.stationId}|${t.to}`, t]));
  const variantsOf = (lineKey: string) => variantsByLine.get(lineKey) ?? [];
  const idOn = (entry: StationIndexEntry, lineKey: string) =>
    entry.lines.find((l) => l.line === lineKey)?.id ?? null;

  // 지선 때문에 노선 소속 ≠ 변형 소속 (오금은 5호선이지만 마천행 변형에만 있다)
  const idSets = new Map<LineData, Set<string>>();
  const inVariant = (v: LineData, id: string | null): id is string => {
    if (id === null) return false;
    let set = idSets.get(v);
    if (!set) {
      set = new Set(v.stations.map((s) => s.id));
      idSets.set(v, set);
    }
    return set.has(id);
  };

  let best: { cost: number; journey: () => Journey } | null = null;
  const consider = (cost: number, journey: () => Journey) => {
    if (!best || cost < best.cost) best = { cost, journey };
  };

  // 직행 후보
  for (const eo of origin.lines) {
    const destId = idOn(dest, eo.line);
    for (const v of variantsOf(eo.line)) {
      if (!inVariant(v, eo.id) || !inVariant(v, destId)) continue;
      const route = resolveRoute(eo.id, destId, v);
      consider(route.totalStops, () => ({
        legs: [
          {
            data: v,
            route,
            transferFastDoor: null,
            transferWalkSeconds: null,
            transferBoardPos: null,
          },
        ],
        totalStops: route.totalStops,
      }));
    }
  }

  // 1회 환승 후보: 출발 변형과 도착 변형이 공유하는 물리 역 전부
  for (const eo of origin.lines) {
    for (const va of variantsOf(eo.line)) {
      if (!inVariant(va, eo.id)) continue;
      for (const ed of dest.lines) {
        for (const vb of variantsOf(ed.line)) {
          if (va === vb || !inVariant(vb, ed.id)) continue;
          for (const t of index) {
            if (t === origin || t === dest) continue;
            const ta = idOn(t, eo.line);
            const tb = idOn(t, ed.line);
            if (!inVariant(va, ta) || !inVariant(vb, tb)) continue;
            const legA = resolveRoute(eo.id, ta, va);
            const legB = resolveRoute(tb, idOn(dest, ed.line)!, vb);
            const stops = legA.totalStops + legB.totalStops;
            const link = linkByKey.get(`${eo.line}|${ta}|${ed.line}`);
            consider(stops + transferPenaltyStops(link), () => {
              // 환승 후 서게 되는 위치는 2구간의 탑승 방향 좌표로 기록돼 있다
              const boardDir = legB.intermediates[0]?.dir ?? legB.direction;
              return {
                legs: [
                  {
                    data: va,
                    route: legA,
                    transferFastDoor: fastTransferDoor(legA, vb),
                    transferWalkSeconds: link?.walkSeconds ?? null,
                    transferBoardPos: link?.board[boardDir] ?? null,
                  },
                  {
                    data: vb,
                    route: legB,
                    transferFastDoor: null,
                    transferWalkSeconds: null,
                    transferBoardPos: null,
                  },
                ],
                totalStops: stops,
              };
            });
          }
        }
      }
    }
  }

  return best === null ? null : (best as { cost: number; journey: () => Journey }).journey();
}
