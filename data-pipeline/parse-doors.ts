/**
 * OA-22521 환승 데이터에서 1~8호선 하차 hotspot을 추출해 각 노선 변형의
 * station.hotspots에 채워 넣는다.
 * 각 행: "환승시작역에서 [방면] 열차의 [호차-문]에서 내리면 [환승종료 호선]으로 빠른환승"
 * → 그 역에서 내려 환승하는 승객이 몰리는 문 위치.
 *
 * 방면 → 방향(up/down) 해석:
 *  - linear: 방면 역의 order 비교. 관할 밖 역명은 externalTerminals 맵
 *  - circular(2호선): 순환 이웃 비교 (다음 역=내선 down, 이전 역=외선 up)
 *  - loop-tail(6호선): 루프 구간 역은 단방향이라 양방향에 동일 저장
 * 해석 불가 행은 경고 후 건너뛴다 (원천 데이터 오류 존재: 온수역 "오류동 방면" 등).
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hotspot, Station } from "../src/data/schema";
import type { VariantStations } from "./assemble-stations";
import { stripParen } from "./assemble-stations";
import { readCsvCp949 } from "./csv";

const TRANSFER_CSV = join(dirname(fileURLToPath(import.meta.url)), "raw", "transfer.csv");

function lineLabel(rawLine: string): string {
  return /^\d+$/.test(rawLine) ? `${rawLine}호선` : rawLine;
}

type Dir = "up" | "down";

/** 방면 역명으로 방향 결정. null이면 해석 불가 */
function resolveDirection(vs: VariantStations, station: Station, towardRaw: string): Dir | null {
  const towardName = stripParen(towardRaw.replace(/방면$/, "").trim());
  const external = vs.def.externalTerminals?.[towardName];
  const toward = vs.byName.get(towardName);

  if (vs.variant.routeKind === "circular") {
    if (!toward) return external ?? null;
    const n = vs.stations.length;
    if (toward.order === (station.order + 1) % n) return "down"; // 내선
    if (toward.order === (station.order - 1 + n) % n) return "up"; // 외선
    return null;
  }
  if (!toward) return external ?? null;
  // "○○ 방면"의 ○○이 자기 자신인 행 존재 (강동: 지선 교차 환승, 종착 진입 열차) → 예외 맵으로
  if (toward.order === station.order) return external ?? null;
  return toward.order > station.order ? "down" : "up";
}

export function applyDoors(variantsByCsvLine: Map<string, VariantStations[]>): void {
  const rows = readCsvCp949(TRANSFER_CSV);
  const header = rows[0];
  const col = (name: string) => {
    const idx = header.findIndex((h) => h.trim() === name);
    if (idx < 0) throw new Error(`환승 데이터에 "${name}" 컬럼이 없습니다`);
    return idx;
  };
  const cStation = col("환승시작역");
  const cLine = col("환승시작 호선");
  const cToward = col("하차 열차 방면");
  const cCar = col("하차위치(호차)");
  const cDoor = col("하차위치(문)");
  const cDestLine = col("환승종료 호선");

  for (const row of rows.slice(1)) {
    const csvLine = `${row[cLine]?.trim()}호선`;
    const variants = variantsByCsvLine.get(csvLine);
    if (!variants) continue;

    for (const vs of variants) {
      const station = vs.byName.get(stripParen(row[cStation].trim()));
      if (!station) continue; // 이 변형에 없는 역 (지선 등)

      const dir = resolveDirection(vs, station, row[cToward]);
      if (!dir) {
        console.warn(
          `⚠ [${vs.variant.fileKey}] 방면 해석 불가, 건너뜀: "${row[cToward]}" (${station.name})`,
        );
        continue;
      }

      const car = Number(row[cCar]);
      const door = Number(row[cDoor]);
      if (!Number.isInteger(car) || !Number.isInteger(door)) {
        console.warn(`⚠ [${vs.variant.fileKey}] 호차/문 값 이상, 건너뜀: ${station.name}`);
        continue;
      }
      if (car > vs.def.carCount) {
        console.warn(
          `⚠ [${vs.variant.fileKey}] ${station.name} 호차 ${car} > 편성 ${vs.def.carCount}, 건너뜀`,
        );
        continue;
      }

      const destLine = lineLabel(row[cDestLine].trim());
      const hotspot: Hotspot = {
        car,
        door,
        kind: "transfer",
        // 같은 호선으로의 환승 = 지선 갈아타기 (5호선 강동)
        label: destLine === `${vs.def.key}호선` ? "지선 환승" : `${destLine} 환승`,
      };
      // 6호선 루프 구간은 단방향 운행 — 어느 방향 경로로 접근하든 같은 위치가 유효
      const isLoopStation =
        vs.variant.routeKind === "loop-tail" &&
        station.order <= (vs.variant.loopUntilOrder ?? -1);
      const dirs: Dir[] = isLoopStation ? ["up", "down"] : [dir];
      for (const d of dirs) {
        const list = station.hotspots[d];
        if (!list.some((h) => h.car === car && h.door === door && h.label === hotspot.label)) {
          list.push(hotspot);
        }
      }
    }
  }
}
