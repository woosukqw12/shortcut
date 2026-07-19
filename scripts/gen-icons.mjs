// PWA 아이콘 생성 → public/ (재생성: node scripts/gen-icons.mjs)
import { chromium } from "playwright";

const html = (size) => `<!doctype html><meta charset="utf-8"><style>
  body{margin:0}
  .icon{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(160deg,#1e6fd9 0%,#0d4fa8 100%)}
  .glyph{color:#fff;font:800 ${Math.round(size * 0.52)}px system-ui,-apple-system,sans-serif;
    letter-spacing:-0.02em}
</style><body><div class="icon"><span class="glyph">앉</span></div>`;

const browser = await chromium.launch();
for (const size of [512, 192, 180]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size));
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await page.locator(".icon").screenshot({ path: `public/${name}` });
  await page.close();
}
await browser.close();
console.log("public/ 아이콘 생성 완료 (512, 192, apple 180)");
