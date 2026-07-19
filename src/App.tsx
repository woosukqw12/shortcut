import { useEffect, useMemo, useState } from "react";
import CommuteBar from "./components/CommuteBar";
import JourneyView from "./components/JourneyView";
import PreferenceSlider from "./components/PreferenceSlider";
import StationPicker, { type PickerItem } from "./components/StationPicker";
import TimeSlotChips, {
  isTimeChoice,
  parseTimeChoice,
  type SlotChoice,
} from "./components/TimeSlotChips";
import { findEntry, planJourney } from "./core/journey";
import { dayTypeOf, timeSlot } from "./core/timeslot";
import linesIndexRaw from "./data/lines.json";
import stationsIndexRaw from "./data/stations-index.json";
import transfersRaw from "./data/transfers.json";
import {
  lineDataSchema,
  lineIndexSchema,
  stationsIndexSchema,
  transfersSchema,
  type DayType,
  type LineData,
} from "./data/schema";

const ALPHA_KEY = "shortcut.alpha";
function loadAlpha(): number {
  const v = Number(localStorage.getItem(ALPHA_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 1 && localStorage.getItem(ALPHA_KEY) !== null
    ? v
    : 0.3;
}

const linesIndex = lineIndexSchema.parse(linesIndexRaw);
const stationsIndex = stationsIndexSchema.parse(stationsIndexRaw);
const transfers = transfersSchema.parse(transfersRaw);
const lineMeta = new Map(linesIndex.map((l) => [l.key, l]));

// 노선 변형 JSON은 필요할 때 지연 로드 (전 노선 데이터를 초기 번들에 넣지 않기 위해)
const lineModules = import.meta.glob<{ default: unknown }>("./data/line[0-9]*.json");

async function loadVariants(lineKey: string): Promise<LineData[]> {
  const entry = lineMeta.get(lineKey);
  if (!entry) throw new Error(`알 수 없는 노선: ${lineKey}`);
  return Promise.all(
    entry.variants.map(async (fileKey) => {
      const mod = await lineModules[`./data/${fileKey}.json`]();
      return lineDataSchema.parse(mod.default);
    }),
  );
}

// 전역 역 선택 목록 — 물리 역 하나당 한 항목, 소속 노선 배지 포함
const pickerItems: PickerItem[] = stationsIndex.map((e) => ({
  name: e.name,
  displayName: e.aliases?.length ? `${e.name}(${e.aliases.join("·")})` : e.name,
  searchText: [e.name, ...(e.aliases ?? [])].join(" "),
  lines: e.lines.map((l) => ({ key: l.line, color: lineMeta.get(l.line)!.color })),
}));

function resolveSlot(choice: SlotChoice, dayType: DayType) {
  if (isTimeChoice(choice)) {
    const { hour, minute } = parseTimeChoice(choice);
    return timeSlot(hour, minute, dayType);
  }
  const d = new Date();
  return timeSlot(d.getHours(), d.getMinutes(), dayType);
}

export default function App() {
  const [originName, setOriginName] = useState<string | null>(null);
  const [destName, setDestName] = useState<string | null>(null);
  const [slotChoice, setSlotChoice] = useState<SlotChoice>("now");
  const [dayOverride, setDayOverride] = useState<DayType | null>(null);
  const [alpha, setAlpha] = useState<number>(loadAlpha);
  const [lineCache, setLineCache] = useState<Map<string, LineData[]>>(new Map());

  const dayType: DayType = dayOverride ?? dayTypeOf(new Date());
  const changeAlpha = (v: number) => {
    setAlpha(v);
    localStorage.setItem(ALPHA_KEY, String(v));
  };

  const originEntry = originName ? findEntry(stationsIndex, originName) : null;
  const destEntry = destName ? findEntry(stationsIndex, destName) : null;

  // 여정에 관련된 노선만 로드해 캐시
  const neededKeys = useMemo(
    () => [
      ...new Set(
        [...(originEntry?.lines ?? []), ...(destEntry?.lines ?? [])].map((l) => l.line),
      ),
    ],
    [originEntry, destEntry],
  );

  useEffect(() => {
    const missing = neededKeys.filter((k) => !lineCache.has(k));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (k) => [k, await loadVariants(k)] as const)).then((loaded) => {
      if (cancelled) return;
      setLineCache((prev) => {
        const next = new Map(prev);
        for (const [k, v] of loaded) next.set(k, v);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [neededKeys, lineCache]);

  const ready = neededKeys.every((k) => lineCache.has(k));
  const sameStation = Boolean(originEntry && destEntry && originEntry === destEntry);

  const journey = useMemo(
    () =>
      ready && originEntry && destEntry && originEntry !== destEntry
        ? planJourney(originEntry, destEntry, stationsIndex, lineCache, transfers)
        : null,
    [ready, originEntry, destEntry, lineCache],
  );
  const noRoute = Boolean(
    ready && originEntry && destEntry && originEntry !== destEntry && journey === null,
  );

  const slot = useMemo(() => resolveSlot(slotChoice, dayType), [slotChoice, dayType]);
  const slotLabel = slotChoice === "now" ? `지금(${slot.label})` : slot.label;

  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-10 pt-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          어디에 탈까
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          지하철 1~8호선 자리 잡기 도우미 — 빨리, 오래 앉는 위치 추천
        </p>
      </header>

      <div className="mb-3">
        <CommuteBar
          origin={originName}
          dest={destName}
          onLoad={(o, d) => {
            setOriginName(o);
            setDestName(d);
          }}
        />
      </div>

      <section className="space-y-2">
        <StationPicker label="출발역" items={pickerItems} value={originName} onChange={setOriginName} />
        <div className="flex justify-center">
          <button
            type="button"
            aria-label="출발역과 도착역 바꾸기"
            className="min-h-11 rounded-full border px-4 text-sm"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-1)",
              color: "var(--text-secondary)",
            }}
            onClick={() => {
              setOriginName(destName);
              setDestName(originName);
            }}
          >
            ⇅ 바꾸기
          </button>
        </div>
        <StationPicker label="도착역" items={pickerItems} value={destName} onChange={setDestName} />
      </section>

      <section className="mt-4 space-y-3">
        <TimeSlotChips
          value={slotChoice}
          onChange={setSlotChoice}
          dayType={dayType}
          onToggleDay={() => setDayOverride(dayType === "weekday" ? "weekend" : "weekday")}
        />
        <PreferenceSlider alpha={alpha} onChange={changeAlpha} />
      </section>

      {sameStation && (
        <p className="mt-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          출발역과 도착역이 같아요
        </p>
      )}

      {noRoute && (
        <section
          className="mt-5 rounded-xl border p-5 text-sm"
          style={{
            borderColor: "var(--border)",
            background: "var(--surface-1)",
            color: "var(--text-secondary)",
          }}
        >
          이 조합은 환승 1회로는 연결되지 않아요 (2회 이상 환승 필요). 중간 역을 정해 두
          구간으로 나눠서 확인해 보세요.
        </section>
      )}

      {journey && (
        <div className="mt-5">
          <JourneyView
            key={`${originName}|${destName}`}
            journey={journey}
            slot={slot}
            slotLabel={slotLabel}
            alpha={alpha}
            dayType={dayType}
            onPickHour={(h) => setSlotChoice(`t${h % 24}:0`)}
          />
        </div>
      )}

      {!journey && !sameStation && !noRoute && (
        <p className="mt-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          출발역과 도착역을 선택하면
          <br />
          빨리, 오래 앉을 수 있는 칸을 알려드려요
        </p>
      )}

      <footer
        className="mt-10 text-center text-[11px] leading-relaxed"
        style={{ color: "var(--text-muted)" }}
      >
        서울열린데이터광장 통계 기반 추정치입니다
        <br />
        2025년 하차 인원·열차 혼잡도·환승 위치 데이터 기준 · 1~8호선 내 환승 1회까지 지원
      </footer>
    </div>
  );
}
