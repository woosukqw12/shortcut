import { describe, expect, it } from "vitest";
import { resolveRoute } from "../src/core/route";
import { scoreRoute } from "../src/core/scoring";
import { TIME_SLOTS, hourSlot } from "../src/core/timeslot";
import { flatAlight, flatBoard, flatCongestion, hotspot, makeLineData, makeStation } from "./helpers";

const AM = TIME_SLOTS[0];

describe("혼잡도 보정", () => {
  it("방향 비율: 반대 방향 혼잡도가 높을수록 내 방향 하차 몫이 줄어든다", () => {
    // 내 방향(down) 혼잡도는 고정해 경쟁 상수를 동일하게 두고, 반대 방향만 바꾼다
    const build = (upCong: number) =>
      makeLineData([
        makeStation({ id: "o", order: 0 }),
        makeStation({
          id: "s",
          order: 1,
          alightByHour: flatAlight(500),
          congestion: { up: flatCongestion(upCong), down: flatCongestion(50) },
          hotspots: { up: [], down: [hotspot(3, 2)] },
        }),
        makeStation({ id: "d", order: 2 }),
      ]);
    const shareHigh = scoreRoute(resolveRoute("o", "d", build(20)), AM, build(20)); // 내 몫 0.71
    const shareLow = scoreRoute(resolveRoute("o", "d", build(150)), AM, build(150)); // 내 몫 0.25
    expect(shareHigh.recommendation!.seatProb).toBeGreaterThan(
      shareLow.recommendation!.seatProb,
    );
  });

  it("경쟁 상수: 혼잡도가 높을수록(입석 多) 같은 하차 인원에서 앉을 확률이 낮다", () => {
    const build = (cong: number) =>
      makeLineData([
        makeStation({ id: "o", order: 0 }),
        makeStation({
          id: "s",
          order: 1,
          alightByHour: flatAlight(500),
          // 양방향 동일 혼잡 → 방향 비율은 0.5로 같고 경쟁 상수만 달라진다
          congestion: { up: flatCongestion(cong), down: flatCongestion(cong) },
          hotspots: { up: [], down: [hotspot(3, 2)] },
        }),
        makeStation({ id: "d", order: 2 }),
      ]);
    const calm = scoreRoute(resolveRoute("o", "d", build(34)), AM, build(34)); // 좌석만 만석
    const packed = scoreRoute(resolveRoute("o", "d", build(150)), AM, build(150)); // 극혼잡
    expect(calm.recommendation!.seatProb).toBeGreaterThan(packed.recommendation!.seatProb);
  });

  it("혼잡도 데이터가 없으면 폴백 상수로 동작한다 (기존과 동일)", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: flatAlight(500),
        hotspots: { up: [], down: [hotspot(3, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.car).toBe(3);
  });
});

describe("α 선호 가중", () => {
  // 가까운 역(2정거장 남음)에 강한 hotspot vs 먼 여정 내내 얕게 앉을 기회가 있는 칸 —
  // α가 크면 "확률" 우선, 작으면 "기대 착석" 우선으로 순위가 달라질 수 있다
  it("α=1은 seatProb 순, α=0은 expSeatedStops 순으로 랭크한다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "near",
        order: 1,
        alightByHour: flatAlight(80),
        hotspots: { up: [], down: [hotspot(2, 2)] },
      }),
      makeStation({
        id: "far",
        order: 4,
        alightByHour: flatAlight(3000),
        hotspots: { up: [], down: [hotspot(7, 3)] },
      }),
      makeStation({ id: "m2", order: 2 }),
      makeStation({ id: "m3", order: 3 }),
      makeStation({ id: "d", order: 5 }),
    ]);
    const route = resolveRoute("o", "d", data);
    const probFirst = scoreRoute(route, AM, data, { alpha: 1 });
    const seatedFirst = scoreRoute(route, AM, data, { alpha: 0 });

    const bestBy = (r: typeof probFirst) => r.cars.find((c) => c.rank === 1)!;
    // α=1: 확률이 압도적인 far(7번 칸) / α=0: 일찍 앉는 near(2번 칸)와 비교해
    // 랭킹 기준이 각 지표와 일치하는지만 확인 (구체 칸은 데이터에 따름)
    const p = bestBy(probFirst);
    for (const c of probFirst.cars) expect(p.seatProb).toBeGreaterThanOrEqual(c.seatProb - 1e-9);
    const s = bestBy(seatedFirst);
    for (const c of seatedFirst.cars) {
      expect(s.expSeatedStops).toBeGreaterThanOrEqual(c.expSeatedStops - 1e-9);
    }
  });
});

