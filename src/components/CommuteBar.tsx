import { useEffect, useState } from "react";

// v3: 환승 여정 지원으로 노선 선택이 사라져 물리 역 이름만 저장한다
const STORAGE_KEY = "shortcut.commute.v3";
const LEGACY_KEYS = ["shortcut.commute", "shortcut.commute.v2"];

interface Commute {
  home: string;
  work: string;
}

function loadCommute(): Commute | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Commute;
    return c.home && c.work ? c : null;
  } catch {
    return null;
  }
}

interface Props {
  origin: string | null;
  dest: string | null;
  onLoad: (origin: string, dest: string) => void;
}

/** 집앞역→회사역 프리셋 저장/원탭 불러오기 (출근 = 집→회사, 퇴근 = 반대) */
export default function CommuteBar({ origin, dest, onLoad }: Props) {
  const [commute, setCommute] = useState<Commute | null>(null);
  useEffect(() => setCommute(loadCommute()), []);

  const save = () => {
    if (!origin || !dest || origin === dest) return;
    const c: Commute = { home: origin, work: dest };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    setCommute(c);
  };

  const canSave =
    Boolean(origin && dest && origin !== dest) &&
    !(commute && commute.home === origin && commute.work === dest);

  if (!commute && !canSave) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {commute && (
        <>
          <button
            type="button"
            onClick={() => onLoad(commute.home, commute.work)}
            className="min-h-11 rounded-full border px-4 font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              borderColor: "var(--border)",
            }}
          >
            🏠 출근 · {commute.home}→{commute.work}
          </button>
          <button
            type="button"
            onClick={() => onLoad(commute.work, commute.home)}
            className="min-h-11 rounded-full border px-4 font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              borderColor: "var(--border)",
            }}
          >
            🏢 퇴근
          </button>
        </>
      )}
      {canSave && (
        <button
          type="button"
          onClick={save}
          className="min-h-11 px-2 text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          현재 경로를 출근길로 저장
        </button>
      )}
    </div>
  );
}
