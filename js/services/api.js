export async function apiSearch(q, type) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`);
  return await res.json();
}

export async function apiExtractPlayer(url) {
  const res = await fetch(`/api/extract-player?url=${encodeURIComponent(url)}`);
  return await res.json();
}

export async function apiExtractStream(postId, nonce, player, filmUrl, partKey = "") {
  const partKeyParam = partKey ? `&partKey=${encodeURIComponent(partKey)}` : "";
  const res = await fetch(
    `/api/extract-stream?postId=${postId}&nonce=${nonce}&player=${encodeURIComponent(player)}&filmUrl=${encodeURIComponent(filmUrl)}${partKeyParam}`
  );
  return await res.json();
}

export async function apiAnalyze(url, referer, quality = null) {
  const qualityParam = quality ? `&quality=${encodeURIComponent(quality)}` : "";
  const res = await fetch(
    `/api/analyze?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}${qualityParam}`
  );
  return await res.json();
}

export async function apiDownload(body) {
  const res = await fetch("/api/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

export async function apiGetSeriesDetail(url) {
  const res = await fetch(`/api/series-detail?url=${encodeURIComponent(url)}`);
  return await res.json();
}

export async function apiExtractSeriesVideo(url) {
  const res = await fetch(`/api/extract-series-video?url=${encodeURIComponent(url)}`);
  return await res.json();
}

export async function apiGetTaskStatus(taskId) {
  const res = await fetch(`/api/task-status/${taskId}`);
  return await res.json();
}

export async function apiCancelTask(taskId) {
  const res = await fetch(`/api/task-cancel/${taskId}`, { method: "POST" });
  return await res.json();
}

export async function apiGetVideoSubtitles(file) {
  const res = await fetch(`/api/video-subtitles?file=${encodeURIComponent(file)}`);
  return await res.json();
}

export async function apiPrepareVideo(file) {
  const res = await fetch(`/api/prepare-video?file=${encodeURIComponent(file)}`);
  return await res.json();
}

export async function apiGetDownloadsList() {
  const res = await fetch("/api/downloads-list");
  return await res.json();
}

export async function apiLogToServer(type, message) {
  try {
    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message })
    });
  } catch (_) {}
}

export async function apiGetSettings() {
  const res = await fetch("/api/settings");
  return await res.json();
}

export async function apiSaveSettings(settings) {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  return await res.json();
}

export async function apiSelectFolder() {
  const res = await fetch("/api/select-folder");
  return await res.json();
}
