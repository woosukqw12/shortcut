/**
 * 원천 데이터 다운로드 → data-pipeline/raw/
 *   - ridership2025.csv : 서울교통공사 역별 일별 시간대별 승하차인원 (OA-12921, CP949, ~24MB)
 *   - transfer.csv      : 서울교통공사 수도권 도시철도 환승 데이터 (OA-22521, CP949)
 * 서울열린데이터광장 파일 다운로드 엔드포인트를 직접 호출하므로 API 키가 필요 없다.
 * 포털 개편으로 실패하면 datasetView 페이지에서 수동 다운로드 후 같은 이름으로 저장하면 된다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAW_DIR = join(dirname(fileURLToPath(import.meta.url)), "raw");
const ENDPOINT = "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false";

interface FileSpec {
  name: string;
  infId: string;
  seq: string;
  /** datasetView 페이지 frmFile의 hidden infSeq — 값이 바뀌면 페이지에서 다시 확인 */
  infSeqCandidates: string[];
}

const FILES: FileSpec[] = [
  {
    name: "ridership2025.csv",
    infId: "OA-12921",
    seq: "46", // 서울교통공사_역별 일별 시간대별 승하차인원_20251231.csv
    infSeqCandidates: ["3", "1"],
  },
  {
    name: "transfer.csv",
    infId: "OA-22521",
    seq: "1", // 서울교통공사_수도권 도시철도 환승 데이터_20250317.csv
    infSeqCandidates: ["2", "1"],
  },
  {
    name: "congestion.csv",
    infId: "OA-12928",
    seq: "19", // 서울교통공사_지하철혼잡도정보_20251130.csv (30분 단위·상하선·요일)
    infSeqCandidates: ["1", "3"],
  },
];

async function download(spec: FileSpec): Promise<void> {
  for (const infSeq of spec.infSeqCandidates) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ infId: spec.infId, seq: spec.seq, infSeq }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    // 실패 시 200과 함께 자바스크립트 alert 페이지가 내려온다
    if (res.ok && buf.length > 1000 && !buf.subarray(0, 100).toString().includes("<html")) {
      writeFileSync(join(RAW_DIR, spec.name), buf);
      console.log(`✓ ${spec.name} (${(buf.length / 1024 / 1024).toFixed(1)}MB, infSeq=${infSeq})`);
      return;
    }
  }
  throw new Error(
    `${spec.name} 다운로드 실패 — https://data.seoul.go.kr/dataList/${spec.infId}/F/1/datasetView.do 에서 수동 다운로드 후 data-pipeline/raw/${spec.name} 로 저장하세요`,
  );
}

mkdirSync(RAW_DIR, { recursive: true });
for (const spec of FILES) {
  await download(spec);
}
