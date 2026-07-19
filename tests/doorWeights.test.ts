import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, doorIndex, doorWeightVector } from "../src/core/doorWeights";
import { hotspot, makeLineData, makeStation } from "./helpers";

const sum = (v: Float64Array) => v.reduce((a, b) => a + b, 0);

describe("doorWeightVector", () => {
  const data = makeLineData([makeStation({ id: "s0", order: 0 })]);

  it("hotspot이 없으면 정확히 균등 분포", () => {
    const st = makeStation({ id: "a", order: 0 });
    const w = doorWeightVector(st, "down", data);
    expect(sum(w)).toBeCloseTo(1, 9);
    for (const v of w) expect(v).toBeCloseTo(1 / 32, 12);
  });

  it("hotspot이 있으면 합=1이고 피크가 hotspot 문 인덱스에 위치", () => {
    const st = makeStation({ id: "a", order: 0, hotspots: { up: [], down: [hotspot(3, 2)] } });
    const w = doorWeightVector(st, "down", data);
    expect(sum(w)).toBeCloseTo(1, 9);
    const peak = w.indexOf(Math.max(...w));
    expect(peak).toBe(doorIndex(3, 2, 4));
  });

  it("hotspot 방향이 다르면 균등 분포", () => {
    const st = makeStation({ id: "a", order: 0, hotspots: { up: [hotspot(3, 2)], down: [] } });
    const w = doorWeightVector(st, "down", data);
    for (const v of w) expect(v).toBeCloseTo(1 / 32, 12);
  });

  it("hotspot 두 개면 두 위치 모두 균등보다 높은 이봉 분포", () => {
    const st = makeStation({
      id: "a",
      order: 0,
      hotspots: { up: [], down: [hotspot(2, 1), hotspot(7, 4)] },
    });
    const w = doorWeightVector(st, "down", data);
    expect(sum(w)).toBeCloseTo(1, 9);
    expect(w[doorIndex(2, 1, 4)]).toBeGreaterThan(1 / 32);
    expect(w[doorIndex(7, 4, 4)]).toBeGreaterThan(1 / 32);
    // 두 hotspot에서 먼 중앙부는 균등보다 낮아야 함
    expect(w[doorIndex(5, 1, 4)]).toBeLessThan(1 / 32);
  });

  it("lambda=0이면 hotspot이 있어도 균등 분포", () => {
    const st = makeStation({ id: "a", order: 0, hotspots: { up: [], down: [hotspot(3, 2)] } });
    const w = doorWeightVector(st, "down", data, { ...DEFAULT_PARAMS, lambda: 0 });
    for (const v of w) expect(v).toBeCloseTo(1 / 32, 12);
  });

  it("carCount를 넘는 hotspot(타 노선 편성 기준)은 무시", () => {
    const st = makeStation({ id: "a", order: 0, hotspots: { up: [], down: [hotspot(10, 1)] } });
    const w = doorWeightVector(st, "down", data);
    for (const v of w) expect(v).toBeCloseTo(1 / 32, 12);
  });
});
