/**
 * OA-22521 환승 데이터에서 hotspot(parse-doors)이 쓰고 남긴 두 컬럼을 추출한다:
 *  - 소요시간: 환승 도보 실측 (mm:ss) → 노선쌍·역별 환승 페널티의 근거
 *  - 환승 승차위치(호차/문): 환승 통로에서 나오면 서게 되는 다음 노선의 위치
 *    (방면에 따라 좌표가 뒤집히므로 대상 노선 방향별로 저장)
 * 1~8호선 간(지선 포함) 링크만 남긴다. 방면 해석은 parse-doors와 같은 로직.
 */
import type { TransferLink } from "../src/data/schema";
import type { VariantStations } from "./assemble-stations";
import { stripParen } from "./assemble-stations";
import { readCsvCp949 } from "./csv";
import { TRANSFER_CSV, resolveDirection } from "./parse-doors";

/** "10:00" / "1:30" (mm:ss) → 초. 형식이 다르면 null */
function parseWalkSeconds(raw: string): number | null {
  const m = raw.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function buildTransfers(
  variantsByCsvLine: Map<string, VariantStations[]>,
): TransferLink[] {
  const rows = readCsvCp949(TRANSFER_CSV);
  const header = rows[0];
  const col = (name: string) => {
    const idx = header.findIndex((h) => h.trim() === name);
    if (idx < 0) throw new Error(`환승 데이터에 "${name}" 컬럼이 없습니다`);
    return idx;
  };
  const cStation = col("환승시작역");
  const cLine = col("환승시작 호선");
  const cDestStation = col("환승종료역");
  const cDestLine = col("환승종료 호선");
  const cDestToward = col("환승 열차 방면");
  const cBoardCar = col("환승 승차위치(호차)");
  const cBoardDoor = col("환승 승차위치(문)");
  const cWalk = col("소요시간");

  interface Agg {
    from: string;
    stationId: string;
    to: string;
    walkSum: number;
    walkCount: number;
    board: { up?: { car: number; door: number }; down?: { car: number; door: number } };
  }
  const byKey = new Map<string, Agg>();

  for (const row of rows.slice(1)) {
    const fromRaw = row[cLine]?.trim();
    const toRaw = row[cDestLine]?.trim();
    if (!/^[1-8]$/.test(fromRaw) || !/^[1-8]$/.test(toRaw)) continue;

    const fromVariants = variantsByCsvLine.get(`${fromRaw}호선`);
    const toVariants = variantsByCsvLine.get(`${toRaw}호선`);
    if (!fromVariants || !toVariants) continue;

    // 출발 노선의 역 id (변형끼리 id 공유 — 아무 변형에서나 찾으면 된다)
    const fromStation = fromVariants
      .map((vs) => vs.byName.get(stripParen(row[cStation].trim())))
      .find((s) => s !== undefined);
    if (!fromStation) continue;

    const key = `${fromRaw}|${fromStation.id}|${toRaw}`;
    let agg = byKey.get(key);
    if (!agg) {
      agg = { from: fromRaw, stationId: fromStation.id, to: toRaw, walkSum: 0, walkCount: 0, board: {} };
      byKey.set(key, agg);
    }

    const walk = parseWalkSeconds(row[cWalk] ?? "");
    if (walk !== null && walk > 0) {
      agg.walkSum += walk;
      agg.walkCount++;
    }

    // 환승 후 승차위치 — 대상 노선의 방면을 해석해 방향별로 저장
    const car = Number(row[cBoardCar]);
    const door = Number(row[cBoardDoor]);
    if (!Number.isInteger(car) || !Number.isInteger(door) || car < 1 || door < 1) continue;
    for (const vs of toVariants) {
      if (car > vs.def.carCount) break; // 편성 밖 값은 전 변형 공통으로 무효
      const toStation = vs.byName.get(stripParen(row[cDestStation].trim()));
      if (!toStation) continue;
      const dir = resolveDirection(vs, toStation, row[cDestToward] ?? "");
      if (!dir) continue; // 해석 불가 방면은 조용히 건너뜀 (hotspot 쪽에서 이미 경고함)
      // 루프 구간(6호선)은 단방향 — 양방향에 같은 위치 저장
      const isLoop =
        vs.variant.routeKind === "loop-tail" &&
        toStation.order <= (vs.variant.loopUntilOrder ?? -1);
      for (const d of isLoop ? (["up", "down"] as const) : ([dir] as const)) {
        agg.board[d] ??= { car, door };
      }
    }
  }

  return [...byKey.values()]
    .filter((a) => a.walkCount > 0 || a.board.up || a.board.down)
    .map((a) => ({
      from: a.from,
      stationId: a.stationId,
      to: a.to,
      walkSeconds: a.walkCount > 0 ? Math.round(a.walkSum / a.walkCount) : null,
      board: a.board,
    }))
    .sort((x, y) => `${x.from}|${x.stationId}|${x.to}`.localeCompare(`${y.from}|${y.stationId}|${y.to}`));
}
