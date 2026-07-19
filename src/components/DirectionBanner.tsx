import { directionLabel } from "../core/route";
import type { Route } from "../core/types";
import type { LineData } from "../data/schema";

interface Props {
  route: Route;
  data: LineData;
  /** 없으면 구간 헤더 모드 (역 수만 표시) */
  slotLabel?: string;
  /** 환승 여정의 구간 번호 표시 (예: "1구간 · ") */
  prefix?: string;
}

export default function DirectionBanner({ route, data, slotLabel, prefix }: Props) {
  const noData = route.intermediates.filter((s) => !s.station.hasRidership).length;
  return (
    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
      <span className="font-semibold" style={{ color: data.lineColor }}>
        {prefix}
        {data.lineName} · {directionLabel(data, route.direction)}
      </span>
      {" · "}
      {route.totalStops}개 역{slotLabel && ` 이동 · ${slotLabel} 기준`}
      {noData > 0 && (
        <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
          중간 {noData}개 역(타 운영사 구간)은 하차 통계가 없어 계산에서 제외돼요
        </span>
      )}
    </div>
  );
}
