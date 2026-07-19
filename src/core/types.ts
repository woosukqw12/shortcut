import type { Station } from "../data/schema";

/** up = order 감소 방향, down = order 증가 방향. 안내 라벨은 LineData.directionLabels */
export type Direction = "up" | "down";

export interface DoorId {
  /** 1-based 칸 번호 */
  car: number;
  /** 1-based 칸 내 문 번호 */
  door: number;
}

export interface TimeSlot {
  id: string;
  label: string;
  /** 포함되는 시(hour) 목록, 5~24 */
  hours: number[];
  /** 평일/주말 — 하차 통계·혼잡도·배차가 모두 요일에 따라 달라진다 */
  dayType: "weekday" | "weekend";
}

export interface RouteStop {
  station: Station;
  /** 출발역에서 몇 정거장 후에 도착하는지 (1부터) */
  stopsAway: number;
  /** 이 역을 지날 때의 열차 진행 방향 (6호선 루프 경로는 구간마다 다를 수 있음) */
  dir: Direction;
}

export interface Route {
  direction: Direction;
  origin: Station;
  destination: Station;
  /** 출발·도착 사이 중간 역들 (탑승 방향 순서, 도착역 제외) */
  intermediates: RouteStop[];
  totalStops: number;
}
