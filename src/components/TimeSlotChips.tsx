import type { DayType } from "../data/schema";

/** "now" | "tHH:MM" (시:분 직접 선택) */
export type SlotChoice = "now" | string;

export function isTimeChoice(v: SlotChoice): v is `t${string}` {
  return /^t\d{1,2}:\d{1,2}$/.test(v);
}

export function parseTimeChoice(v: string): { hour: number; minute: number } {
  const [h, m] = v.slice(1).split(":");
  return { hour: Number(h), minute: Number(m) };
}

interface Props {
  value: SlotChoice;
  onChange: (v: SlotChoice) => void;
  dayType: DayType;
  onToggleDay: () => void;
}

/** 출발 시각: "지금" 또는 시:분 직접 선택 + 평일/주말 토글 */
export default function TimeSlotChips({ value, onChange, dayType, onToggleDay }: Props) {
  const timeActive = isTimeChoice(value);
  const timeValue = timeActive
    ? (() => {
        const { hour, minute } = parseTimeChoice(value);
        return `${String(hour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      })()
    : "";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange("now")}
        className="min-h-11 rounded-full border px-5 text-sm font-medium"
        style={
          value === "now"
            ? { background: "var(--accent)", color: "#ffffff", borderColor: "var(--accent)" }
            : {
                background: "var(--surface-1)",
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }
        }
      >
        지금
      </button>
      <label
        className="flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium"
        style={
          timeActive
            ? { background: "var(--accent)", color: "#ffffff", borderColor: "var(--accent)" }
            : {
                background: "var(--surface-1)",
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }
        }
      >
        <span>출발 시각</span>
        <input
          type="time"
          aria-label="출발 시각 선택"
          value={timeValue}
          onChange={(e) => {
            const v = e.target.value; // "HH:MM"
            if (!v) return;
            const [h, m] = v.split(":").map(Number);
            onChange(`t${h}:${m}`);
          }}
          className="bg-transparent outline-none"
          style={{ color: "inherit", colorScheme: timeActive ? "dark" : undefined }}
        />
      </label>
      <button
        type="button"
        onClick={onToggleDay}
        aria-label="평일/주말 전환"
        className="min-h-11 rounded-full border px-4 text-sm font-medium"
        style={{
          background: "var(--surface-1)",
          color: "var(--text-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {dayType === "weekday" ? "평일" : "주말"} ⇄
      </button>
    </div>
  );
}
