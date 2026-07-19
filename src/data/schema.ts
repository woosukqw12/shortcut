import { z } from "zod";

/** 문 위치 hotspot — 이 역에서 내리는 승객이 몰리는 칸/문 (환승 통로·계단·출구 앞) */
export const hotspotSchema = z.object({
  car: z.number().int().min(1),
  door: z.number().int().min(1),
  kind: z.enum(["transfer", "exit"]),
  label: z.string(),
});

/** 05시~24시(다음날 0시 직전) 시간대별 값, 길이 20 — 평일/주말(토·일 평균) 분리 */
export const byDaySchema = z.object({
  weekday: z.array(z.number().min(0)).length(20),
  weekend: z.array(z.number().min(0)).length(20),
});

export const stationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 노선(변형) 내 0-based 순서 */
  order: z.number().int().min(0),
  /** 시간대별 일평균 하차 인원 */
  alightByHour: byDaySchema,
  /** 시간대별 일평균 승차 인원 — 출발역 탑승 경쟁(p₀) 추정용 */
  boardByHour: byDaySchema,
  /** 승하차 통계가 존재하는 역인지 (타 운영사 구간 등은 false) */
  hasRidership: z.boolean(),
  /**
   * 방향별 출발 시점 열차 혼잡도 (정원 대비 %, 100% = 칸당 160명, 좌석 만석 = 34%).
   * null = 데이터 없음 → 방향 비율·경쟁 상수 폴백 사용
   */
  congestion: z.object({
    up: byDaySchema.nullable(),
    down: byDaySchema.nullable(),
  }),
  /** 방향별 hotspot. up/down 의미는 노선의 directionLabels 참조. 빈 배열이면 균등 폴백 */
  hotspots: z.object({
    up: z.array(hotspotSchema),
    down: z.array(hotspotSchema),
  }),
});

export type DayType = "weekday" | "weekend";

export const routeKindSchema = z.enum(["linear", "circular", "loop-tail"]);

export const lineDataSchema = z.object({
  /** 노선 변형 키 ("7", "2", "5", "5m" 등) */
  line: z.string(),
  /** 표시용 노선 이름 ("7호선", "5호선 마천행") */
  lineName: z.string(),
  /** 공식 노선색 hex */
  lineColor: z.string(),
  routeKind: routeKindSchema,
  /** up = order 감소 방향, down = order 증가 방향의 안내 라벨 */
  directionLabels: z.object({ up: z.string(), down: z.string() }),
  /** loop-tail 전용: order 0..loopUntilOrder 가 단방향 순환 구간 (0 = 분기역) */
  loopUntilOrder: z.number().int().min(1).optional(),
  carCount: z.number().int().min(1),
  doorsPerCar: z.number().int().min(1),
  generatedAt: z.string(),
  sources: z.record(z.string(), z.string()),
  stations: z.array(stationSchema).min(2),
});

/** 노선 선택 UI용 인덱스 (lines.json) */
export const lineIndexSchema = z.array(
  z.object({
    /** 선택 키 ("1".."8") */
    key: z.string(),
    name: z.string(),
    color: z.string(),
    /** 이 노선을 구성하는 변형 데이터 파일 키 (예: 5호선 → ["line5", "line5m"]) */
    variants: z.array(z.string()).min(1),
  }),
);

/** 전역 역 인덱스 (stations-index.json) — 역 검색·환승 경로 탐색용, 물리 역 단위 */
export const stationsIndexSchema = z.array(
  z.object({
    /** 물리 역 대표 이름 (노선 간 표기가 다르면 하나로 통일, 예: 이수) */
    name: z.string(),
    /** 타 노선의 다른 표기 (검색·표시용, 예: 총신대입구) */
    aliases: z.array(z.string()).optional(),
    /** 이 역이 속한 노선들과 노선별 역 id·표기 */
    lines: z
      .array(z.object({ line: z.string(), id: z.string(), name: z.string() }))
      .min(1),
  }),
);

export type Hotspot = z.infer<typeof hotspotSchema>;
export type Station = z.infer<typeof stationSchema>;
export type RouteKind = z.infer<typeof routeKindSchema>;
export type LineData = z.infer<typeof lineDataSchema>;
export type LineIndex = z.infer<typeof lineIndexSchema>;
export type StationsIndex = z.infer<typeof stationsIndexSchema>;
export type StationIndexEntry = StationsIndex[number];
