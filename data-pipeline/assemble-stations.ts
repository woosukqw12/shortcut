/**
 * 승하차 CSV에서 추출한 (역번호 → 역) 목록을 노선 정의(line-defs)의 예외 규칙과
 * 합쳐 노선 변형별 역 배열을 만든다. 역번호 오름차순 = 노선 순서라는 성질을
 * 기본으로 쓰고, moveAfter/insert/exclude로 예외를 처리한다.
 */
import type { Station } from "../src/data/schema";
import type { LineDef, VariantDef } from "./line-defs";
import type { CongestionResult } from "./parse-congestion";
import type { RidershipResult } from "./parse-ridership";

export interface VariantStations {
  def: LineDef;
  variant: VariantDef;
  stations: Station[];
  /** 역명(원천 표기·별칭·괄호 제거형) → station */
  byName: Map<string, Station>;
}

export function stripParen(name: string): string {
  return name.replace(/\(.*\)$/, "").trim();
}

export function assembleVariant(
  def: LineDef,
  variant: VariantDef,
  ridership: RidershipResult,
  congestion: CongestionResult,
): VariantStations {
  interface Draft {
    id: string;
    name: string;
    aliases: string[];
    alightByHour: { weekday: number[]; weekend: number[] } | null;
  }

  // 1) CSV에서 이 변형의 역번호 범위에 드는 역 추출, 역번호 오름차순
  const drafts: Draft[] = [];
  for (const entry of ridership.byLineCode.values()) {
    if (entry.csvLine !== def.csvName) continue;
    const codeNum = Number(entry.code);
    const inRange = variant.codeRanges.some(([from, to]) => codeNum >= from && codeNum <= to);
    if (!inRange || variant.exclude?.includes(entry.code)) continue;
    const canonical = def.rename?.[entry.code] ?? stripParen(entry.names[0]);
    const aliases = [
      ...new Set(
        entry.names.flatMap((n) => [n, stripParen(n)]).filter((n) => n !== canonical),
      ),
    ];
    drafts.push({ id: entry.code, name: canonical, aliases, alightByHour: entry.alightByHour });
  }
  drafts.sort((a, b) => Number(a.id) - Number(b.id));

  // 2) 코드 순서 ≠ 실제 순서인 역 이동
  for (const { code, afterCode } of variant.moveAfter ?? []) {
    const idx = drafts.findIndex((d) => d.id === code);
    if (idx < 0) throw new Error(`${variant.fileKey}: moveAfter 대상 역번호 없음: ${code}`);
    const [item] = drafts.splice(idx, 1);
    const at = drafts.findIndex((d) => d.id === afterCode);
    if (at < 0) throw new Error(`${variant.fileKey}: moveAfter 기준 역번호 없음: ${afterCode}`);
    drafts.splice(at + 1, 0, item);
  }

  // 3) CSV에 없는 역 삽입 (공용 게이트 환승역·타 운영사 구간)
  for (const ins of variant.insert ?? []) {
    let alight: { weekday: number[]; weekend: number[] } | null = null;
    if (ins.borrowRidership) {
      const src = ridership.byLineCode.get(
        `${ins.borrowRidership.csvLine}|${ins.borrowRidership.code}`,
      );
      if (!src) {
        throw new Error(`${variant.fileKey}: ${ins.name}의 borrowRidership 원본이 없습니다`);
      }
      alight = src.alightByHour;
    }
    const draft: Draft = {
      id: ins.id,
      name: ins.name,
      aliases: ins.aliases?.map(stripParen).concat(ins.aliases) ?? [],
      alightByHour: alight,
    };
    if (ins.afterCode === null) {
      drafts.unshift(draft);
    } else if (ins.afterCode === "LAST") {
      drafts.push(draft);
    } else {
      const at = drafts.findIndex((d) => d.id === ins.afterCode);
      if (at < 0) throw new Error(`${variant.fileKey}: insert 기준 역번호 없음: ${ins.afterCode}`);
      drafts.splice(at + 1, 0, draft);
    }
  }

  const zeros = () => ({ weekday: new Array(20).fill(0), weekend: new Array(20).fill(0) });
  const congestionOf = (id: string, dir: "up" | "down") => {
    const weekday = congestion.byKey.get(`${def.csvName}|${id}|${dir}|weekday`);
    const weekend = congestion.byKey.get(`${def.csvName}|${id}|${dir}|weekend`);
    return weekday && weekend ? { weekday, weekend } : null;
  };
  const stations: Station[] = drafts.map((d, order) => ({
    id: d.id,
    name: d.name,
    order,
    alightByHour: d.alightByHour ?? zeros(),
    hasRidership: d.alightByHour !== null,
    congestion: { up: congestionOf(d.id, "up"), down: congestionOf(d.id, "down") },
    hotspots: { up: [], down: [] },
  }));

  const byName = new Map<string, Station>();
  drafts.forEach((d, i) => {
    for (const n of [d.name, ...d.aliases]) {
      byName.set(n, stations[i]);
      byName.set(stripParen(n), stations[i]);
    }
  });

  return { def, variant, stations, byName };
}
