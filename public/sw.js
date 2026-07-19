// 오프라인 캐시: HTML은 network-first(새 배포 반영), 해시 자산·아이콘은 cache-first.
// 자산 파일명이 빌드마다 바뀌므로(해시) 프리캐시 목록 없이 런타임 캐시로 충분하다.
const CACHE = "shortcut-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const putCopy = (request, response) => {
  const copy = response.clone();
  caches.open(CACHE).then((c) => c.put(request, copy));
  return response;
};

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => putCopy(e.request, r))
        .catch(() => caches.match(e.request)),
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ??
        fetch(e.request).then((r) => (r.ok ? putCopy(e.request, r) : r)),
    ),
  );
});
