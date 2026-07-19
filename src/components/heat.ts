/**
 * dataviz 레퍼런스 sequential blue 램프 (100→700).
 * norm(0~100) → 히트 색. 밝은 쪽이 0(표면에 가깝게 후퇴), 어두운 쪽이 최대.
 */
const RAMP = [
  "#cde2fb", // 100
  "#b7d3f6", // 150
  "#9ec5f4", // 200
  "#86b6ef", // 250
  "#6da7ec", // 300
  "#5598e7", // 350
  "#3987e5", // 400
  "#2a78d6", // 450
  "#256abf", // 500
  "#1c5cab", // 550
  "#184f95", // 600
  "#104281", // 650
  "#0d366b", // 700
];

export function heatColor(norm: number): string {
  const idx = Math.min(RAMP.length - 1, Math.floor((norm / 100) * RAMP.length));
  return RAMP[idx];
}

/** 어두운 스텝 위에는 흰 글자, 밝은 스텝 위에는 짙은 글자 */
export function heatInk(norm: number): string {
  return norm >= 55 ? "#ffffff" : "#0b0b0b";
}
