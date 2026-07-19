import type { LineData, Station } from "../data/schema";
import type { Direction, Route, RouteStop } from "./types";

export function directionLabel(data: LineData, dir: Direction): string {
  return data.directionLabels[dir];
}

function stationById(data: LineData, id: string): Station {
  const s = data.stations.find((st) => st.id === id);
  if (!s) throw new Error(`역을 찾을 수 없습니다: ${id}`);
  return s;
}

/**
 * 노선 형태별 경로 계산. 경로 = 중간 역의 순서 리스트(+각 구간의 진행 방향)이며,
 * scoring은 이 리스트만 소비하므로 형태별 차이는 여기서 끝난다.
 * - linear: order 비교로 방향 결정
 * - circular(2호선): 시계(내선=down)/반시계(외선=up) 중 짧은 쪽
 * - loop-tail(6호선): order 0..loopUntilOrder가 단방향 순환(0=분기역 응암),
 *   그 뒤가 본선 꼬리. 루프는 항상 order 증가 방향(실운행 순서)으로만 돈다.
 */
export function resolveRoute(originId: string, destId: string, data: LineData): Route {
  if (originId === destId) throw new Error("출발역과 도착역이 같습니다");
  const origin = stationById(data, originId);
  const destination = stationById(data, destId);
  const byOrder = new Map(data.stations.map((s) => [s.order, s]));
  const at = (o: number): Station => {
    const s = byOrder.get(o);
    if (!s) throw new Error(`노선 순서 ${o}에 해당하는 역이 없습니다`);
    return s;
  };

  let orders: number[]; // 출발 다음 역부터 도착역 직전까지
  let direction: Direction;
  let totalStops: number;
  const dirs: Direction[] = []; // orders[i]를 지날 때 방향 (기본: direction)

  if (data.routeKind === "circular") {
    const n = data.stations.length;
    const downDist = (destination.order - origin.order + n) % n;
    const upDist = n - downDist;
    direction = downDist <= upDist ? "down" : "up";
    totalStops = Math.min(downDist, upDist);
    const step = direction === "down" ? 1 : -1;
    orders = [];
    for (let k = 1; k < totalStops; k++) {
      orders.push((((origin.order + step * k) % n) + n) % n);
    }
  } else if (data.routeKind === "loop-tail") {
    const L = data.loopUntilOrder ?? 0; // 루프 = order 0..L (0이 분기역)
    const loopN = L + 1;
    const inLoop = (o: number) => o <= L;
    const path: { order: number; dir: Direction }[] = [];

    if (!inLoop(origin.order) && !inLoop(destination.order)) {
      // 본선 꼬리 내부: 일반 직선
      direction = destination.order > origin.order ? "down" : "up";
      const step = direction === "down" ? 1 : -1;
      for (let o = origin.order + step; o !== destination.order; o += step) {
        path.push({ order: o, dir: direction });
      }
    } else if (inLoop(origin.order) && inLoop(destination.order)) {
      // 루프 내부: 실운행 방향(순서 증가, 분기역에서 랩)으로만 진행
      direction = "down";
      let o = origin.order;
      while ((o = (o + 1) % loopN) !== destination.order) {
        path.push({ order: o, dir: "down" });
      }
    } else if (inLoop(origin.order)) {
      // 루프 → 꼬리: 루프를 마저 돌아 분기역(0)을 거쳐 꼬리로
      direction = "down";
      if (origin.order !== 0) {
        for (let o = origin.order + 1; o <= L; o++) path.push({ order: o, dir: "down" });
        path.push({ order: 0, dir: "down" });
      }
      for (let t = L + 1; t < destination.order; t++) path.push({ order: t, dir: "down" });
    } else {
      // 꼬리 → 루프: 분기역까지 올라간 뒤(up) 루프를 실운행 방향으로
      direction = "up";
      for (let o = origin.order - 1; o >= L + 1; o--) path.push({ order: o, dir: "up" });
      if (destination.order !== 0) {
        path.push({ order: 0, dir: "down" });
        for (let o = 1; o < destination.order; o++) path.push({ order: o, dir: "down" });
      }
    }
    orders = path.map((p) => p.order);
    dirs.push(...path.map((p) => p.dir));
    totalStops = orders.length + 1;
  } else {
    // linear
    direction = destination.order > origin.order ? "down" : "up";
    const step = direction === "down" ? 1 : -1;
    orders = [];
    for (let o = origin.order + step; o !== destination.order; o += step) {
      orders.push(o);
    }
    totalStops = Math.abs(destination.order - origin.order);
  }

  const intermediates: RouteStop[] = orders.map((o, i) => ({
    station: at(o),
    stopsAway: i + 1,
    dir: dirs[i] ?? direction,
  }));

  return { direction, origin, destination, intermediates, totalStops };
}
