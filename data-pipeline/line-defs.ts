/**
 * 1~8호선 노선 정의. 역 목록은 승하차 CSV의 역번호 순서에서 자동 생성하고,
 * 여기에는 예외만 기술한다:
 *  - moveAfter: 역번호 순서 ≠ 실제 노선 순서인 역 (나중에 개통해 코드가 뒤로 밀린 역)
 *  - exclude: 지선 등 이 변형에서 제외할 역번호
 *  - insert: CSV에 없는 역 추가 (환승역 통계가 타 노선으로 집계되는 역, 타 운영사 구간)
 *  - rename: 역명 변경으로 CSV에 이름이 둘인 역의 대표명
 *  - externalTerminals: 환승 데이터의 "방면" 이 관할 구간 밖 역명일 때의 방향 매핑
 */
export interface InsertDef {
  /** 고유 id. 실제 역번호가 확인되면 그 값, 아니면 합성 키 */
  id: string;
  name: string;
  aliases?: string[];
  /** 이 역번호 뒤에 삽입 (null이면 맨 앞) */
  afterCode: string | null;
  /** 하차 통계를 빌려올 (csv호선, 역번호) — 공용 게이트 환승역용 */
  borrowRidership?: { csvLine: string; code: string };
}

export interface VariantDef {
  /** 파일/데이터 키: line1, line5m 등 */
  fileKey: string;
  line: string;
  lineName: string;
  /** 이 변형에 포함할 역번호 범위 [from, to] 목록 (CSV 추출 후 필터) */
  codeRanges: [number, number][];
  exclude?: string[];
  moveAfter?: { code: string; afterCode: string }[];
  insert?: InsertDef[];
  routeKind: "linear" | "circular" | "loop-tail";
  loopUntilOrder?: number;
  directionLabels: { up: string; down: string };
}

export interface LineDef {
  /** UI 선택 키 */
  key: string;
  name: string;
  csvName: string; // 승하차 CSV의 "호선" 값
  color: string;
  carCount: number;
  variants: VariantDef[];
  rename?: Record<string, string>; // 역번호 → 대표 역명
  externalTerminals?: Record<string, "up" | "down">;
}

