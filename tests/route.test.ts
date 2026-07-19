import { describe, expect, it } from "vitest";
import { directionLabel, resolveRoute } from "../src/core/route";
import { makeLineData, makeStation } from "./helpers";

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => makeStation({ id: `s${i}`, order: i }));

describe("resolveRoute — linear", () => {
  const data = makeLineData(mk(6));

  it("order가 커지는 방향은 down", () => {
    const route = resolveRoute("s1", "s4", data);
    expect(route.direction).toBe("down");
    expect(directionLabel(data, route.direction)).toBe("하행 방면");
    expect(route.totalStops).toBe(3);
  });

  it("중간 역은 출발·도착 제외, 탑승 방향 순서, stopsAway 1부터, dir 포함", () => {
    const route = resolveRoute("s1", "s4", data);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s2", "s3"]);
    expect(route.intermediates.map((r) => r.stopsAway)).toEqual([1, 2]);
    expect(route.intermediates.every((r) => r.dir === "down")).toBe(true);
  });

  it("상행에서도 중간 역이 탑승 방향 순서로 나온다", () => {
    const route = resolveRoute("s4", "s0", data);
    expect(route.direction).toBe("up");
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s3", "s2", "s1"]);
  });

  it("인접 역은 중간 역이 없다", () => {
    const route = resolveRoute("s2", "s3", data);
    expect(route.intermediates).toEqual([]);
    expect(route.totalStops).toBe(1);
  });

  it("출발역과 도착역이 같으면 에러", () => {
    expect(() => resolveRoute("s2", "s2", data)).toThrow();
  });
});

describe("resolveRoute — circular (2호선)", () => {
  // 6개 역 순환: s0..s5, down = 내선(순서 증가)
  const data = makeLineData(mk(6), { routeKind: "circular" });

  it("랩어라운드: 마지막 역 → 첫 역은 down 1정거장", () => {
    const route = resolveRoute("s5", "s0", data);
    expect(route.direction).toBe("down");
    expect(route.totalStops).toBe(1);
    expect(route.intermediates).toEqual([]);
  });

  it("짧은 호를 선택한다 (s0→s4는 외선 2정거장)", () => {
    const route = resolveRoute("s0", "s4", data);
    expect(route.direction).toBe("up");
    expect(route.totalStops).toBe(2);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s5"]);
  });

  it("내선 경로가 랩을 넘어 이어진다", () => {
    const route = resolveRoute("s4", "s1", data);
    expect(route.direction).toBe("down");
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s5", "s0"]);
  });
});

describe("resolveRoute — loop-tail (6호선 응암 루프)", () => {
  // s0(응암)~s5(구산) 루프 + s6(새절)~s9 꼬리
  const data = makeLineData(mk(10), { routeKind: "loop-tail", loopUntilOrder: 5 });

  it("꼬리 내부는 일반 직선", () => {
    const route = resolveRoute("s6", "s9", data);
    expect(route.direction).toBe("down");
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s7", "s8"]);
  });

  it("꼬리 → 루프: 분기역(s0)까지 올라간 뒤 루프를 실운행 방향으로", () => {
    // 합정→독바위 시나리오: s8 → s3
    const route = resolveRoute("s8", "s3", data);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s7", "s6", "s0", "s1", "s2"]);
    // 꼬리 구간은 up, 루프 구간은 down(실운행 방향)
    expect(route.intermediates.map((r) => r.dir)).toEqual(["up", "up", "down", "down", "down"]);
    expect(route.totalStops).toBe(6);
  });

  it("루프 → 꼬리: 루프를 마저 돌아 분기역을 거쳐 꼬리로", () => {
    // 독바위→새절 다음역: s3 → s7
    const route = resolveRoute("s3", "s7", data);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s4", "s5", "s0", "s6"]);
    expect(route.intermediates.every((r) => r.dir === "down")).toBe(true);
  });

  it("분기역(응암) → 꼬리는 루프를 돌지 않는다", () => {
    const route = resolveRoute("s0", "s8", data);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s6", "s7"]);
  });

  it("루프 내부는 항상 전진 (역방향은 분기역을 지나 랩)", () => {
    const route = resolveRoute("s4", "s2", data);
    expect(route.intermediates.map((r) => r.station.id)).toEqual(["s5", "s0", "s1"]);
    expect(route.totalStops).toBe(4);
  });
});