describe("scoreRoute (확률 모델)", () => {
  it("하차 인원이 많은 역의 hotspot 칸이 1위가 된다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "big",
        order: 1,
        alightByHour: flatAlight(10000),
        hotspots: { up: [], down: [hotspot(6, 3, "환승")] },
      }),
      makeStation({
        id: "small",
        order: 2,
        alightByHour: flatAlight(10),
        hotspots: { up: [], down: [hotspot(1, 1, "출구")] },
      }),
      makeStation({ id: "d", order: 3 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.car).toBe(6);
    expect(result.recommendation!.positionLabel).toBe("6-3");
  });

  it("seatProb는 0~1, expSeatedStops는 최대 (totalStops−1)을 넘지 않는다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s1",
        order: 1,
        alightByHour: flatAlight(999999),
        hotspots: { up: [], down: [hotspot(4, 2)] },
      }),
      makeStation({ id: "s2", order: 2, alightByHour: flatAlight(999999) }),
      makeStation({ id: "d", order: 3 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    for (const d of result.doors) {
      expect(d.seatProb).toBeGreaterThanOrEqual(0);
      expect(d.seatProb).toBeLessThanOrEqual(1 + 1e-9);
      expect(d.expSeatedStops).toBeLessThanOrEqual(result.totalStops - 1 + 1e-9);
    }
    // 하차가 압도적이면 첫 중간 역에서 거의 확실히 앉는다
    expect(result.recommendation!.seatProb).toBeGreaterThan(0.99);
    expect(result.recommendation!.expSeatedStops).toBeGreaterThan(1.9);
  });

  it("단조성: 하차 인원을 늘리면 해당 문의 seatProb와 기대 착석이 오른다", () => {
    const build = (alight: number) =>
      makeLineData([
        makeStation({ id: "o", order: 0 }),
        makeStation({
          id: "s",
          order: 1,
          alightByHour: flatAlight(alight),
          hotspots: { up: [], down: [hotspot(6, 3)] },
        }),
        makeStation({ id: "d", order: 3 }),
        makeStation({ id: "mid", order: 2, alightByHour: flatAlight(100) }),
      ]);
    const lo = scoreRoute(resolveRoute("o", "d", build(50)), AM, build(50));
    const hi = scoreRoute(resolveRoute("o", "d", build(5000)), AM, build(5000));
    const car6 = (r: typeof lo) => r.cars.find((c) => c.car === 6)!;
    expect(car6(hi).seatProb).toBeGreaterThan(car6(lo).seatProb);
    expect(car6(hi).expSeatedStops).toBeGreaterThan(car6(lo).expSeatedStops);
  });

  it("오래 앉기: 하차 인원이 같으면 가까운 역의 hotspot 칸이 우세 (남은 정거장이 많음)", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "near",
        order: 1,
        alightByHour: flatAlight(3000),
        hotspots: { up: [], down: [hotspot(2, 2)] },
      }),
      makeStation({
        id: "far",
        order: 2,
        alightByHour: flatAlight(3000),
        hotspots: { up: [], down: [hotspot(7, 3)] },
      }),
      makeStation({ id: "d", order: 3 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation!.car).toBe(2);
    // 앉을 확률 자체는 비슷해도(같은 하차 규모) 기대 착석 정거장에서 갈린다
    const car2 = result.cars.find((c) => c.car === 2)!;
    const car7 = result.cars.find((c) => c.car === 7)!;
    expect(car2.expSeatedStops).toBeGreaterThan(car7.expSeatedStops);
  });

  it("hasRidership=false 역은 기여하지 않는다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "no-data",
        order: 1,
        alightByHour: flatAlight(99999),
        hasRidership: false,
        hotspots: { up: [], down: [hotspot(8, 4)] },
      }),
      makeStation({
        id: "s",
        order: 2,
        alightByHour: flatAlight(10),
        hotspots: { up: [], down: [hotspot(1, 1)] },
      }),
      makeStation({ id: "d", order: 3 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation!.car).toBe(1);
    for (const car of result.cars) {
      expect(car.topContributors.map((c) => c.stationId)).not.toContain("no-data");
    }
  });

  it("인접 역(중간 역 없음)이면 recommendation은 null", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({ id: "d", order: 1 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation).toBeNull();
    for (const c of result.cars) expect(c.expSeatedStops).toBe(0);
  });

  it("1위 칸의 topContributors에 기여 역과 라벨이 담긴다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "hub",
        order: 1,
        name: "고속터미널",
        alightByHour: flatAlight(5000),
        hotspots: { up: [], down: [hotspot(6, 3, "3호선 환승")] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    const best = result.cars.find((c) => c.rank === 1)!;
    expect(best.topContributors[0].stationName).toBe("고속터미널");
    expect(best.topContributors[0].labels).toContain("3호선 환승");
    expect(best.topContributors[0].share).toBeCloseTo(1, 9);
  });

  it("시(hour) 단위 슬롯으로도 계산된다 — 열차당 하차가 많은 시간이 확률도 높다", () => {
    const weekday = new Array(20).fill(0);
    weekday[3] = 5000; // 08시 버킷
    weekday[13] = 500; // 18시 버킷 (비교용으로 작게)
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: { weekday, weekend: new Array(20).fill(0) },
        hotspots: { up: [], down: [hotspot(3, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const rush = scoreRoute(resolveRoute("o", "d", data), hourSlot(8), data);
    const calm = scoreRoute(resolveRoute("o", "d", data), hourSlot(18), data);
    expect(rush.recommendation!.seatProb).toBeGreaterThan(calm.recommendation!.seatProb);
  });

  it("요일 구분: 주말 슬롯은 주말 하차 통계를 쓴다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: { weekday: new Array(20).fill(1000), weekend: new Array(20).fill(0) },
        hotspots: { up: [], down: [hotspot(3, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const wd = scoreRoute(resolveRoute("o", "d", data), hourSlot(10, "weekday"), data);
    const we = scoreRoute(resolveRoute("o", "d", data), hourSlot(10, "weekend"), data);
    expect(wd.recommendation).not.toBeNull();
    expect(we.recommendation).toBeNull(); // 주말 하차 0 → 추천 불가
  });

  it("칸 norm은 0~100이고 1위 칸이 100", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: flatAlight(100),
        hotspots: { up: [], down: [hotspot(4, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    const best = result.cars.find((c) => c.rank === 1)!;
    expect(best.norm).toBeCloseTo(100, 9);
    for (const c of result.cars) {
      expect(c.norm).toBeGreaterThanOrEqual(0);
      expect(c.norm).toBeLessThanOrEqual(100);
    }
  });
});

describe("출발역 탑승 시점 p₀", () => {
  const build = (opts: { cong?: number | null; board?: number; alightAtOrigin?: number }) =>
    makeLineData([
      makeStation({
        id: "o",
        order: 0,
        alightByHour: flatAlight(opts.alightAtOrigin ?? 0),
        boardByHour: flatBoard(opts.board ?? 0),
        congestion:
          opts.cong == null
            ? { up: null, down: null }
            : { up: flatCongestion(opts.cong), down: flatCongestion(opts.cong) },
      }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: flatAlight(300),
        hotspots: { up: [], down: [hotspot(3, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
  const score = (data: ReturnType<typeof build>) =>
    scoreRoute(resolveRoute("o", "d", data), AM, data);

  it("혼잡도가 낮아 좌석 여유가 있으면 p₀ > 0이고 앉을 확률에 반영된다", () => {
    const calm = score(build({ cong: 15, board: 100 })); // 재차 24명 < 좌석 54
    expect(calm.recommendation!.boardSeatProb).toBeGreaterThan(0.5);
    expect(calm.recommendation!.seatProb).toBeGreaterThanOrEqual(
      calm.recommendation!.boardSeatProb,
    );
    // 바로 앉으면 전 구간 착석 → 기대 착석이 p₀×총구간 이상
    expect(calm.recommendation!.expSeatedStops).toBeGreaterThanOrEqual(
      calm.recommendation!.boardSeatProb * 2,
    );
  });

  it("극혼잡이고 출발역 하차가 없으면 p₀ ≈ 0", () => {
    const packed = score(build({ cong: 150, board: 100 }));
    expect(packed.recommendation!.boardSeatProb).toBe(0);
  });

  it("승차 경쟁자가 많을수록 p₀가 낮다", () => {
    const fewRivals = score(build({ cong: 15, board: 50 }));
    const manyRivals = score(build({ cong: 15, board: 3000 }));
    expect(fewRivals.recommendation!.boardSeatProb).toBeGreaterThan(
      manyRivals.recommendation!.boardSeatProb,
    );
  });

  it("혼잡도 없으면 p₀ = 0 — 기존 결과와 동일 (회귀 가드)", () => {
    const noCong = score(build({ cong: null, board: 500 }));
    expect(noCong.recommendation!.boardSeatProb).toBe(0);
    expect(noCong.recommendation!.car).toBe(3); // 중간역 hotspot 기반 추천 유지
  });

  it("극혼잡이어도 출발역 하차가 많으면 그 빈자리로 p₀ > 0", () => {
    const turnover = score(build({ cong: 150, board: 100, alightAtOrigin: 2000 }));
    expect(turnover.recommendation!.boardSeatProb).toBeGreaterThan(0);
  });
});

describe("동점 근접 복수 추천", () => {
  it("대칭 hotspot이면 다른 칸의 최고 문이 동점 대안으로 나온다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: flatAlight(60),
        // 열차 중심 기준 대칭 위치 → 두 문 점수가 동일해야 한다
        hotspots: { up: [], down: [hotspot(2, 2), hotspot(7, 3)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.alternates.length).toBeGreaterThanOrEqual(1);
    const cars = [result.recommendation!.car, ...result.alternates.map((a) => a.car)];
    expect(cars).toContain(2);
    expect(cars).toContain(7);
  });

  it("확실한 1위가 있으면 대안이 없다", () => {
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({
        id: "s",
        order: 1,
        alightByHour: flatAlight(60),
        hotspots: { up: [], down: [hotspot(3, 2)] },
      }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.recommendation!.car).toBe(3);
    expect(result.alternates).toEqual([]);
  });

  it("대안은 최대 2개, 1위와 같은 칸은 제외된다", () => {
    // 하차가 전무한 균등 상황: 모든 칸이 동점이어도 대안은 2개까지만
    const data = makeLineData([
      makeStation({ id: "o", order: 0 }),
      makeStation({ id: "s", order: 1, alightByHour: flatAlight(60) }),
      makeStation({ id: "d", order: 2 }),
    ]);
    const result = scoreRoute(resolveRoute("o", "d", data), AM, data);
    expect(result.alternates.length).toBeLessThanOrEqual(2);
    for (const a of result.alternates) {
      expect(a.car).not.toBe(result.recommendation!.car);
    }
  });
});
