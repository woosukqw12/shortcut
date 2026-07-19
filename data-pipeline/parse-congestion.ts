/**
 * OA-12928 (지하철혼잡도정보, CP949)에서 역·방향·요일별 시간대 혼잡도를 추출한다.
 * 원본은 30분 단위(5시30분~00시30분) 출발 시점 혼잡도(정원 대비 %) → 시간 단위로 평균.
 * 요일: 평일 → weekday, 토요일·일요일 → 평균해서 weekend.
 *
 * 상하구분 → up/down 매핑은 노선마다 다르다 (역번호 증가 방향과 상행 방향의 관계):
 *  - 1호선: 역번호가 서울역→청량리로 증가하는데 상행(소요산 방면)이 그 방향 → 상선=down
 *  - 2호선: 내선(시계방향, 역번호 증가)=down, 외선=up
 *  - 3~8호선: 역번호가 상행 종점부터 매겨져 있어 → 상선=up, 하선=down
 * (검증: 사당 외선·중계 하선·한성대입구 하선·남한산성입구 상선의 출근 피크 방향 일치 확인)
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readCsvCp949 } from "./csv";

const CONGESTION_CSV = join(dirname(fileURLToPath(import.meta.url)), "raw", "congestion.csv");

const DIR_MAP: Record<string, Record<string, "up" | "down">> = {
  "1호선": { 상선: "down", 하선: "up" },
  "2호선": { 내선: "down", 외선: "up" },
};
const DEFAULT_DIR_MAP: Record<string, "up" | "down"> = { 상선: "up", 하선: "down" };

export interface CongestionResult {
  /** `${csvLine}|${code}|${up|down}|${weekday|weekend}` → 시간대별 혼잡도 (길이 20, 5~24시) */
  byKey: Map<string, number[]>;
}

export function parseCongestion(csvPath: string = CONGESTION_CSV): CongestionResult {
  const rows = readCsvCp949(csvPath);
  const header = rows[0];
  const cDay = header.indexOf("요일구분");
  const cLine = header.indexOf("호선");
  const cCode = header.indexOf("역번호");
  const cDir = header.indexOf("상하구분");
  if ([cDay, cLine, cCode, cDir].some((i) => i < 0)) {
    throw new Error(`혼잡도 CSV 헤더가 예상과 다릅니다: ${header.join(",")}`);
  }

  // 30분 컬럼 → 시간 버킷 인덱스(0=05시 ~ 19=24시). "00시××분"은 자정 버킷(24시)
  const bucketCols: { col: number; hourIdx: number }[] = [];
  header.forEach((h, col) => {
    const m = h.trim().match(/^(\d{1,2})시(\d{2})분$/);
    if (!m) return;
    const hour = Number(m[1]) === 0 ? 24 : Number(m[1]);
    if (hour < 5 || hour > 24) return;
    bucketCols.push({ col, hourIdx: hour - 5 });
  });

  // 합산 후 평균: key → {sum[20], count[20]} (주말은 토+일 두 행이 합쳐진다)
  const sums = new Map<string, { sum: Float64Array; count: Float64Array }>();
  for (const row of rows.slice(1)) {
    const csvLine = row[cLine]?.trim();
    if (!/^[1-8]호선$/.test(csvLine)) continue;
    const dir = (DIR_MAP[csvLine] ?? DEFAULT_DIR_MAP)[row[cDir]?.trim()];
    if (!dir) continue;
    const dayType = row[cDay] === "평일" ? "weekday" : "weekend";
    const key = `${csvLine}|${row[cCode].trim()}|${dir}|${dayType}`;

    let acc = sums.get(key);
    if (!acc) {
      acc = { sum: new Float64Array(20), count: new Float64Array(20) };
      sums.set(key, acc);
    }
    for (const { col, hourIdx } of bucketCols) {
      const v = Number(row[col]);
      if (!Number.isFinite(v)) continue;
      acc.sum[hourIdx] += v;
      acc.count[hourIdx] += 1;
    }
  }

  const byKey = new Map<string, number[]>();
  for (const [key, { sum, count }] of sums) {
    byKey.set(
      key,
      Array.from(sum, (v, i) => (count[i] > 0 ? Math.round((v / count[i]) * 10) / 10 : 0)),
    );
  }
  return { byKey };
}
