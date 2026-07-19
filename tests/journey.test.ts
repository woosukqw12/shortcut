import { describe, expect, it } from "vitest";
import { findEntry, planJourney } from "../src/core/journey";
import linesIndexRaw from "../src/data/lines.json";
import stationsIndexRaw from "../src/data/stations-index.json";
import {
  lineDataSchema,
  lineIndexSchema,
  stationsIndexSchema,
  type LineData,
} from "../src/data/schema";

const modules = import.meta.glob<{ default: unknown }>("../src/data/line[0-9]*.json", {
  eager: true,
});
const allVariants: LineData[] = Object.values(modules).map((m) =>
  lineDataSchema.parse(m.default),
);
const linesIndex = lineIndexSchema.parse(linesIndexRaw);
const stationsIndex = stationsIndexSchema.parse(stationsIndexRaw);

const variantsByLine = new Map(
  linesIndex.map((l) => [
    l.key,
    l.variants.map((fk) => allVariants.find((v) => v.line === fk.replace("line", ""))!),
  ]),
);

const plan = (originName: string, destName: string) => {
  const origin = findEntry(stationsIndex, originName)!;
  const dest = findEntry(stationsIndex, destName)!;
  return planJourney(origin, dest, stationsIndex, variantsByLine);
};

describe("전역 역 인덱스", () => {
  it("모든 노선 변형의 역이 인덱스에 있고 id가 일치한다", () => {
    for (const [key, variants] of variantsByLine) {
      for (const v of variants) {
        for (const s of v.stations) {
          const entry = findEntry(stationsIndex, s.name);
          expect(entry, `${v.line} ${s.name}`).not.toBeNull();
          expect(entry!.lines.find((l) => l.line === key)?.id, `${v.line} ${s.name}`).toBe(s.id);
        }
      }
    }
  });

  it("이수/총신대입구는 하나의 물리 역으로 합쳐진다", () => {
    const bySelf = findEntry(stationsIndex, "이수")!;
    const byAlias = findEntry(stationsIndex, "총신대입구")!;
    expect(byAlias).toBe(bySelf);
    expect(bySelf.lines.map((l) => l.line).sort()).toEqual(["4", "7"]);
  });
});

describe("planJourney", () => {
  it("같은 노선이면 직행 1구간: 상봉→논현 (7호선)", () => {
    const j = plan("상봉", "논현")!;
    expect(j.legs).toHaveLength(1);
    expect(j.legs[0].data.line).toBe("7");
    expect(j.legs[0].route.destination.name).toBe("논현");
  });

  it("직행이 가능하면 환승보다 우선: 노원(4·7호선)→고속터미널(3·7호선)은 7호선 직행", () => {
    const j = plan("노원", "고속터미널")!;
    expect(j.legs).toHaveLength(1);
    expect(j.legs[0].data.line).toBe("7");
    expect(j.totalStops).toBe(21);
  });

  it("1회 환승: 상봉→강남은 건대입구에서 2호선으로, 빠른환승 문 위치 포함", () => {
    const j = plan("상봉", "강남")!;
    expect(j.legs.map((l) => l.data.line)).toEqual(["7", "2"]);
    expect(j.legs[0].route.destination.name).toBe("건대입구");
    // 7호선 석남 방면(down) 기준 건대입구 2호선 환승 문 = 1-1
    expect(j.legs[0].transferFastDoor).toEqual({ car: 1, door: 1 });
    expect(j.legs[1].route.destination.name).toBe("강남");
    expect(j.totalStops).toBe(7 + 10);
  });

  it("별칭 환승역: 숙대입구(4호선)→남성(7호선)은 총신대입구/이수에서 갈아탄다", () => {
    const j = plan("숙대입구", "남성")!;
    expect(j.legs.map((l) => l.data.line)).toEqual(["4", "7"]);
    expect(j.legs[0].route.destination.name).toBe("총신대입구");
    expect(j.legs[1].route.origin.name).toBe("이수");
    // 4호선 총신대입구에는 7호선 환승 문 위치 데이터가 있다
    expect(j.legs[0].transferFastDoor).not.toBeNull();
  });

  it("5호선 본선↔마천지선은 강동 환승 여정으로 풀린다", () => {
    const j = plan("마천", "길동")!;
    expect(j.legs.map((l) => l.data.line)).toEqual(["5m", "5"]);
    expect(j.legs[0].route.destination.name).toBe("강동");
    expect(j.legs[1].route.origin.name).toBe("강동");
  });

  it("순환·환승 조합: 신도림(2호선)→여의도(5호선)는 영등포구청 환승이 최단", () => {
    const j = plan("신도림", "여의도")!;
    expect(j.legs.map((l) => l.data.line)).toEqual(["2", "5"]);
    expect(j.legs[0].route.destination.name).toBe("영등포구청");
  });

  it("환승 1회로 연결되지 않으면 null: 종각(1호선)→남위례(8호선)", () => {
    expect(plan("종각", "남위례")).toBeNull();
  });
});
