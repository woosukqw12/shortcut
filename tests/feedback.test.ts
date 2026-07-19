import { describe, expect, it } from "vitest";
import {
  exportText,
  feedbackStats,
  isV2,
  type FeedbackEntry,
  type FeedbackEntryV1,
  type FeedbackEntryV2,
} from "../src/core/feedback";

const v1: FeedbackEntryV1 = {
  ts: "2026-07-13T08:00:00Z",
  line: "7",
  originId: "2715",
  destId: "2736",
  hour: 8,
  dayType: "weekday",
  recCar: 1,
  recDoor: 1,
  predictedProb: 0.99,
  outcome: "later",
};

const v2: FeedbackEntryV2 = {
  v: 2,
  ts: "2026-07-20T08:00:00Z",
  line: "7",
  originId: "2726",
  destId: "2729",
  hour: 8,
  dayType: "weekday",
  alpha: 0.3,
  totalStops: 7,
  legIndex: 0,
  transfers: 1,
  recCar: 5,
  recDoor: 1,
  predictedProb: 0.75,
  predictedExpSeated: 2.7,
  boardedRec: true,
  outcome: "later",
  seatedStopsAway: 5,
  seatedStationId: "2727",
};

describe("feedback", () => {
  it("v1·v2 혼합 배열에서 통계를 낸다 (못 앉음만 미착석)", () => {
    const entries: FeedbackEntry[] = [
      v1,
      v2,
      { ...v2, ts: "t3", outcome: "stood" },
      { ...v2, ts: "t4", outcome: "immediate" },
    ];
    expect(feedbackStats(entries)).toEqual({ total: 4, seated: 3 });
    expect(feedbackStats([])).toEqual({ total: 0, seated: 0 });
  });

  it("isV2로 보정용 항목만 걸러낼 수 있다", () => {
    const entries: FeedbackEntry[] = [v1, v2];
    const calib = entries.filter(isV2);
    expect(calib).toHaveLength(1);
    expect(calib[0].predictedExpSeated).toBe(2.7);
  });

  it("내보내기 텍스트는 JSON 라운드트립으로 전 필드가 보존된다", () => {
    const parsed = JSON.parse(exportText([v1, v2])) as FeedbackEntry[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(v1);
    expect(parsed[1]).toEqual(v2);
  });
});
