/**
 * 원천 데이터 → src/data/line*.json + lines.json (1~8호선)
 * 실행: npm run data:build  (원천 파일이 없으면 먼저 npx tsx data-pipeline/fetch.ts)
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lineDataSchema,
  lineIndexSchema,
  stationsIndexSchema,
  type LineData,
  type LineIndex,
  type StationsIndex,
} from "../src/data/schema";
import { assembleVariant, type VariantStations } from "./assemble-stations";
import { LINE_DEFS } from "./line-defs";
import { parseCongestion } from "./parse-congestion";
import { applyDoors } from "./parse-doors";
import { parseRidership } from "./parse-ridership";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

const ridership = parseRidership();
const congestion = parseCongestion();

// 노선 변형별 역 목록 조립
const allVariants: VariantStations[] = [];
const variantsByCsvLine = new Map<string, VariantStations[]>();
for (const def of LINE_DEFS) {
  for (const variant of def.variants) {
    const vs = assembleVariant(def, variant, ridership, congestion);
    allVariants.push(vs);
    const list = variantsByCsvLine.get(def.csvName) ?? [];
    list.push(vs);
    variantsByCsvLine.set(def.csvName, list);
  }
}

// 검증: CSV의 1~8호선 역이 어떤 변형에도 안 들어가면 실수일 가능성 — 지선 제외만 허용
const covered = new Set(
  allVariants.flatMap((vs) => vs.stations.map((s) => `${vs.def.csvName}|${s.id}`)),
);
const KNOWN_EXCLUDED = new Set([
  // 2호선 성수지선·신정지선 (본선 순환만 지원)
  "2호선|244", "2호선|245", "2호선|246", "2호선|247", "2호선|248", "2호선|249", "2호선|250",
]);
for (const entry of ridership.byLineCode.values()) {
  const key = `${entry.csvLine}|${entry.code}`;
  if (!covered.has(key) && !KNOWN_EXCLUDED.has(key)) {
    throw new Error(`승하차 데이터의 역이 어떤 노선 변형에도 없습니다: ${key} ${entry.names[0]}`);
  }
}

// 환승 hotspot 채우기
applyDoors(variantsByCsvLine);

// 노선 변형별 JSON 출력
const generatedAt = new Date().toISOString().slice(0, 10);
for (const vs of allVariants) {
  const data: LineData = {
    line: vs.variant.line,
    lineName: vs.variant.lineName,
    lineColor: vs.def.color,
    routeKind: vs.variant.routeKind,
    directionLabels: vs.variant.directionLabels,
    ...(vs.variant.loopUntilOrder !== undefined && { loopUntilOrder: vs.variant.loopUntilOrder }),
    carCount: vs.def.carCount,
    doorsPerCar: 4,
    generatedAt,
    sources: {
      ridership: `서울교통공사 역별 일별 시간대별 승하차인원 (OA-12921, ${ridership.dateRange.from}~${ridership.dateRange.to})`,
      transfer: "서울교통공사 수도권 도시철도 환승 데이터 (OA-22521, 2025-03-17)",
      congestion: "서울교통공사 지하철혼잡도정보 (OA-12928, 2025-11-30)",
    },
    stations: vs.stations,
  };
  const validated = lineDataSchema.parse(data);
  writeFileSync(join(OUT_DIR, `${vs.variant.fileKey}.json`), JSON.stringify(validated) + "\n");

  const withRidership = validated.stations.filter((s) => s.hasRidership).length;
  const withHotspots = validated.stations.filter(
    (s) => s.hotspots.up.length + s.hotspots.down.length > 0,
  ).length;
  const withCongestion = validated.stations.filter(
    (s) => s.congestion.up !== null || s.congestion.down !== null,
  ).length;
  console.log(
    `✓ ${vs.variant.fileKey}.json — ${validated.lineName} 역 ${validated.stations.length}개` +
      ` (승하차 ${withRidership}, hotspot ${withHotspots}, 혼잡도 ${withCongestion})`,
  );
}

// 전역 역 인덱스 — 물리 역 이름으로 노선들을 합친다 (환승 경로 탐색·전역 역 검색용).
// 물리적으로 같은 역인데 노선 간 이름이 다른 경우만 별칭으로 통일한다.
const STATION_ALIASES: Record<string, string> = { 총신대입구: "이수" };
const canonicalName = (name: string) => STATION_ALIASES[name] ?? name;

const entryByName = new Map<
  string,
  { name: string; aliases: Set<string>; lines: Map<string, { line: string; id: string; name: string }> }
>();
for (const def of LINE_DEFS) {
  for (const vs of allVariants.filter((v) => v.def === def)) {
    for (const s of vs.stations) {
      const key = canonicalName(s.name);
      let entry = entryByName.get(key);
      if (!entry) {
        entry = { name: key, aliases: new Set(), lines: new Map() };
        entryByName.set(key, entry);
      }
      if (s.name !== key) entry.aliases.add(s.name);
      // 같은 노선의 변형(5호선 본선/마천행)이 공유하는 역은 id가 같다
      if (!entry.lines.has(def.key)) entry.lines.set(def.key, { line: def.key, id: s.id, name: s.name });
    }
  }
}
const stationsIndex: StationsIndex = [...entryByName.values()]
  .map((e) => ({
    name: e.name,
    ...(e.aliases.size > 0 && { aliases: [...e.aliases] }),
    lines: [...e.lines.values()],
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));
writeFileSync(
  join(OUT_DIR, "stations-index.json"),
  JSON.stringify(stationsIndexSchema.parse(stationsIndex)) + "\n",
);
const transferCount = stationsIndex.filter((e) => e.lines.length > 1).length;
console.log(`✓ stations-index.json — 물리 역 ${stationsIndex.length}개 (복수 노선 ${transferCount})`);

// 노선 선택 인덱스
const index: LineIndex = LINE_DEFS.map((def) => ({
  key: def.key,
  name: def.name,
  color: def.color,
  variants: def.variants.map((v) => v.fileKey),
}));
writeFileSync(join(OUT_DIR, "lines.json"), JSON.stringify(lineIndexSchema.parse(index), null, 1) + "\n");
console.log(`✓ lines.json — ${index.length}개 노선`);
