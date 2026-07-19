import type { Hotspot, LineData, RouteKind, Station } from "../src/data/schema";

export function makeStation(partial: Partial<Station> & { id: string; order: number }): Station {
  return {
    name: `역${partial.order}`,
    alightByHour: { weekday: new Array(20).fill(0), weekend: new Array(20).fill(0) },
    boardByHour: { weekday: new Array(20).fill(0), weekend: new Array(20).fill(0) },
    hasRidership: true,
    congestion: { up: null, down: null },
    hotspots: { up: [], down: [] },
    ...partial,
  };
}

export function makeLineData(
  stations: Station[],
  opts: {
    carCount?: number;
    doorsPerCar?: number;
    routeKind?: RouteKind;
    loopUntilOrder?: number;
  } = {},
): LineData {
  return {
    line: "7",
    lineName: "테스트선",
    lineColor: "#747F00",
    routeKind: opts.routeKind ?? "linear",
    directionLabels: { up: "상행 방면", down: "하행 방면" },
    ...(opts.loopUntilOrder !== undefined && { loopUntilOrder: opts.loopUntilOrder }),
    carCount: opts.carCount ?? 8,
    doorsPerCar: opts.doorsPerCar ?? 4,
    generatedAt: "test",
    sources: {},
    stations,
  };
}

export function hotspot(car: number, door: number, label = "환승"): Hotspot {
  return { car, door, kind: "transfer", label };
}

/** 모든 시간대·요일에 동일 하차 인원을 채운 값 */
export function flatAlight(value: number): { weekday: number[]; weekend: number[] } {
  return { weekday: new Array(20).fill(value), weekend: new Array(20).fill(value) };
}

/** 모든 시간대·요일에 동일 승차 인원을 채운 값 */
export const flatBoard = flatAlight;

/** 모든 시간대·요일에 동일 혼잡도(%)를 채운 값 */
export function flatCongestion(value: number): { weekday: number[]; weekend: number[] } {
  return { weekday: new Array(20).fill(value), weekend: new Array(20).fill(value) };
}
