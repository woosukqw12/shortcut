import { useEffect, useState } from "react";
import {
  appendFeedback,
  exportText,
  feedbackStats,
  loadFeedback,
  updateFeedback,
  type FeedbackEntryV2,
  type Outcome,
} from "../core/feedback";

/** 기록 시점에 위젯 밖에서 채워지는 값들 (결과·ts 제외 전부) */
export type FeedbackBase = Omit<
  FeedbackEntryV2,
  "v" | "ts" | "outcome" | "boardedRec" | "seatedStopsAway" | "seatedStationId"
>;

interface Props {
  entry: FeedbackBase;
  /** 착석 위치 후속 질문용 중간 역 목록 (경로 순) */
  intermediates: { id: string; name: string; stopsAway: number }[];
  /** 환승 여정에서 구간 표기 (예: "1구간 · 7호선") */
  label?: string;
  /** 쿼리가 바뀌면 위젯 상태 초기화용 키 */
  queryKey: string;
}

export default function FeedbackWidget({ entry, intermediates, label, queryKey }: Props) {
  const [boardedRec, setBoardedRec] = useState(true);
  const [logged, setLogged] = useState<Outcome | null>(null);
  const [loggedTs, setLoggedTs] = useState<string | null>(null);
  const [askSeated, setAskSeated] = useState(false);
  const [exported, setExported] = useState<"shared" | "copied" | null>(null);
  const [stats, setStats] = useState<{ total: number; seated: number }>({ total: 0, seated: 0 });

  useEffect(() => {
    setBoardedRec(true);
    setLogged(null);
    setLoggedTs(null);
    setAskSeated(false);
    setExported(null);
    setStats(feedbackStats(loadFeedback()));
  }, [queryKey]);

  const log = (outcome: Outcome) => {
    const ts = new Date().toISOString();
    appendFeedback({ ...entry, v: 2, ts, boardedRec, outcome });
    setLogged(outcome);
    setLoggedTs(ts);
    // 착석 위치는 선택 응답 — 여기서 닫혀도 기본 기록은 이미 저장됐다
    setAskSeated(outcome === "later" && intermediates.length > 0);
    setStats(feedbackStats(loadFeedback()));
  };

  const answerSeated = (s: { id: string; stopsAway: number } | null) => {
    if (s && loggedTs) {
      updateFeedback(loggedTs, { seatedStopsAway: s.stopsAway, seatedStationId: s.id });
    }
    setAskSeated(false);
  };

  const doExport = async () => {
    const text = exportText(loadFeedback());
    try {
      if (navigator.share) {
        await navigator.share({ title: "어디에 탈까 피드백 기록", text });
        setExported("shared");
      } else {
        await navigator.clipboard.writeText(text);
        setExported("copied");
      }
    } catch {
      // 공유 시트 취소 등 — 무시
    }
  };

  const chip = (outcome: Outcome, text: string) => (
    <button
      type="button"
      onClick={() => log(outcome)}
      disabled={logged !== null}
      className="min-h-11 flex-1 rounded-lg border px-2 text-sm"
      style={{
        background: logged === outcome ? "var(--accent)" : "var(--surface-1)",
        color: logged === outcome ? "#ffffff" : "var(--text-secondary)",
        borderColor: logged === outcome ? "var(--accent)" : "var(--border)",
        opacity: logged !== null && logged !== outcome ? 0.4 : 1,
      }}
    >
      {text}
    </button>
  );

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        {label ? `${label} — 타 보셨나요?` : "타 보셨나요?"} 결과를 기록하면 추천이 점점
        정확해질 근거가 쌓여요
      </p>

      {logged === null && (
        <>
          <label
            className="mb-2 flex min-h-11 items-center gap-2 text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={boardedRec}
              onChange={(e) => setBoardedRec(e.target.checked)}
              style={{ accentColor: "var(--accent)", width: 18, height: 18 }}
            />
            추천 칸에 탔어요
          </label>
          <div className="flex gap-2">
            {chip("immediate", "😊 바로 앉음")}
            {chip("later", "🙂 가다가 앉음")}
            {chip("stood", "🧍 못 앉음")}
          </div>
        </>
      )}

      {logged !== null && askSeated && (
        <div>
          <p className="mb-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            어디서 앉았어요?
          </p>
          <div className="flex flex-wrap gap-1.5">
            {intermediates.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => answerSeated(s)}
                className="min-h-9 rounded-full border px-3 text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--page)",
                  color: "var(--text-secondary)",
                }}
              >
                {s.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => answerSeated(null)}
              className="min-h-9 rounded-full px-3 text-sm underline"
              style={{ color: "var(--text-muted)" }}
            >
              건너뛰기
            </button>
          </div>
        </div>
      )}

      {logged !== null && !askSeated && (
        <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          기록됐어요 ✓
        </p>
      )}

      {stats.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--text-muted)" }}>
          <span>
            지금까지 {stats.total}회 기록, {Math.round((stats.seated / stats.total) * 100)}% 착석
          </span>
          <button type="button" onClick={doExport} className="min-h-9 px-2 underline" style={{ color: "var(--text-muted)" }}>
            {exported === "copied" ? "복사됐어요 ✓" : exported === "shared" ? "내보냈어요 ✓" : "내보내기"}
          </button>
        </div>
      )}
    </section>
  );
}
