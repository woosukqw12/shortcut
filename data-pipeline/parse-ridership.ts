/**
 * OA-12921 (역별 일별 시간대별 승하차인원, CP949)에서 1~8호선 승차·하차 인원을
 * (호선, 역번호) 단위로 집계한다. 역번호가 노선 순서를 담고 있어
 * 역 목록 생성의 근거로도 쓴다.
 * CSV 버킷: 06시이전, 06-07시간대, ..., 23-24시간대, 24시이후 (20개)
 * → alightByHour/boardByHour 인덱스 0(=05시 버킷, 06시 이전 포함) ~ 19(=24시 이후)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsvCp949 } from "./csv";

const RIDERSHIP_CSV = join(dirname(fileURLToPath(import.meta.url)), "raw", "ridership2025.csv");
const BUCKET_COUNT = 20;

export interface CodeEntry {
  csvLine: string;
  code: string;
  /** 연중 개명 등으로 이름이 여럿일 수 있다 */
  names: string[];
  /** 시간대별 일평균 하차 인원 (길이 20) — 평일/주말 분리 (공휴일은 평일로 집계되는 한계 있음) */
  alightByHour: { weekday: number[]; weekend: number[] };
  /** 시간대별 일평균 승차 인원 (형식 동일) — 출발역 탑승 경쟁 추정용 */
  boardByHour: { weekday: number[]; weekend: number[] };
}

export interface RidershipResult {
  /** `${csvLine}|${code}` → entry */
  byLineCode: Map<string, CodeEntry>;
  dateRange: { from: string; to: string };
}

export function parseRidership(csvPath: string = RIDERSHIP_CSV): RidershipResult {
  const rows = readCsvCp949(csvPath);
  const header = rows[0];
  const cDate = header.indexOf("수송일자");
  const cLine = header.indexOf("호선");
  const cCode = header.indexOf("역번호");
  const cName = header.indexOf("역명");
  const cKind = header.indexOf("승하차구분");
  const cFirstBucket = header.indexOf("06시이전");
  if ([cDate, cLine, cCode, cName, cKind, cFirstBucket].some((i) => i < 0)) {
    throw new Error(`승하차 CSV 헤더가 예상과 다릅니다: ${header.join(",")}`);
  }

  type DayType = "weekday" | "weekend";
  type Kind = "하차" | "승차";
  const sums = new Map<string, Record<Kind, Record<DayType, Float64Array>>>();
  const names = new Map<string, Set<string>>();
  const days = new Map<string, Record<DayType, Set<string>>>();
  const dayTypeCache = new Map<string, DayType>();
  const dayTypeOf = (date: string): DayType => {
    let t = dayTypeCache.get(date);
    if (!t) {
      const dow = new Date(`${date}T00:00:00`).getDay();
      t = dow === 0 || dow === 6 ? "weekend" : "weekday";
      dayTypeCache.set(date, t);
    }
    return t;
  };
  let minDate = "9999-99-99";
  let maxDate = "0000-00-00";

  for (const row of rows.slice(1)) {
    const kind = row[cKind] as Kind;
    if ((kind !== "하차" && kind !== "승차") || !/^[1-8]호선$/.test(row[cLine])) continue;
    const key = `${row[cLine]}|${row[cCode]}`;

    let sum = sums.get(key);
    if (!sum) {
      const empty = () => ({
        weekday: new Float64Array(BUCKET_COUNT),
        weekend: new Float64Array(BUCKET_COUNT),
      });
      sum = { 하차: empty(), 승차: empty() };
      sums.set(key, sum);
      names.set(key, new Set());
      days.set(key, { weekday: new Set(), weekend: new Set() });
    }
    const date = row[cDate];
    const dayType = dayTypeOf(date);
    for (let b = 0; b < BUCKET_COUNT; b++) {
      sum[kind][dayType][b] += Number(row[cFirstBucket + b]) || 0;
    }
    names.get(key)!.add(row[cName].trim());
    days.get(key)![dayType].add(date);
    if (date < minDate) minDate = date;
    if (date > maxDate) maxDate = date;
  }

  const byLineCode = new Map<string, CodeEntry>();
  for (const [key, sum] of sums) {
    const [csvLine, code] = key.split("|");
    const avg = (kind: Kind, dayType: DayType) => {
      const n = days.get(key)![dayType].size;
      return Array.from(sum[kind][dayType], (v) => (n > 0 ? Math.round((v / n) * 10) / 10 : 0));
    };
    byLineCode.set(key, {
      csvLine,
      code,
      names: [...names.get(key)!],
      alightByHour: { weekday: avg("하차", "weekday"), weekend: avg("하차", "weekend") },
      boardByHour: { weekday: avg("승차", "weekday"), weekend: avg("승차", "weekend") },
    });
  }
  return { byLineCode, dateRange: { from: minDate, to: maxDate } };
}
