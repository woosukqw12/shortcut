import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/core/route";
import { scoreRoute } from "../src/core/scoring";
import { TIME_SLOTS } from "../src/core/timeslot";
import linesIndexRaw from "../src/data/lines.json";
import { lineDataSchema, lineIndexSchema, type LineData } from "../src/data/schema";

const modules = import.meta.glob<{ default: unknown }>("../src/data/line[0-9]*.json", {
  eager: true,
});
const allLines: LineData[] = Object.values(modules).map((m) => lineDataSchema.parse(m.default));
const byKey = new Map(allLines.map((d) => [d.line, d]));

describe("생성된 노선 데이터", () => {
  it("인덱스의 모든 변형 파일이 존재하고 스키마를 통과한다", () => {
    const index = lineIndexSchema.parse(linesIndexRaw);
    expect(index).toHaveLength(8);
    const fileKeys = new Set(
      Object.keys(modules).map((p) => p.match(/(line[0-9a-z]+)\.json$/)![1]),
    );
    for (const entry of index) {
      for (const v of entry.variants) expect(fileKeys.has(v), v).toBe(true);
    }
    expect(allLines).toHaveLength(9); // 8개 노선 + 5호선 마천행
  });

  it("모든 변형: order 0..N-1 유일, hotspot 칸/문이 편성 범위 안", () => {
    for (const data of allLines) {
      const orders = data.stations.map((s) => s.order).sort((a, b) => a - b);
      expect(orders, data.line).toEqual(Array.from({ length: data.stations.length }, (_, i) => i));
      for (const s of data.stations) {
        for (const h of [...s.hotspots.up, ...s.hotspots.down]) {
          expect(h.car, `${data.line} ${s.name}`).toBeLessThanOrEqual(data.carCount);
          expect(h.door, `${data.line} ${s.name}`).toBeLessThanOrEqual(data.doorsPerCar);
        }
      }
    }
  });

  it("주요 사실 검증: 역 수·편성·형태", () => {
    expect(byKey.get("7")!.stations).toHaveLength(53);
    expect(byKey.get("2")!.stations).toHaveLength(43);
    expect(byKey.get("2")!.routeKind).toBe("circular");
    expect(byKey.get("6")!.routeKind).toBe("loop-tail");
    expect(byKey.get("8")!.carCount).toBe(6);
    expect(byKey.get("1")!.carCount).toBe(10);
  });

  it("순서 예외가 반영됐다: 1호선 동묘앞, 8호선 남위례", () => {
    const line1 = byKey.get("1")!;
    const names1 = line1.stations.map((s) => s.name);
    expect(names1.indexOf("동묘앞")).toBe(names1.indexOf("동대문") + 1);
    expect(names1.indexOf("신설동")).toBe(names1.indexOf("동묘앞") + 1);
    const line8 = byKey.get("8")!;
    const names8 = line8.stations.map((s) => s.name);
    expect(names8.indexOf("남위례")).toBe(names8.indexOf("복정") + 1);
    expect(names8.indexOf("산성")).toBe(names8.indexOf("남위례") + 1);
  });

  it("공용 게이트 환승역은 통계를 빌려온다: 3호선 충무로, 6호선 연신내", () => {
    const chungmuro = byKey.get("3")!.stations.find((s) => s.name === "충무로")!;
    expect(chungmuro.hasRidership).toBe(true);
    expect(chungmuro.alightByHour.weekday.some((v) => v > 0)).toBe(true);
    const yeonsinnae = byKey.get("6")!.stations.find((s) => s.name === "연신내")!;
    expect(yeonsinnae.hasRidership).toBe(true);
    // 혼잡도는 자체 행이 있다 (게이트 공유와 무관)
    expect(chungmuro.congestion.down).not.toBeNull();
    expect(yeonsinnae.congestion.down).not.toBeNull();
  });

  it("실데이터 스모크: 노원→고속터미널(7호선) 출근 스냅샷", () => {
    const data = byKey.get("7")!;
    const nowon = data.stations.find((s) => s.name === "노원")!;
    const terminal = data.stations.find((s) => s.name === "고속터미널")!;
    const route = resolveRoute(nowon.id, terminal.id, data);
    expect(route.direction).toBe("down");
    const result = scoreRoute(route, TIME_SLOTS[0], data);
    const rec = result.recommendation!;
    expect({
      position: rec.positionLabel,
      seatProb: Math.round(rec.seatProb * 100) / 100,
      expSeatedStops: Math.round(rec.expSeatedStops * 10) / 10,
      top3cars: result.cars
        .filter((c) => c.rank <= 3)
        .sort((a, b) => a.rank - b.rank)
        .map((c) => c.car),
    }).toMatchSnapshot();
  });

  it("실데이터 스모크: 2호선 신도림→시청은 순환 짧은 쪽을 타고 추천이 나온다", () => {
    const data = byKey.get("2")!;
    const sindorim = data.stations.find((s) => s.name === "신도림")!;
    const cityhall = data.stations.find((s) => s.name === "시청")!;
    const route = resolveRoute(sindorim.id, cityhall.id, data);
    expect(route.totalStops).toBeLessThan(data.stations.length / 2);
    const result = scoreRoute(route, TIME_SLOTS[0], data);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.seatProb).toBeGreaterThan(0);
  });

  it("실데이터 스모크: 6호선 합정→독바위는 응암을 거쳐 루프 순서로 간다", () => {
    const data = byKey.get("6")!;
    const hapjeong = data.stations.find((s) => s.name === "합정")!;
    const dokbawi = data.stations.find((s) => s.name === "독바위")!;
    const route = resolveRoute(hapjeong.id, dokbawi.id, data);
    const names = route.intermediates.map((r) => r.station.name);
    expect(names).toContain("응암");
    expect(names.indexOf("역촌")).toBeGreaterThan(names.indexOf("응암"));
    const result = scoreRoute(route, TIME_SLOTS[2], data);
    expect(result.recommendation).not.toBeNull();
  });
});
