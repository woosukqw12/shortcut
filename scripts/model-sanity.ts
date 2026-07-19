/** 모델 sanity 체크: 요일·α에 따라 추천이 어떻게 달라지는지 출력. 실행: npx tsx scripts/model-sanity.ts */
import { resolveRoute } from "../src/core/route";
import { scoreRoute } from "../src/core/scoring";
import { timeSlot } from "../src/core/timeslot";
import line7 from "../src/data/line7.json";
import { lineDataSchema, type DayType } from "../src/data/schema";

const data = lineDataSchema.parse(line7);
const nowon = data.stations.find((s) => s.name === "노원")!;
const term = data.stations.find((s) => s.name === "고속터미널")!;
const route = resolveRoute(nowon.id, term.id, data);

console.log("노원→고속터미널 08:30");
for (const day of ["weekday", "weekend"] as DayType[]) {
  const r = scoreRoute(route, timeSlot(8, 30, day), data, { alpha: 0.3 }).recommendation!;
  console.log(
    `  ${day}: ${r.positionLabel} · prob ${r.seatProb.toFixed(3)} · seated ${r.expSeatedStops.toFixed(1)}`,
  );
}
for (const a of [0, 0.5, 1]) {
  const r = scoreRoute(route, timeSlot(8, 30, "weekday"), data, { alpha: a }).recommendation!;
  console.log(
    `  alpha=${a}: ${r.positionLabel} · prob ${r.seatProb.toFixed(3)} · seated ${r.expSeatedStops.toFixed(1)}`,
  );
}
