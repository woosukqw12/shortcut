import type { DayType } from "../data/schema";

/**
 * 실측 피드백 — 예측(앉을 확률·기대 착석)과 실제 결과를 비교해 경쟁 상수 C·κ를
 * 보정할 근거 데이터. localStorage에 쌓이며 공유 시트/클립보드로 내보낼 수 있다.
 * v1(예측 확률만 기록)과 v2가 같은 배열에 섞여 있고, 보정 계산은 v2만 쓴다.
 */

export type Outcome = "immediate" | "later" | "stood";

/** 초기 스키마 — 보정에 필요한 값이 부족해 통계 표시에만 쓴다 */
export interface FeedbackEntryV1 {
  ts: string;
  line: string;
  originId: string;
  destId: string;
  hour: number;
  dayType: string;
  recCar: number;
  recDoor: number;
  predictedProb: number;
  outcome: Outcome;
}

export interface FeedbackEntryV2 {
  v: 2;
  ts: string;
  line: string;
  originId: string;
  destId: string;
  hour: number;
  dayType: DayType;
  /** 기록 당시 추천 성향 */
  alpha: number;
  totalStops: number;
  /** 직행 0, 환승 여정은 구간 번호 */
  legIndex: number;
  /** 여정의 환승 횟수 */
  transfers: number;
  recCar: number;
  recDoor: number;
  predictedProb: number;
  /** 기대 착석 정거장 예측 */
  predictedExpSeated: number;
  /** 출발역에서 바로 앉을 확률 예측 (p₀ 도입 이후 기록에만 존재) */
  predictedBoardProb?: number;
  /** 추천 칸에 실제로 탔는지 — false면 예측-실측 비교에서 제외 */
  boardedRec: boolean;
  outcome: Outcome;
  /** outcome=later이고 후속 질문에 응답했을 때: 앉은 역이 몇 정거장 앞이었는지 */
  seatedStopsAway?: number;
  seatedStationId?: string;
}

export type FeedbackEntry = FeedbackEntryV1 | FeedbackEntryV2;

export function isV2(e: FeedbackEntry): e is FeedbackEntryV2 {
  return "v" in e && e.v === 2;
}

/** 위젯 하단 통계 (v1·v2 혼합 허용) */
export function feedbackStats(entries: FeedbackEntry[]): { total: number; seated: number } {
  return {
    total: entries.length,
    seated: entries.filter((e) => e.outcome !== "stood").length,
  };
}

/** 내보내기용 직렬화 (공유 시트/클립보드) */
export function exportText(entries: FeedbackEntry[]): string {
  return JSON.stringify(entries, null, 1);
}

// ── localStorage 입출력 ──────────────────────────────────────────

const STORAGE_KEY = "shortcut.feedback";

export function loadFeedback(): FeedbackEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as FeedbackEntry[];
  } catch {
    return [];
  }
}

export function appendFeedback(entry: FeedbackEntryV2): void {
  const all = loadFeedback();
  all.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/** ts로 항목을 찾아 부분 갱신 (착석 위치 후속 응답용) */
export function updateFeedback(ts: string, patch: Partial<FeedbackEntryV2>): void {
  const all = loadFeedback();
  const idx = all.findIndex((e) => e.ts === ts);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
