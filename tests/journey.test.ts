import { describe, expect, it } from "vitest";
import {
  TRANSFER_PENALTY_STOPS,
  TRANSFER_WAIT_STOPS,
  findEntry,
  planJourney,
  transferPenaltyStops,
} from "../src/core/journey";
import linesIndexRaw from "../src/data/lines.json";
import stationsIndexRaw from "../src/data/stations-index.json";
import transfersRaw from "../src/data/transfers.json";
import {
  lineDataSchema,
  lineIndexSchema,
  stationsIndexSchema,
  transfersSchema,
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
const transfers = transfersSchema.parse(transfersRaw);

const variantsByLine = new Map(
  linesIndex.map((l) => [
    l.key,
    l.variants.map((fk) => allVariants.find((v) => v.line === fk.replace("line", ""))!),
  ]),
);

const plan = (originName: string, destName: string) => {
  const origin = findEntry(stationsIndex, originName)!;
  const dest = findEntry(stationsIndex, destName)!;
  return planJourney(origin, dest, stationsIndex, variantsByLine, transfers);
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

describe("환승 실측화", () => {
  it("페널티: 실측 도보 시간이 있으면 초/120 + 대기, 없으면 폴백 3", () => {
    expect(transferPenaltyStops(undefined)).toBe(TRANSFER_PENALTY_STOPS);
    expect(
      transferPenaltyStops({ from: "7", stationId: "x", to: "2", walkSeconds: null, board: {} }),
    ).toBe(TRANSFER_PENALTY_STOPS);
    expect(
      transferPenaltyStops({ from: "7", stationId: "x", to: "2", walkSeconds: 600, board: {} }),
    ).toBe(600 / 120 + TRANSFER_WAIT_STOPS);
  });

  it("상봉→강남: 건대입구 환승에 실측 도보 시간과 환승 후 승차위치가 붙는다", () => {
    const j = plan("상봉", "강남")!;
    expect(j.legs[0].route.destination.name).toBe("건대입구");
    expect(j.legs[0].transferWalkSeconds).toBe(152);
    // 2호선 내선(도착 방향) 기준 환승 통로 앞 위치
    expect(j.legs[0].transferBoardPos).toEqual({ car: 3, door: 2 });
    expect(j.legs[1].transferWalkSeconds).toBeNull();
  });

  it("transfers.json 무결성: 노선 키와 역 id가 실제 데이터를 가리킨다", () => {
    for (const t of transfers) {
      for (const key of [t.from, t.to]) {
        expect(variantsByLine.has(key), `노선 ${key}`).toBe(true);
      }
      const onLine = variantsByLine
        .get(t.from)!
        .some((v) => v.stations.some((s) => s.id === t.stationId));
      expect(onLine, `${t.from}호선 ${t.stationId}`).toBe(true);
      for (const dir of ["up", "down"] as const) {
        const pos = t.board[dir];
        if (!pos) continue;
        const carCount = variantsByLine.get(t.to)![0].carCount;
        expect(pos.car, `${t.from}→${t.to} ${t.stationId}`).toBeLessThanOrEqual(carCount);
      }
    }
  });
});
