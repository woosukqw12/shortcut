import { useEffect, useState } from "react";

/**
 * 실측 피드백 로깅 — 예측(앉을 확률·기대 착석)과 실제 결과를 비교할 근거 데이터.
 * localStorage에 쌓이며, 추후 경쟁 상수 C·α 기본값 보정에 쓴다.
 */
const STORAGE_KEY = "shortcut.feedback";

export type Outcome = "immediate" | "later" | "stood";

export interface FeedbackEntry {
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

function loadAll(): FeedbackEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as FeedbackEntry[];
  } catch {
    return [];
  }
}

interface Props {
  entry: Omit<FeedbackEntry, "ts" | "outcome">;
  /** 쿼리가 바뀌면 위젯 상태 초기화용 키 */
  queryKey: string;
}

export default function FeedbackWidget({ entry, queryKey }: Props) {
  const [logged, setLogged] = useState<Outcome | null>(null);
  const [stats, setStats] = useState<{ total: number; seated: number }>({ total: 0, seated: 0 });

  useEffect(() => {
    setLogged(null);
    const all = loadAll();
    setStats({
      total: all.length,
      seated: all.filter((e) => e.outcome !== "stood").length,
    });
  }, [queryKey]);

  const log = (outcome: Outcome) => {
    const all = loadAll();
    all.push({ ...entry, ts: new Date().toISOString(), outcome });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    setLogged(outcome);
    setStats({ total: all.length, seated: all.filter((e) => e.outcome !== "stood").length });
  };

  const chip = (outcome: Outcome, label: string) => (
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
      {label}
    </button>
  );

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
    >
      <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
        타 보셨나요? 결과를 기록하면 추천이 점점 정확해질 근거가 쌓여요
        {stats.total > 0 &&
          ` · 지금까지 ${stats.total}회 기록, ${Math.round((stats.seated / stats.total) * 100)}% 착석`}
      </p>
      {logged === null ? (
        <div className="flex gap-2">
          {chip("immediate", "😊 바로 앉음")}
          {chip("later", "🙂 가다가 앉음")}
          {chip("stood", "🧍 못 앉음")}
        </div>
      ) : (
        <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
          기록됐어요 ✓
        </p>
      )}
    </section>
  );
}
