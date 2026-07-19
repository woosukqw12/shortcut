// UI 스모크: 전역 역 검색 → 직행/순환/루프 추천 → 환승 여정 → 출근길 프리셋 → 2단계 기능
import { chromium } from "playwright";

const shots = process.argv[2] ?? ".";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const pickStation = async (label, query, name) => {
  await page.click(`text=${label}`);
  await page.fill("input[placeholder*='역 이름 검색']", query);
  await page.click(`li >> text="${name}"`); // 정확 일치 (시청↔부천시청 오클릭 방지)
};
const carCount = () => page.locator("button[aria-label*='번째 칸']").count();

await page.goto("http://localhost:4173/");
await page.waitForSelector("text=어디에 탈까");

// ── 직행 (노선 자동 선택): 노원(4·7호선)→고속터미널(3·7호선)은 7호선, 08:30
await pickStation("출발역", "노원", "노원");
await pickStation("도착역", "고속", "고속터미널");
await page.fill("input[aria-label='출발 시각 선택']", "08:30");
await page.waitForSelector("text=08:30 기준");
await page.waitForSelector("text=7호선 · 석남 방면");
await page.waitForSelector("text=가장 오래 앉아갈 수 있는 위치");
console.log("직행:", (await page.textContent("section >> text=앉을 확률"))?.trim().replace(/\s+/g, " "));
console.log("직행 칸 수:", await carCount(), "(8 기대)");
await page.click("text=현재 경로를 출근길로 저장");
await page.screenshot({ path: `${shots}/1-direct.png` });

// ── 2호선 순환: 신도림→시청
await pickStation("출발역", "신도림", "신도림");
await pickStation("도착역", "시청", "시청");
await page.waitForSelector("text=순환");
await page.waitForSelector("text=가장 오래 앉아갈 수 있는 위치");
console.log("2호선 방향:", (await page.textContent("text=/순환/"))?.trim().replace(/\s+/g, " "));
console.log("2호선 칸 수:", await carCount(), "(10 기대)");
await page.screenshot({ path: `${shots}/2-line2.png` });

// ── 6호선 응암 루프: 합정→독바위
await pickStation("출발역", "합정", "합정");
await pickStation("도착역", "독바위", "독바위");
await page.waitForSelector("text=응암순환 방면");
console.log("6호선 루프 방면 표기 OK, 칸 수:", await carCount(), "(8 기대)");
await page.screenshot({ path: `${shots}/3-line6.png` });

// ── 환승 여정: 상봉(7호선)→강남(2호선), 건대입구 환승 + 빠른환승 문 위치
await pickStation("출발역", "상봉", "상봉");
await pickStation("도착역", "강남", "강남");
await page.waitForSelector("text=환승 1회 · 총");
await page.waitForSelector("text=1구간 · 7호선");
await page.waitForSelector("text=2구간 · 2호선");
await page.waitForSelector("text=건대입구에서 2호선 환승");
await page.waitForSelector("text=환승 통로와 가까운 문은 1-1문");
console.log("환승 여정:", (await page.textContent("text=환승 1회 · 총"))?.trim().replace(/\s+/g, " "));
console.log("환승 구간 카드 2개 + 빠른환승 문 위치 OK");
await page.screenshot({ path: `${shots}/4-transfer.png`, fullPage: true });

// ── 별칭 검색: "총신대입구"로 검색해 이수 선택
await page.click("text=도착역");
await page.fill("input[placeholder*='역 이름 검색']", "총신대");
await page.waitForSelector("li >> text=이수(총신대입구)");
await page.keyboard.press("Escape");
await page.click("text=닫기");
console.log("별칭 검색(총신대입구→이수) OK");

// ── 출근길 프리셋: 원탭 복귀 (노원→고속터미널)
await page.reload();
await page.waitForSelector("text=🏠 출근");
await page.click("text=🏠 출근");
await page.waitForSelector("text=석남 방면");
console.log("출근길 프리셋 복원 OK");

// ── 출발 시간별 차트 동작
await page.waitForSelector("text=출발 시간별 앉아갈 전망");
await page.click("button[aria-label*='14시 출발']");
await page.waitForSelector("text=14:00 기준");

// ── 2단계 기능: 평일/주말 토글, 선호 슬라이더, 피드백 기록
const beforeToggle = await page.textContent("text=구간을 앉아서");
await page.click("button[aria-label='평일/주말 전환']");
await page.waitForTimeout(300);
const afterToggle = await page.textContent("text=구간을 앉아서");
const seated = (t) => t?.match(/약 ([\d.]+)개/)?.[1];
console.log("요일 토글: 평일", seated(beforeToggle), "→ 주말", seated(afterToggle), "(기대 착석)");
await page.click("button[aria-label='평일/주말 전환']"); // 원복

await page.locator("input[type='range']").fill("100"); // 확실히 앉기 극단
await page.waitForSelector("text=확실히 앉기 우선");
await page.locator("input[type='range']").fill("30"); // 기본 근처로 복귀
console.log("선호 슬라이더 동작 OK");

await page.click("text=🙂 가다가 앉음");
await page.waitForSelector("text=기록됐어요");
console.log("피드백 기록 OK");
await page.screenshot({ path: `${shots}/5-stage2.png`, fullPage: true });

if (errors.length) {
  console.error("콘솔/페이지 에러:", errors);
  process.exit(1);
}
console.log("UI 스모크 통과");
await browser.close();
