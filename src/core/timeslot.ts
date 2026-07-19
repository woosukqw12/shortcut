import type { DayType } from "../data/schema";
import type { TimeSlot } from "./types";

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** 데이터가 존재하는 시간 버킷: 05시(=06시 이전 포함) ~ 24시(=자정 이후 포함) */
export const SERVICE_HOURS = range(5, 24);

/** 여러 시간을 묶은 프리셋 (테스트·집계용) */
export const TIME_SLOTS: TimeSlot[] = [
  { id: "am", label: "출근 07–09", hours: range(7, 9), dayType: "weekday" },
  { id: "day", label: "낮 10–16", hours: range(10, 16), dayType: "weekday" },
  { id: "pm", label: "퇴근 17–19", hours: range(17, 19), dayType: "weekday" },
  { id: "night", label: "저녁 20–24", hours: range(20, 24), dayType: "weekday" },
];

export function dayTypeOf(date: Date): DayType {
  const dow = date.getDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

/** 실제 시각(0~23시)을 데이터 버킷 범위(5~24)로 보정. 0시→24시 버킷, 새벽 1~4시→첫차(5시) */
export function clampServiceHour(hour: number): number {
  if (hour === 0) return 24;
  if (hour >= 1 && hour <= 4) return 5;
  return hour;
}

export function hourLabel(hour: number): string {
  return hour === 24 ? "자정 무렵" : `${hour}시`;
}

/** 특정 시(hour) 하나만 보는 정밀 슬롯 */
export function hourSlot(hour: number, dayType: DayType = "weekday"): TimeSlot {
  const h = clampServiceHour(hour);
  return { id: `h${h}-${dayType}`, label: hourLabel(h), hours: [h], dayType };
}

/**
 * 시:분 슬롯 — 통계는 시간 단위이므로 계산은 해당 시(hour) 버킷으로 하고,
 * 라벨만 선택한 시:분(HH:MM)을 그대로 보여준다.
 */
export function timeSlot(hour: number, minute: number, dayType: DayType): TimeSlot {
  const h = clampServiceHour(hour);
  const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { id: `t${hour}:${minute}-${dayType}`, label, hours: [h], dayType };
}

/** alightByHour 배열 인덱스: 시(hour) 5~24 → 0~19 */
export function hourToIndex(hour: number): number {
  return hour - 5;
}

/**
 * 방향당 시간당 열차 운행 횟수(근사). 하차 통계를 "열차 1대당 하차 인원"으로
 * 환산할 때 사용. 평일 RH 배차 ~4-5분, 평시·주말 ~7-8분 기준.
 */
export function trainsPerHour(hour: number, dayType: DayType): number {
  if (dayType === "weekend") return 8;
  return (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 13 : 8;
}
