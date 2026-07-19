import { useMemo, useState } from "react";

/** 전역 역 선택 항목 (물리 역 단위, 소속 노선 배지 표시) */
export interface PickerItem {
  /** 선택 값 = 물리 역 대표 이름 */
  name: string;
  /** 별칭 포함 표시명 (예: "이수(총신대입구)") */
  displayName: string;
  /** 검색 대상 (별칭 포함) */
  searchText: string;
  lines: { key: string; color: string }[];
}

interface Props {
  label: string;
  items: PickerItem[];
  value: string | null;
  onChange: (name: string) => void;
}

export default function StationPicker({ label, items, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((s) => s.name === value) ?? null;

  const filtered = useMemo(
    () => items.filter((s) => s.searchText.includes(query.trim())),
    [items, query],
  );

  const badges = (item: PickerItem) => (
    <span className="flex shrink-0 gap-1">
      {item.lines.map((l) => (
        <span
          key={l.key}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: l.color }}
        >
          {l.key}
        </span>
      ))}
    </span>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border px-4 py-3 text-left"
        style={{ borderColor: "var(--border)", background: "var(--surface-1)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span className="flex items-center gap-2">
          {selected && badges(selected)}
          <span
            className="text-base font-semibold"
            style={{ color: selected ? "var(--text-primary)" : "var(--text-muted)" }}
          >
            {selected ? selected.displayName : "역 선택"}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[75dvh] rounded-t-2xl p-4"
            style={{ background: "var(--surface-1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                {label} 선택
              </h2>
              <button
                type="button"
                className="min-h-11 px-3 text-sm"
                style={{ color: "var(--text-muted)" }}
                onClick={() => setOpen(false)}
              >
                닫기
              </button>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="역 이름 검색 (1~8호선 전체)"
              className="mb-3 w-full rounded-lg border px-3 py-3 text-base outline-none"
              style={{
                borderColor: "var(--border)",
                background: "var(--page)",
                color: "var(--text-primary)",
              }}
            />
            <ul className="overflow-y-auto" style={{ maxHeight: "50dvh" }}>
              {filtered.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(s.name);
                      setOpen(false);
                    }}
                    className="flex min-h-12 w-full items-center justify-between border-b px-2 text-left"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <span
                      className="text-base"
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: s.name === value ? 700 : 400,
                      }}
                    >
                      {s.displayName}
                    </span>
                    {badges(s)}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  검색 결과가 없어요
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