export const LINE_DEFS: LineDef[] = [
  {
    key: "1",
    name: "1호선",
    csvName: "1호선",
    color: "#0052A4",
    carCount: 10,
    variants: [
      {
        fileKey: "line1",
        line: "1",
        lineName: "1호선",
        codeRanges: [[150, 159]],
        // 동묘앞(159)은 2005년 개통이라 코드가 뒤 — 실제로는 동대문~신설동 사이
        moveAfter: [{ code: "159", afterCode: "155" }],
        routeKind: "linear",
        directionLabels: { up: "인천·신창 방면", down: "소요산 방면" },
      },
    ],
    rename: { "158": "청량리" },
    externalTerminals: {
      // 관할 구간(서울역~청량리) 밖 방면 표기
      인천: "up", 신창: "up", 서동탄: "up", 천안: "up", 병점: "up", 구로: "up", 남영: "up",
      소요산: "down", 연천: "down", 동두천: "down", 의정부: "down", 광운대: "down", 회기: "down",
    },
  },
  {
    key: "2",
    name: "2호선",
    csvName: "2호선",
    color: "#00A84D",
    carCount: 10,
    variants: [
      {
        fileKey: "line2",
        line: "2",
        lineName: "2호선",
        // 본선 순환 43역. 244~250은 성수지선·신정지선 — 제외
        codeRanges: [[201, 243]],
        routeKind: "circular",
        directionLabels: { up: "외선순환", down: "내선순환" },
      },
    ],
    externalTerminals: {
      // 지선 방면 (본선에서 제외된 역들)
      용답: "down", 신답: "down", 도림천: "down", 양천구청: "down",
    },
  },
  {
    key: "3",
    name: "3호선",
    csvName: "3호선",
    color: "#EF7C1C",
    carCount: 10,
    variants: [
      {
        fileKey: "line3",
        line: "3",
        lineName: "3호선",
        codeRanges: [[309, 342]],
        // 충무로는 게이트를 4호선과 공유해 3호선 행이 CSV에 없다 — 4호선 통계를 빌려 삽입
        insert: [
          {
            id: "321",
            name: "충무로",
            afterCode: "320",
            borrowRidership: { csvLine: "4호선", code: "423" },
          },
        ],
        routeKind: "linear",
        directionLabels: { up: "대화 방면", down: "오금 방면" },
      },
    ],
    externalTerminals: { 대화: "up", 삼송: "up", 원흥: "up", 원당: "up", 화정: "up" },
  },
  {
    key: "4",
    name: "4호선",
    csvName: "4호선",
    color: "#00A5DE",
    carCount: 10,
    variants: [
      {
        fileKey: "line4",
        line: "4",
        lineName: "4호선",
        codeRanges: [[409, 434]],
        routeKind: "linear",
        directionLabels: { up: "진접 방면", down: "오이도 방면" },
      },
    ],
    rename: { "409": "불암산", "428": "삼각지" },
    externalTerminals: {
      진접: "up", 오남: "up", 별내별가람: "up", 당고개: "up",
      오이도: "down", 안산: "down", 금정: "down", 선바위: "down", 범계: "down",
    },
  },
  {
    key: "5",
    name: "5호선",
    csvName: "5호선",
    color: "#996CAC",
    carCount: 8,
    variants: [
      {
        fileKey: "line5",
        line: "5",
        lineName: "5호선",
        // 본선: 방화(2511)~상일동(2554) + 하남 연장 강일(2562)~하남검단산(2566)
        codeRanges: [
          [2511, 2554],
          [2562, 2566],
        ],
        routeKind: "linear",
        directionLabels: { up: "방화 방면", down: "하남검단산 방면" },
      },
      {
        fileKey: "line5m",
        line: "5m",
        lineName: "5호선 마천행",
        // 마천지선: 방화~강동(2549) 공용 + 둔촌동(2555)~마천(2561)
        codeRanges: [
          [2511, 2549],
          [2555, 2561],
        ],
        routeKind: "linear",
        directionLabels: { up: "방화 방면", down: "마천 방면" },
      },
    ],
    // 강동: "강동 방면" 하차 = 동쪽 지선에서 강동으로 진입하는 상행 열차 (지선 교차 환승 위치)
    externalTerminals: { 하남검단산: "down", 마천: "down", 강동: "up" },
  },
  {
    key: "6",
    name: "6호선",
    csvName: "6호선",
    color: "#CD7C2F",
    carCount: 8,
    variants: [
      {
        fileKey: "line6",
        line: "6",
        lineName: "6호선",
        codeRanges: [[2611, 2649]],
        insert: [
          // 연신내는 게이트를 3호선과 공유해 6호선 행이 없다 (코드 2615 자리)
          {
            id: "2615",
            name: "연신내",
            afterCode: "2614",
            borrowRidership: { csvLine: "3호선", code: "311" },
          },
          // 신내(2649·2019년 개통)는 CSV에 승하차 행이 없다 — 통계 없이 포함
          { id: "2649", name: "신내", afterCode: "2648" },
        ],
        routeKind: "loop-tail",
        // order 0(응암)~5(구산)가 단방향 순환 (응암→역촌→불광→독바위→연신내→구산→응암)
        loopUntilOrder: 5,
        directionLabels: { up: "응암순환 방면", down: "신내 방면" },
      },
    ],
    externalTerminals: { 응암순환: "up" },
  },
  {
    key: "7",
    name: "7호선",
    csvName: "7호선",
    color: "#747F00",
    carCount: 8,
    variants: [
      {
        fileKey: "line7",
        line: "7",
        lineName: "7호선",
        codeRanges: [[2711, 2753]],
        insert: [
          // 인천교통공사 이관 구간 (까치울~석남) — 서울 통계에 없음. id는 7호선 외부코드
          { id: "751", name: "까치울", afterCode: "LAST" },
          { id: "752", name: "부천종합운동장", afterCode: "LAST" },
          { id: "753", name: "춘의", afterCode: "LAST" },
          { id: "754", name: "신중동", afterCode: "LAST" },
          { id: "755", name: "부천시청", afterCode: "LAST" },
          { id: "756", name: "상동", afterCode: "LAST" },
          { id: "757", name: "삼산체육관", afterCode: "LAST" },
          { id: "758", name: "굴포천", afterCode: "LAST" },
          { id: "759", name: "부평구청", afterCode: "LAST" },
          { id: "760", name: "산곡", afterCode: "LAST" },
          { id: "761", name: "석남", afterCode: "LAST", aliases: ["석남(거북시장)"] },
        ],
        routeKind: "linear",
        directionLabels: { up: "장암 방면", down: "석남 방면" },
      },
    ],
    externalTerminals: { 석남: "down", 부평구청: "down" },
  },
  {
    key: "8",
    name: "8호선",
    csvName: "8호선",
    color: "#E6186C",
    carCount: 6,
    variants: [
      {
        fileKey: "line8",
        line: "8",
        lineName: "8호선",
        codeRanges: [[2810, 2828]],
        // 남위례(2828·2021년 개통)는 실제로는 복정~산성 사이
        moveAfter: [{ code: "2828", afterCode: "2821" }],
        insert: [
          // 별내선(2024 개통, 경기 구간) — 서울 통계에 없음. id는 합성 키
          { id: "8B01", name: "별내", afterCode: null },
          { id: "8B02", name: "다산", afterCode: "8B01" },
          { id: "8B03", name: "동구릉", afterCode: "8B02" },
          { id: "8B04", name: "구리", afterCode: "8B03" },
          { id: "8B05", name: "장자호수공원", afterCode: "8B04" },
        ],
        routeKind: "linear",
        directionLabels: { up: "별내 방면", down: "모란 방면" },
      },
    ],
    externalTerminals: { 별내: "up", 모란: "down" },
  },
];
