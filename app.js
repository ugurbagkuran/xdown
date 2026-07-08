const SVG_DOWNLOAD_ICON = `<svg class="download-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>`;

// Global client error logger to server terminal
window.addEventListener("error", (e) => {
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ERROR", message: `${e.message} at ${e.filename}:${e.lineno}` })
  }).catch(() => {});
});




// DOM Elements
const elStreamUrl = document.getElementById("stream-url");
const elBtnAnalyze = document.getElementById("btn-analyze");
const elDecryptMethod = document.getElementById("decrypt-method");
const elDecryptKey = document.getElementById("decrypt-key");
const elDecryptIv = document.getElementById("decrypt-iv");
const elStripBytes = document.getElementById("strip-bytes");
const elConcurrency = document.getElementById("concurrency");
const elConcurrencyVal = document.getElementById("concurrency-val");
const elOutputName = document.getElementById("output-name");
const elOutputFormat = document.getElementById("output-format");
const elCustomReferer = document.getElementById("custom-referer");
const elBtnStart = document.getElementById("btn-start");

const elAnalysisPanel = document.getElementById("analysis-panel");
const elInfoSize = document.getElementById("info-size");
const elInfoHex = document.getElementById("info-hex");
const elSuggestionText = document.getElementById("suggestion-text");
const elBtnApplySuggestion = document.getElementById("btn-apply-suggestion");
const elHexViewerGrid = document.getElementById("hex-viewer-grid");

const elProgressPanel = document.getElementById("progress-panel");
const elBtnCancel = document.getElementById("btn-cancel");
const elProgressCount = document.getElementById("progress-count");
const elProgressStatus = document.getElementById("progress-status");
const elProgressBarFill = document.getElementById("progress-bar-fill");
const elLogTerminal = document.getElementById("log-terminal");
const elDownloadLinkContainer = document.getElementById(
  "download-link-container",
);
const elBtnDownloadFile = document.getElementById("btn-download-file");

// Search tab elements
const elSearchInput = document.getElementById("search-input");
const elBtnSearch = document.getElementById("btn-search");
const elFilmGrid = document.getElementById("film-grid");
const elDownloadQueue = document.getElementById("download-queue");

// Series Modal DOM Elements
const elSeriesModal = document.getElementById("series-modal");
const elModalSeriesTitle = document.getElementById("modal-series-title");
const elBtnCloseModal = document.getElementById("btn-close-modal");
const elModalSeasonsBar = document.getElementById("modal-seasons-bar");
const elModalEpisodesList = document.getElementById("modal-episodes-list");
const elBulkDownloadPanel = document.getElementById("bulk-download-panel");
const elBulkLang = document.getElementById("bulk-lang");
const elBulkQuality = document.getElementById("bulk-quality");
const elBtnBulkDownload = document.getElementById("btn-bulk-download");

// Download Manager DOM Elements
const elBtnDownloadManager = document.getElementById("btn-download-manager");
const elDownloadManagerPanel = document.getElementById(
  "download-manager-panel",
);
const elDownloadCountBadge = document.getElementById("download-count-badge");
const elDmTasksList = document.getElementById("dm-tasks-list");
const elBtnClearDm = document.getElementById("btn-clear-dm");

// Store active season data for bulk downloads
let activeSeasonEpisodes = [];

// Dynamic cache of extracted episode details to avoid refetching on toggle
const episodeDetailsCache = new Map(); // episodeUrl -> streams data

// Active search type state ('movie' or 'series')
let activeSearchType = "movie";

// App State
let segmentList = [];
let sampleBytes = null;
let activeTaskId = null;
let pollInterval = null;
let lastLogLength = 0;
let detectedSuggestion = null;
// Search state: film başına bağımsız bir indirme kartı tutulur, böylece
// birden fazla film aynı anda indirilebilir ve biri diğerini kesmez.
const downloadTasksByUrl = new Map(); // filmUrl -> { root, pollInterval, ... }
const episodeDownloadTasksByEpisodeUrl = new Map(); // episodeUrl -> filmUrl
let taskCounter = 0; // Technical process counter for PROC_XXX IDs

// ── Search Type Selector Logic ──────────────────────────────────────────────
document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".type-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSearchType = btn.dataset.type;

    if (activeSearchType === "series") {
      elSearchInput.placeholder =
        "aranacak dizi adını girin (Breaking Bad, vb.)...";
    } else {
      elSearchInput.placeholder = "aranacak film adını girin...";
    }
  });
});

// Close Series Modal
elBtnCloseModal.addEventListener("click", () => {
  elSeriesModal.classList.add("hidden");
});

// Toggle Download Manager Panel
elBtnDownloadManager.addEventListener("click", (e) => {
  e.stopPropagation();
  elDownloadManagerPanel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (
    !elDownloadManagerPanel.contains(e.target) &&
    e.target !== elBtnDownloadManager &&
    !elBtnDownloadManager.contains(e.target)
  ) {
    elDownloadManagerPanel.classList.add("hidden");
  }
});

// Clear Finished/Failed items from Download Manager
elBtnClearDm.addEventListener("click", () => {
  const items = elDmTasksList.querySelectorAll(".dm-task-item");
  items.forEach((item) => {
    const badge = item.querySelector(".dm-task-status-badge");
    if (
      badge &&
      (badge.classList.contains("status-success") ||
        badge.classList.contains("status-error") ||
        badge.classList.contains("status-cancelled"))
    ) {
      item.remove();
    }
  });

  if (elDmTasksList.children.length === 0) {
    elDmTasksList.innerHTML = '<div class="dm-empty">aktif indirme yok.</div>';
  }
  updateDownloadCountBadge();
});

// Function to update the download badge indicator count
function updateDownloadCountBadge() {
  const activeItems = elDmTasksList.querySelectorAll(".dm-task-item");
  let runningCount = 0;
  activeItems.forEach((item) => {
    const badge = item.querySelector(".dm-task-status-badge");
    if (badge && badge.classList.contains("status-running")) {
      runningCount++;
    }
  });

  if (runningCount > 0) {
    elDownloadCountBadge.textContent = runningCount;
    elDownloadCountBadge.classList.remove("hidden");
  } else {
    elDownloadCountBadge.classList.add("hidden");
  }
}

// ── Search Logic ─────────────────────────────────────────────────────────────
// Bir indirme kartı içindeki tek bir adımın (film sayfası, ajax, manifest,
// analiz) görsel durumunu günceller. `root`, o filme ait kart elemandır;
// böylece birden fazla kart aynı anda bağımsız olarak güncellenebilir.
function setExtractStep(root, stepName, state, extraText) {
  const el = root.querySelector(`[data-step="${stepName}"]`);
  if (!el) return;
  el.className = `extract-step ${state}`;
  const icons = {
    done: "fa-square-check",
    active: "fa-spinner fa-spin",
    error: "fa-square-minus",
    "": "fa-square",
  };
  el.querySelector("i").className = `fa-solid ${icons[state] || icons[""]}`;
  const label = el.querySelector("span");
  if (extraText && label && !label.textContent.includes(extraText)) {
    label.textContent += ` ${extraText}`;
  }
}

elBtnSearch.addEventListener("click", doSearch);
elSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

// Otomatik arama: kullanıcı yazmayı bırakınca 600ms sonra otomatik ara
let searchDebounceTimer = null;
elSearchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  const q = elSearchInput.value.trim();
  if (!q) {
    elFilmGrid.innerHTML = '<div class="search-empty"><i class="fa-solid fa-terminal" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.3;"></i>arama_sorgusu_bekleniyor...</div>';
    return;
  }
  searchDebounceTimer = setTimeout(() => doSearch(), 600);
});

async function doSearch() {
  clearTimeout(searchDebounceTimer);
  const q = elSearchInput.value.trim();
  if (!q) return;
  elBtnSearch.disabled = true;
  elBtnSearch.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> aranıyor...';
  elFilmGrid.innerHTML =
    '<div class="search-empty"><i class="fa-solid fa-spinner fa-spin" style="font-size:30px;margin-bottom:12px;display:block;"></i>aranıyor...</div>';

  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(q)}&type=${activeSearchType}`,
    );
    const data = await res.json();
    if (!data.success || data.films.length === 0) {
      elFilmGrid.innerHTML = `<div class="search-empty"><i class="fa-solid fa-terminal" style="font-size:40px;margin-bottom:12px;display:block;opacity:.3;"></i>${activeSearchType === "series" ? "dizi" : "film"} bulunamadı.</div>`;
      return;
    }
    renderFilmGrid(data.films);
  } catch (err) {
    elFilmGrid.innerHTML = `<div class="search-empty" style="color:#ff5c5c;">Hata: ${err.message}</div>`;
  } finally {
    elBtnSearch.disabled = false;
    elBtnSearch.innerHTML = '<i class="fa-solid fa-search"></i> ara.';
  }
}

function renderFilmGrid(films) {
  elFilmGrid.innerHTML = films
    .map(
      (f) => `
    <div class="film-card" data-url="${f.url}" data-title="${f.title}">
      <img src="${f.poster || ""}" alt="${f.title}" onerror="this.src='https://via.placeholder.com/160x240/111/555?text=?'">
      <div class="film-card-overlay"><span>${SVG_DOWNLOAD_ICON} ${activeSearchType === "series" ? "bölümler." : "indir."}</span></div>
      <div class="film-card-body">
        <div class="film-card-title">${f.title}</div>
        <div class="film-card-meta">
          ${f.year ? `<span>${f.year}</span>` : ""}
          ${f.rating ? `<span class="film-card-rating">★ ${f.rating}</span>` : ""}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  document.querySelectorAll(".film-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (activeSearchType === "series") {
        showSeriesDetails(card.dataset.url, card.dataset.title);
      } else {
        showFilmDetails(card.dataset.url, card.dataset.title);
      }
    });
  });
}

// HTML olarak güvenli hale getirmek için basit bir escape yardımcısı.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "boyut bilinmiyor";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getEpisodeQuality(streams, lang, quality) {
  const stream = streams.find((s) => s.name === lang);
  if (!stream || !stream.qualities) return null;
  return (
    stream.qualities.find((q) => q.resolution === quality) ||
    stream.qualities[0]
  );
}

function updateEpisodeDownloadState(task, pct = task.progress || 0) {
  if (!task.itemElement) return;

  const overlay = task.itemElement.querySelector(".episode-progress-overlay");
  if (overlay) {
    overlay.style.width = `${pct}%`;
    if (task.status === "completed") {
      overlay.style.background = "rgba(255, 110, 64, 0.22)";
    } else if (task.status === "error" || task.status === "cancelled") {
      overlay.style.background = "rgba(255, 92, 92, 0.2)";
    }
  }

  const epTitleSpan = task.itemElement.querySelector(
    ".episode-title span:first-child",
  );
  if (epTitleSpan) {
    if (!epTitleSpan.dataset.baseText) {
      epTitleSpan.dataset.baseText = epTitleSpan.textContent;
    }
    if (task.status === "running") {
      epTitleSpan.textContent = `${epTitleSpan.dataset.baseText} (${pct}%)`;
    } else {
      epTitleSpan.textContent = epTitleSpan.dataset.baseText;
    }
  }

  const dlBtn = task.itemElement.querySelector(".ep-dl-btn");
  const cancelBtn = task.itemElement.querySelector(".ep-cancel-btn");
  if (dlBtn && cancelBtn) {
    const isRunning = task.status === "running" || task.status === "preparing";
    dlBtn.classList.toggle("hidden", isRunning);
    cancelBtn.classList.toggle("hidden", !isRunning);
  }
}

function bindTaskToEpisodeItem(task, itemElement) {
  task.itemElement = itemElement;
  updateEpisodeDownloadState(task, task.progress || 0);
}

// Her film için bağımsız bir indirme kartı oluşturur ve kuyruğun en üstüne
// ekler. Bu sayede bir film indirilirken başka bir filme tıklamak, öncekini
// iptal etmez / gizlemez — her ikisi de kendi kartında paralel ilerler.
function createDownloadCard(filmTitle) {
  taskCounter++;
  const procId = `PROC_${String(taskCounter).padStart(3, "0")}`;
  const root = document.createElement("div");
  root.className = "dm-task-item";
  root.dataset.taskId = procId;
  root.innerHTML = `
    <div class="dm-task-title">
      <span>${escapeHtml(filmTitle)}</span>
      <button class="dm-task-cancel-btn" data-role="cancel-btn">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="dm-task-progress-wrapper">
      <div class="dm-task-progress-bar-bg">
        <div class="dm-task-progress-bar-fill" data-role="progress-bar-fill" style="width:0%"></div>
      </div>
      <span class="dm-task-percent" data-role="progress-percent">0%</span>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <span class="status-badge status-running dm-task-status-badge" data-role="status-badge">hazirlaniyor...</span>
      <strong style="font-size:9px; font-family:monospace; color:var(--text-muted);" data-role="progress-count">0 / 0</strong>
    </div>
    <div style="font-size:9px; font-family:monospace; color:var(--text-muted); margin-top:2px;" data-role="size-label">boyut hesaplanıyor...</div>
    <div class="download-link-container hidden" data-role="download-link" style="margin-top:4px;">
      <a href="#" download class="btn btn-success btn-small btn-block" data-role="download-btn" style="padding:2px; font-size:10px;">
        <i class="fa-solid fa-file-arrow-down"></i> kaydet.
      </a>
    </div>
  `;

  const emptyMsg = elDmTasksList.querySelector(".dm-empty");
  if (emptyMsg) emptyMsg.remove();

  elDmTasksList.prepend(root);
  updateDownloadCountBadge();
  return root;
}

async function autoDownloadFilm(
  filmUrl,
  filmTitle,
  subtitles = [],
  itemElement = null,
  episodeUrl = null,
  selectedQuality = null,
  customReferer = null,
) {
  return new Promise(async (resolve) => {
    if (downloadTasksByUrl.has(filmUrl)) {
      const existingTask = downloadTasksByUrl.get(filmUrl);
      if (itemElement) bindTaskToEpisodeItem(existingTask, itemElement);
      elDownloadManagerPanel.classList.remove("hidden");
      const existingCard = elDmTasksList.querySelector(
        `[data-task-id="${existingTask.procId}"]`,
      );
      if (existingCard) {
        existingCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      resolve();
      return;
    }

    const root = createDownloadCard(filmTitle);
    elDownloadManagerPanel.classList.remove("hidden");
    const procId = root.dataset.taskId;
    const task = {
      root,
      procId,
      taskId: null,
      interval: null,
      lastLogLength: 0,
      itemElement,
      episodeUrl,
      status: "preparing",
      progress: 0,
    };
    downloadTasksByUrl.set(filmUrl, task);
    if (episodeUrl) {
      episodeDownloadTasksByEpisodeUrl.set(episodeUrl, filmUrl);
    }

    const badge = root.querySelector('[data-role="status-badge"]');
    const cancelBtn = root.querySelector('[data-role="cancel-btn"]');
    const progressBarFill = root.querySelector('[data-role="progress-bar-fill"]');
    const progressPercent = root.querySelector('[data-role="progress-percent"]');
    const progressCount = root.querySelector('[data-role="progress-count"]');
    const sizeLabel = root.querySelector('[data-role="size-label"]');
    const downloadLink = root.querySelector('[data-role="download-link"]');
    const downloadBtn = root.querySelector('[data-role="download-btn"]');

    const finishTask = () => {
      if (task.interval) clearInterval(task.interval);
      downloadTasksByUrl.delete(filmUrl);
      if (task.episodeUrl) {
        episodeDownloadTasksByEpisodeUrl.delete(task.episodeUrl);
      }
    };

    cancelBtn.addEventListener("click", async () => {
      if (task.taskId) {
        await fetch(`/api/task-cancel/${task.taskId}`, { method: "POST" });
      } else {
        finishTask();
        root.remove();
        if (elDmTasksList.children.length === 0) {
          elDmTasksList.innerHTML =
            '<div class="dm-empty">aktif indirme yok.</div>';
        }
        updateDownloadCountBadge();
        resolve();
      }
    });

    try {
      let streamData = null;
      const isDirectM3u8 = filmUrl.includes(".m3u8") || filmUrl.includes("master.txt") || filmUrl.includes(".txt") || filmUrl.includes("/cdn/") || filmUrl.includes("/hls/");

      if (isDirectM3u8) {
        setExtractStep(root, "film", "done", "(doğrudan)");
        setExtractStep(root, "ajax", "done", "(doğrudan)");
        setExtractStep(root, "manifest", "done", "(doğrudan)");

        const isFilmUrl = filmUrl.includes("fullhdfilmizle") || (episodeUrl && episodeUrl.includes("fullhdfilmizle")) || filmUrl.includes("play.mom") || filmUrl.includes("fastplay") || filmUrl.includes("setplay") || filmUrl.includes("shop");
        const defaultReferer = isFilmUrl ? "https://www.fullhdfilmizle.mom/" : "https://www.diziyou.one/";

        streamData = {
          success: true,
          manifestUrl: filmUrl,
          streamReferer: customReferer || defaultReferer,
          candidateUrls: [filmUrl],
        };
      } else {
        setExtractStep(root, "film", "active");
        const playerRes = await fetch(
          `/api/extract-player?url=${encodeURIComponent(filmUrl)}`,
        );
        const playerData = await playerRes.json();
        if (!playerData.success) throw new Error(playerData.error);
        setExtractStep(root, "film", "done");

        setExtractStep(root, "ajax", "active");
        const partKeyParam = playerData.partKey
          ? `&partKey=${encodeURIComponent(playerData.partKey)}`
          : "";
        const streamRes = await fetch(
          `/api/extract-stream?postId=${playerData.postId}&nonce=${playerData.nonce}&player=FastPlay&filmUrl=${encodeURIComponent(filmUrl)}${partKeyParam}`,
        );
        if (!streamRes.ok) {
          const text = await streamRes.text();
          throw new Error(
            `API Hatası (extract-stream): ${text.substring(0, 150)}`,
          );
        }
        const sData = await streamRes.json();
        if (!sData.success) throw new Error(sData.error);
        setExtractStep(root, "ajax", "done");
        setExtractStep(
          root,
          "manifest",
          "done",
          sData.usedPlayer ? `(${sData.usedPlayer})` : "",
        );

        streamData = sData;
      }

      setExtractStep(root, "analyze", "active");
      const qualityParam = selectedQuality ? `&quality=${encodeURIComponent(selectedQuality)}` : "";
      const analyzeRes = await fetch(
        `/api/analyze?url=${encodeURIComponent(streamData.manifestUrl)}&referer=${encodeURIComponent(streamData.streamReferer)}${qualityParam}`,
      );
      if (!analyzeRes.ok) {
        const text = await analyzeRes.text();
        throw new Error(`API Hatası (analyze): ${text.substring(0, 150)}`);
      }
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) throw new Error(analyzeData.error);
      const estimatedSize = analyzeData.estimatedSize;
      if (estimatedSize && estimatedSize.bytes) {
        sizeLabel.textContent = `${estimatedSize.exact ? "boyut" : "tahmini boyut"}: ${formatBytes(estimatedSize.bytes)}`;
      } else {
        sizeLabel.textContent = "boyut bilinmiyor";
      }
      setExtractStep(root, "analyze", "done");

      let safeTitle = filmTitle;
      let extension = ".mp4";

      if (filmTitle.toLowerCase().endsWith(".ts")) {
        safeTitle = filmTitle.slice(0, -3);
        extension = ".ts";
      } else if (filmTitle.toLowerCase().endsWith(".mp4")) {
        safeTitle = filmTitle.slice(0, -4);
        extension = ".mp4";
      }

      safeTitle = safeTitle
        .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ\-_]/gi, "")
        .trim()
        .replace(/\s+/g, "_");
      const outputName = `${safeTitle}${extension}`;

      const candidateHosts = (streamData.candidateUrls || [])
        .map((u) => {
          try {
            return new URL(u).host;
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);

      const concurrency = candidateHosts.length > 1 ? 12 : 4;
      const suggestion = analyzeData.suggestion || { method: "none" };

      const dlRes = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: analyzeData.segments,
          method: suggestion.method || "none",
          key: suggestion.key || "",
          iv: suggestion.iv || "",
          stripBytes: suggestion.stripBytes || 0,
          concurrency,
          outputName,
          referer: streamData.streamReferer,
          candidateHosts,
          subtitles,
        }),
      });
      if (!dlRes.ok) {
        const text = await dlRes.text();
        throw new Error(`API Hatası (download): ${text.substring(0, 150)}`);
      }
      const dlData = await dlRes.json();
      if (!dlData.success) throw new Error(dlData.error);

      task.taskId = dlData.taskId;
      task.total = analyzeData.segments.length;

      progressCount.textContent = `0 / ${task.total}`;
      task.status = "waiting";
      badge.textContent = "bekliyor.";
      badge.className = "status-badge status-running dm-task-status-badge";
      updateEpisodeDownloadState(task, 0);
      updateDownloadCountBadge();

      // Sıraya başarıyla eklendi, artık resolve edebiliriz!
      resolve();

      task.interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/task-status/${task.taskId}`);
          const data = await res.json();

          progressCount.textContent = `${data.completed} / ${data.total || task.total}`;
          const pct = data.total
            ? Math.round((data.completed / data.total) * 100)
            : 0;
          progressBarFill.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          task.progress = pct;
          task.status = data.status;
          updateEpisodeDownloadState(task, pct);

          if (data.status === "running") {
            badge.textContent = "indiriliyor.";
            badge.className = "status-badge status-running dm-task-status-badge";
          } else if (data.status === "waiting") {
            badge.textContent = "bekliyor.";
            badge.className = "status-badge status-running dm-task-status-badge";
          }

          if (data.status === "completed") {
            badge.textContent = "tamamlandi.";
            badge.className = "status-badge status-success dm-task-status-badge";
            progressBarFill.style.width = "100%";
            progressPercent.textContent = "100%";
            downloadLink.classList.remove("hidden");
            downloadBtn.href = `/downloads/${data.outputName}`;
            downloadBtn.setAttribute("download", data.outputName);
            cancelBtn.remove();
            
            // Mevcut eski altyazı butonlarını temizle (varsa)
            const parent = downloadBtn.parentNode;
            parent.querySelectorAll(".sub-dl-btn").forEach(el => el.remove());
            parent.querySelectorAll(".task-play-btn").forEach(el => el.remove());

            // Oynat butonu ekle
            const playBtn = document.createElement("button");
            playBtn.className = "btn btn-primary task-play-btn";
            playBtn.style.marginLeft = "8px";
            playBtn.style.fontSize = "10px";
            playBtn.style.padding = "2px 6px";
            playBtn.innerHTML = `<i class="fa-solid fa-circle-play"></i> oynat.`;
            playBtn.addEventListener("click", () => {
              openVideoPlayer(data.outputName);
            });
            parent.appendChild(playBtn);

            // İndirilenler listesini güncelle
            fetchDownloadsList();

            // Otomatik indirmeyi tetikle
            downloadBtn.click();

            // Eğer altyazılar varsa onları da otomatik indir ve karta buton ekle
            if (data.subtitles && Array.isArray(data.subtitles)) {
              const baseName = data.outputName.replace(/\.[^/.]+$/, "");
              data.subtitles.forEach((sub, index) => {
                const subLang = sub.lang || "tr";
                const subFileName = `${baseName}.${subLang}.vtt`;
                
                // Karta manuel indirme butonu ekle
                const subBtn = document.createElement("a");
                subBtn.className = "btn btn-primary sub-dl-btn";
                subBtn.style.marginLeft = "8px";
                subBtn.style.fontSize = "11px";
                subBtn.style.padding = "4px 8px";
                subBtn.href = `/downloads/${subFileName}`;
                subBtn.setAttribute("download", subFileName);
                subBtn.innerHTML = `<i class="fa-solid fa-file-signature"></i> altyazi_${subLang}.`;
                parent.appendChild(subBtn);

                // Otomatik indirme tetikleme (tarayıcı izin verirse)
                setTimeout(() => {
                  const a = document.createElement("a");
                  a.href = `/downloads/${subFileName}`;
                  a.setAttribute("download", subFileName);
                  a.style.display = "none";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }, 800 * (index + 1));
              });
            }

            task.status = "completed";
            task.progress = 100;
            updateEpisodeDownloadState(task, 100);

            finishTask();
            updateDownloadCountBadge();
          } else if (data.status === "error" || data.status === "cancelled") {
            badge.textContent =
              data.status === "cancelled" ? "iptal edildi." : "hata.";
            badge.className =
              data.status === "cancelled"
                ? "status-badge status-cancelled dm-task-status-badge"
                : "status-badge status-error dm-task-status-badge";
            cancelBtn.remove();

            task.status = data.status;
            if (data.status === "cancelled") {
              sizeLabel.textContent = "iptal edildi; geçici dosyalar temizlendi";
            }
            updateEpisodeDownloadState(task, task.progress || 0);
            finishTask();
            updateDownloadCountBadge();
          }
        } catch (_) {}
      }, 1000);
    } catch (err) {
      badge.textContent = "hata.";
      badge.className = "status-badge status-error dm-task-status-badge";
      task.status = "error";
      sizeLabel.textContent = err.message
        ? `hata: ${err.message}`
        : "hata oluştu";
      updateEpisodeDownloadState(task, task.progress || 0);
      finishTask();
      updateDownloadCountBadge();
      resolve();
    }
  });
}

// Concurrency range updates
if (elConcurrency) {
  elConcurrency.addEventListener("input", () => {
    if (elConcurrencyVal) elConcurrencyVal.textContent = elConcurrency.value;
  });
}

// Output format change: auto-update filename extension
if (elOutputFormat && elOutputName) {
  elOutputFormat.addEventListener("change", () => {
    const fmt = elOutputFormat.value;
    const current = elOutputName.value.trim();
    if (fmt === "mp4") {
      elOutputName.value =
        current.replace(/\.ts$/i, ".mp4") || "downloaded_video.mp4";
    } else {
      elOutputName.value =
        current.replace(/\.mp4$/i, ".ts") || "downloaded_video.ts";
    }
  });
}

// Decrypt Method Changes
if (elDecryptMethod) {
  elDecryptMethod.addEventListener("change", () => {
    const method = elDecryptMethod.value;
    updateMethodInputFields(method);
    triggerHexUpdate();
  });
}

// Settings Input Changes (Triggers live Hex Decryption Preview)
if (elDecryptKey) elDecryptKey.addEventListener("input", triggerHexUpdate);
if (elStripBytes) elStripBytes.addEventListener("input", triggerHexUpdate);

function updateMethodInputFields(method) {
  const keyGroup = document.querySelector(".val-key");
  const ivGroup = document.querySelector(".val-iv");
  const stripGroup = document.querySelector(".val-strip");

  if (keyGroup) keyGroup.classList.add("hidden");
  if (ivGroup) ivGroup.classList.add("hidden");
  if (stripGroup) stripGroup.classList.add("hidden");

  if (method === "xor") {
    if (keyGroup) {
      keyGroup.classList.remove("hidden");
      const label = keyGroup.querySelector("label");
      if (label) {
        label.innerHTML = 'XOR Anahtarı <span class="help-text">(Hex: 0x55 veya 55aa, Sayı: 85, Metin: abc)</span>';
      }
    }
  } else if (method === "aes-128") {
    if (keyGroup) {
      keyGroup.classList.remove("hidden");
      const label = keyGroup.querySelector("label");
      if (label) {
        label.innerHTML = "AES Key (Hex 16 byte / 32 karakter)";
      }
    }
    if (elDecryptKey) elDecryptKey.placeholder = "Örn: 4a2f8b...";
    if (ivGroup) ivGroup.classList.remove("hidden");
  } else if (method === "strip") {
    if (stripGroup) stripGroup.classList.remove("hidden");
  }
}

function triggerHexUpdate() {
  if (!sampleBytes) return;
  const method = elDecryptMethod ? elDecryptMethod.value : "none";
  const key = elDecryptKey ? elDecryptKey.value : "";
  const stripBytes = elStripBytes ? elStripBytes.value : "0";

  // If method is auto, we preview raw bytes until applied
  const previewMethod = method === "auto" ? "none" : method;
  const decrypted = decryptBytesFrontend(sampleBytes, previewMethod, {
    key,
    stripBytes,
  });
  renderHex(decrypted);
}

// Frontend Decryption Preview Logic
function decryptBytesFrontend(bytes, method, options = {}) {
  if (method === "none") {
    return bytes;
  }
  if (method === "strip") {
    const num = parseInt(options.stripBytes || 0, 10);
    if (num >= bytes.length) return new Uint8Array(0);
    return bytes.slice(num);
  }
  if (method === "xor") {
    let keyString = options.key || "0";
    let keyBytes = [];
    if (keyString.startsWith("0x")) {
      const hex = keyString.slice(2);
      keyBytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) || [
        parseInt(hex, 16),
      ];
    } else if (/^\d+$/.test(keyString)) {
      keyBytes = [parseInt(keyString, 10)];
    } else {
      keyBytes = Array.from(keyString).map((c) => c.charCodeAt(0));
    }

    if (keyBytes.length === 0 || isNaN(keyBytes[0])) return bytes;

    const decrypted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return decrypted;
  }
  return bytes;
}

// Render Hex Viewer Grid
function renderHex(bytes) {
  let html = "";
  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const len = bytes.length;
  for (let i = 0; i < len; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(8, "0").toUpperCase();

    let hexStr = "";
    let asciiStr = "";
    for (let j = 0; j < chunk.length; j++) {
      const b = chunk[j];
      hexStr += b.toString(16).padStart(2, "0").toUpperCase() + " ";
      const isPrintable = b >= 32 && b <= 126;
      asciiStr += isPrintable ? String.fromCharCode(b) : ".";
    }
    // Kalan boşlukları görsel hizalama için doldur
    if (chunk.length < 16) {
      hexStr += "   ".repeat(16 - chunk.length);
    }

    html += `
      <div class="hex-row">
        <span class="hex-offset">${offset}</span>
        <span class="hex-val">${hexStr}</span>
        <span class="hex-char">${escapeHtml(asciiStr)}</span>
      </div>
    `;
  }
  elHexViewerGrid.innerHTML = html;
}

// Analyze Stream URL
if (elBtnAnalyze) {
  elBtnAnalyze.addEventListener("click", async () => {
    if (!elStreamUrl) return;
    const url = elStreamUrl.value.trim();
    if (!url) {
      alert("Lütfen geçerli bir URL girin.");
      return;
    }

    elBtnAnalyze.disabled = true;
    elBtnAnalyze.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin"></i> Analiz Ediliyor';
    if (elAnalysisPanel) elAnalysisPanel.classList.add("hidden");
    if (elBtnStart) elBtnStart.disabled = true;

    try {
      let referer = elCustomReferer ? elCustomReferer.value.trim() : "";

      // Set a smart default referer if not set BEFORE the API call
      if (!referer && elCustomReferer) {
        try {
          const parsed = new URL(url);
          referer = `${parsed.protocol}//${parsed.host}/`;
          elCustomReferer.value = referer;
        } catch (e) {}
      }

      const apiUrl =
        `/api/analyze?url=${encodeURIComponent(url)}` +
        (referer ? `&referer=${encodeURIComponent(referer)}` : "");

      const response = await fetch(apiUrl);
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Analiz başarısız.");
      }

      segmentList = data.segments;
      if (!segmentList || segmentList.length === 0) {
        throw new Error("Geçerli video segmenti bulunamadı.");
      }

      // Set UI with analysis results
      if (elInfoSize) elInfoSize.textContent = `${(data.size / 1024).toFixed(2)} KB (${data.size.toLocaleString()} byte)`;
      if (elInfoHex) elInfoHex.textContent = data.firstBytesHex;

      // Parse sample bytes for hex viewer
      const binaryString = atob(data.rawBytesBase64);
      sampleBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        sampleBytes[i] = binaryString.charCodeAt(i);
      }

      // Render hex
      renderHex(sampleBytes);
      if (elAnalysisPanel) elAnalysisPanel.classList.remove("hidden");

      // Handle suggestion
      detectedSuggestion = data.suggestion;
      if (detectedSuggestion && detectedSuggestion.confidence === "high") {
        if (elSuggestionText) elSuggestionText.textContent = detectedSuggestion.details;
        if (elBtnApplySuggestion) elBtnApplySuggestion.classList.remove("hidden");
      } else {
        if (elSuggestionText) elSuggestionText.textContent =
          "Otomatik şifreleme tespit edilemedi. Lütfen manuel ayarları deneyin.";
        if (elBtnApplySuggestion) elBtnApplySuggestion.classList.add("hidden");
      }

      if (elBtnStart) elBtnStart.disabled = false;
    } catch (error) {
      alert(`Analiz hatası: ${error.message}`);
    } finally {
      elBtnAnalyze.disabled = false;
      elBtnAnalyze.innerHTML =
        '<i class="fa-solid fa-magnifying-glass"></i> Analiz Et';
    }
  });
}

// Apply Suggestion Button Click
if (elBtnApplySuggestion) {
  elBtnApplySuggestion.addEventListener("click", () => {
    if (!detectedSuggestion) return;

    if (elDecryptMethod) {
      elDecryptMethod.value = detectedSuggestion.method;
      updateMethodInputFields(detectedSuggestion.method);
    }

    if (detectedSuggestion.method === "xor" && elDecryptKey) {
      elDecryptKey.value = detectedSuggestion.key;
    } else if (detectedSuggestion.method === "strip" && elStripBytes) {
      elStripBytes.value = detectedSuggestion.stripBytes;
    }

    triggerHexUpdate();
    elBtnApplySuggestion.classList.add("hidden");
    if (elSuggestionText) elSuggestionText.textContent = `Uygulandı: ${detectedSuggestion.details}`;
  });
}

// Start Download and Decrypt
if (elBtnStart) {
  elBtnStart.addEventListener("click", async () => {
    if (segmentList.length === 0) return;

    const method = elDecryptMethod ? elDecryptMethod.value : "none";
    const key = elDecryptKey ? elDecryptKey.value.trim() : "";
    const iv = elDecryptIv ? elDecryptIv.value.trim() : "";
    const stripBytes = elStripBytes ? parseInt(elStripBytes.value || 0, 10) : 0;
    const concurrency = elConcurrency ? parseInt(elConcurrency.value || 5, 10) : 5;
    const outputName = elOutputName ? elOutputName.value.trim() || "video.ts" : "video.ts";

    elBtnStart.disabled = true;
    if (elProgressPanel) elProgressPanel.classList.remove("hidden");
    if (elDownloadLinkContainer) elDownloadLinkContainer.classList.add("hidden");

    // Clear logs
    if (elLogTerminal) elLogTerminal.innerHTML = "";
    lastLogLength = 0;
    if (elProgressBarFill) elProgressBarFill.style.width = "0%";
    if (elProgressCount) elProgressCount.textContent = `0 / ${segmentList.length}`;
    if (elProgressStatus) {
      elProgressStatus.textContent = "Başlatılıyor...";
      elProgressStatus.className = "status-badge status-running";
    }

    try {
      const referer = elCustomReferer ? elCustomReferer.value.trim() : "";
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: segmentList,
          method,
          key,
          iv,
          stripBytes,
          concurrency,
          outputName,
          referer,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "İndirme görevi başlatılamadı.");
      }

      activeTaskId = data.taskId;

      // Start status polling
      pollInterval = setInterval(pollTaskStatus, 1000);
    } catch (error) {
      appendLog(`HATA: ${error.message}`);
      if (elProgressStatus) {
        elProgressStatus.textContent = "HATA";
        elProgressStatus.className = "status-badge status-error";
      }
      elBtnStart.disabled = false;
    }
  });
}

// Cancel Download
if (elBtnCancel) {
  elBtnCancel.addEventListener("click", async () => {
    if (!activeTaskId) {
      appendLog("İptal edilecek aktif görev bulunamadı.");
      return;
    }
    try {
      appendLog("Kullanıcı tarafından iptal isteği gönderildi.");
      await fetch(`/api/task-cancel/${activeTaskId}`, { method: "POST" });
    } catch (error) {
      appendLog(`İptal etme hatası: ${error.message}`);
    }
  });
}

// Poll Task Status
async function pollTaskStatus() {
  if (!activeTaskId) return;

  try {
    const response = await fetch(`/api/task-status/${activeTaskId}`);
    const task = await response.json();

    if (task.error) {
      throw new Error(task.error);
    }

    // Update Progress
    const percent = task.total > 0 ? (task.completed / task.total) * 100 : 0;
    elProgressBarFill.style.width = `${percent}%`;
    elProgressCount.textContent = `${task.completed} / ${task.total}`;

    // Render Logs
    if (task.logs && task.logs.length > lastLogLength) {
      for (let i = lastLogLength; i < task.logs.length; i++) {
        appendLog(task.logs[i]);
      }
      lastLogLength = task.logs.length;
    }

    // Status classes and text
    if (task.status === "completed") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "TAMAMLANDI";
      elProgressStatus.className = "status-badge status-completed";
      elBtnStart.disabled = false;

      elBtnDownloadFile.href = `/downloads/${task.outputName}`;
      elBtnDownloadFile.setAttribute("download", task.outputName);
      elDownloadLinkContainer.classList.remove("hidden");
      // Otomatik indirmeyi baslat
      elBtnDownloadFile.click();

      // Eğer altyazılar varsa onları da otomatik indir
      if (task.subtitles && Array.isArray(task.subtitles)) {
        const baseName = task.outputName.replace(/\.[^/.]+$/, "");
        task.subtitles.forEach((sub, index) => {
          const subLang = sub.lang || "tr";
          const subFileName = `${baseName}.${subLang}.vtt`;
          setTimeout(() => {
            const a = document.createElement("a");
            a.href = `/downloads/${subFileName}`;
            a.setAttribute("download", subFileName);
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, 300 * (index + 1));
        });
      }
    } else if (task.status === "cancelled") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "İPTAL EDİLDİ";
      elProgressStatus.className = "status-badge status-cancelled";
      elBtnStart.disabled = false;
    } else if (task.status === "error") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "HATA";
      elProgressStatus.className = "status-badge status-error";
      elBtnStart.disabled = false;
    } else {
      elProgressStatus.textContent = "İNDİRİLİYOR...";
      elProgressStatus.className = "status-badge status-running";
    }
  } catch (error) {
    appendLog(`Sorgulama Hatası: ${error.message}`);
    clearInterval(pollInterval);
    pollInterval = null;
    activeTaskId = null;
    elProgressStatus.textContent = "HATA";
    elProgressStatus.className = "status-badge status-error";
    elBtnStart.disabled = false;
  }
}

function appendLog(message) {
  const div = document.createElement("div");
  div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elLogTerminal.appendChild(div);
  elLogTerminal.scrollTop = elLogTerminal.scrollHeight;
}

// ─── DIZIYOU SERIES MANAGEMENT & UI RENDERING ─────────────────────────────

let bulkDownloadInProgress = false; // flag to prevent concurrent bulk runs

// Show series detail modal
async function showSeriesDetails(url, title) {
  elModalSeriesTitle.textContent = title;
  elModalSeasonsBar.innerHTML = "";
  elModalEpisodesList.innerHTML =
    '<div class="options-loading"><i class="fa-solid fa-spinner fa-spin"></i> sezonlar yükleniyor...</div>';
  elBulkDownloadPanel.classList.add("hidden");
  elSeriesModal.classList.remove("hidden");

  try {
    const response = await fetch(
      `/api/series-detail?url=${encodeURIComponent(url)}`,
    );
    const data = await response.json();
    if (!data.success || data.seasons.length === 0) {
      elModalEpisodesList.innerHTML =
        '<div class="search-empty" style="color: var(--accent-red);">Bölüm bilgisi alınamadı.</div>';
      return;
    }

    renderSeasonsAndEpisodes(data.seasons, title);
  } catch (err) {
    elModalEpisodesList.innerHTML = `<div class="search-empty" style="color: var(--accent-red);">Hata: ${err.message}</div>`;
  }
}

// Render seasons bar and episodes
function renderSeasonsAndEpisodes(seasons, seriesTitle) {
  elModalSeasonsBar.innerHTML = "";

  // Render season buttons
  seasons.forEach((s, index) => {
    const btn = document.createElement("button");
    btn.className = `season-btn ${index === 0 ? "active" : ""}`;
    btn.textContent = `${s.season}. Sezon`;
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".season-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadSeasonAndEpisodes(s.episodes, seriesTitle);
    });
    elModalSeasonsBar.appendChild(btn);
  });

  // Load first season by default
  loadSeasonAndEpisodes(seasons[0].episodes, seriesTitle);
}

// Load season resources first (extract options from first episode) then render
async function loadSeasonAndEpisodes(episodes, seriesTitle) {
  elModalEpisodesList.innerHTML =
    '<div class="options-loading"><i class="fa-solid fa-spinner fa-spin"></i> bölümler ve yayın seçenekleri yükleniyor...</div>';
  elBulkDownloadPanel.classList.add("hidden");

  if (episodes.length === 0) {
    elModalEpisodesList.innerHTML =
      '<div class="search-empty">Bölüm bulunamadı.</div>';
    return;
  }

  let streams = null;
  let lastExtractError = "";
  const probeEpisodes = episodes.slice(0, Math.min(episodes.length, 3));

  for (const episode of probeEpisodes) {
    try {
      if (episodeDetailsCache.has(episode.url)) {
        streams = episodeDetailsCache.get(episode.url);
        break;
      }

      const response = await fetch(
        `/api/extract-series-video?url=${encodeURIComponent(episode.url)}&t=${Date.now()}`,
      );
      const data = await response.json();
      if (data.success && data.streams.length > 0) {
        streams = data.streams;
        episodeDetailsCache.set(episode.url, streams);
        break;
      }
      lastExtractError = data.error || "Yayın kaynağı bulunamadı.";
    } catch (e) {
      lastExtractError = e.message;
      console.error("Yayın seçenekleri önceden yüklenemedi:", e.message);
    }
  }

  if (!streams) {
    elModalEpisodesList.innerHTML = `<div class="search-empty" style="color: var(--accent-red);">Yayın seçenekleri alınamadı: ${lastExtractError || "bilinmeyen hata"}</div>`;
    return;
  }

  // Populate Sezon Indir controls using these streams
  populateBulkPanelOptions(streams);

  // Render episodes directly with the loaded streams
  renderEpisodes(episodes, seriesTitle, streams);
}

function populateBulkPanelOptions(streams) {
  elBulkLang.innerHTML = "";
  elBulkQuality.innerHTML = "";

  // Fill languages
  streams.forEach((stream) => {
    const opt = document.createElement("option");
    opt.value = stream.name;
    opt.textContent = stream.name;
    elBulkLang.appendChild(opt);
  });

  // Fill qualities for the selected/first language
  const updateQualities = () => {
    elBulkQuality.innerHTML = "";
    const selectedLangName = elBulkLang.value;
    const selectedStream = streams.find((s) => s.name === selectedLangName);
    if (selectedStream && selectedStream.qualities) {
      selectedStream.qualities.forEach((q) => {
        const opt = document.createElement("option");
        opt.value = q.resolution;
        opt.textContent = q.resolution;
        elBulkQuality.appendChild(opt);
      });
    }

    // Load saved quality if available
    const savedQuality = localStorage.getItem("bulk_quality");
    if (
      savedQuality &&
      Array.from(elBulkQuality.options).some((o) => o.value === savedQuality)
    ) {
      elBulkQuality.value = savedQuality;
    }

    syncOpenEpisodeDropdowns();
  };

  elBulkLang.onchange = () => {
    localStorage.setItem("bulk_lang", elBulkLang.value);
    updateQualities();
  };

  elBulkQuality.onchange = () => {
    localStorage.setItem("bulk_quality", elBulkQuality.value);
    syncOpenEpisodeDropdowns();
  };

  // Load saved language if available
  const savedLang = localStorage.getItem("bulk_lang");
  if (
    savedLang &&
    Array.from(elBulkLang.options).some((o) => o.value === savedLang)
  ) {
    elBulkLang.value = savedLang;
  }

  updateQualities();
  elBulkDownloadPanel.classList.remove("hidden");
}

// Render episodes directly with loaded streams (no empty selects, no latency!)
function renderEpisodes(episodes, seriesTitle, streams) {
  elModalEpisodesList.innerHTML = "";
  activeSeasonEpisodes = episodes;

  episodes.forEach((ep) => {
    const item = document.createElement("div");
    item.className = "episode-item";
    item.dataset.url = ep.url;
    item.dataset.title = ep.title;

    // Add progress overlay div
    const progressOverlay = document.createElement("div");
    progressOverlay.className = "episode-progress-overlay";
    item.appendChild(progressOverlay);

    const mainBar = document.createElement("div");
    mainBar.className = "episode-main";

    let langOptionsHtml = "";
    streams.forEach((s) => {
      langOptionsHtml += `<option value="${s.name}">${s.name}</option>`;
    });

    const activeLang = elBulkLang.value || (streams[0] ? streams[0].name : "");
    const selectedStream =
      streams.find((s) => s.name === activeLang) || streams[0];

    let qualityOptionsHtml = "";
    if (selectedStream && selectedStream.qualities) {
      selectedStream.qualities.forEach((q) => {
        qualityOptionsHtml += `<option value="${q.resolution}">${q.resolution}</option>`;
      });
    }

    mainBar.innerHTML = `
      <div class="episode-title">
        <span>${ep.season}. Sezon ${ep.episode}. Bölüm</span>
        <span class="episode-name">${ep.name}</span>
      </div>
      <div class="episode-controls">
        <select class="ep-lang-select" data-ep-url="${ep.url}">
          ${langOptionsHtml}
        </select>
        <select class="ep-quality-select" data-ep-url="${ep.url}">
          ${qualityOptionsHtml}
        </select>
        <button class="btn btn-primary ep-dl-btn" data-ep-url="${ep.url}">
          ${SVG_DOWNLOAD_ICON} indir.
        </button>
        <button class="btn btn-danger ep-cancel-btn hidden" data-ep-url="${ep.url}">
          <i class="fa-solid fa-xmark"></i> iptal.
        </button>
      </div>
    `;

    item.appendChild(mainBar);
    elModalEpisodesList.appendChild(item);

    const langSelect = mainBar.querySelector(".ep-lang-select");
    const qualitySelect = mainBar.querySelector(".ep-quality-select");

    // Sync values with bulk panel initially
    if (activeLang) langSelect.value = activeLang;
    const activeQuality = elBulkQuality.value;
    if (
      activeQuality &&
      Array.from(qualitySelect.options).some((o) => o.value === activeQuality)
    ) {
      qualitySelect.value = activeQuality;
    }

    const bindActiveTaskForCurrentSelection = () => {
      const activeTaskUrl = episodeDownloadTasksByEpisodeUrl.get(ep.url);
      const activeTask = activeTaskUrl
        ? downloadTasksByUrl.get(activeTaskUrl)
        : null;
      if (activeTask) {
        bindTaskToEpisodeItem(activeTask, item);
      } else {
        const overlay = item.querySelector(".episode-progress-overlay");
        if (overlay) {
          overlay.style.width = "0%";
          overlay.style.background = "rgba(255, 110, 64, 0.15)";
        }
        const dlBtn = mainBar.querySelector(".ep-dl-btn");
        const cancelBtn = mainBar.querySelector(".ep-cancel-btn");
        if (dlBtn && cancelBtn) {
          dlBtn.classList.remove("hidden");
          cancelBtn.classList.add("hidden");
        }
      }
    };

    langSelect.addEventListener("change", () => {
      qualitySelect.innerHTML = "";
      const stream = streams.find((s) => s.name === langSelect.value);
      if (stream && stream.qualities) {
        stream.qualities.forEach((q) => {
          const opt = document.createElement("option");
          opt.value = q.resolution;
          opt.textContent = q.resolution;
          qualitySelect.appendChild(opt);
        });
      }
      if (
        elBulkQuality.value &&
        Array.from(qualitySelect.options).some(
          (o) => o.value === elBulkQuality.value,
        )
      ) {
        qualitySelect.value = elBulkQuality.value;
      }
      bindActiveTaskForCurrentSelection();
    });

    qualitySelect.addEventListener("change", bindActiveTaskForCurrentSelection);

    const dlBtn = mainBar.querySelector(".ep-dl-btn");
    const cancelBtn = mainBar.querySelector(".ep-cancel-btn");
    dlBtn.addEventListener("click", () => {
      startEpisodeDownload(ep.url, langSelect.value, qualitySelect.value, item);
    });
    cancelBtn.addEventListener("click", async () => {
      const activeTaskUrl = episodeDownloadTasksByEpisodeUrl.get(ep.url);
      const activeTask = activeTaskUrl
        ? downloadTasksByUrl.get(activeTaskUrl)
        : null;
      if (activeTask && activeTask.taskId) {
        await fetch(`/api/task-cancel/${activeTask.taskId}`, {
          method: "POST",
        });
      }
    });
    bindActiveTaskForCurrentSelection();
  });
}

// Sync open episode selects if bulk selections change
function syncOpenEpisodeDropdowns() {
  const activeLang = elBulkLang.value;
  const activeQuality = elBulkQuality.value;

  const epLangSelects = document.querySelectorAll(".ep-lang-select");
  epLangSelects.forEach((select) => {
    if (
      select.value !== activeLang &&
      Array.from(select.options).some((o) => o.value === activeLang)
    ) {
      select.value = activeLang;
      select.dispatchEvent(new Event("change"));
    }
  });

  const epQualitySelects = document.querySelectorAll(".ep-quality-select");
  epQualitySelects.forEach((select) => {
    if (
      select.value !== activeQuality &&
      Array.from(select.options).some((o) => o.value === activeQuality)
    ) {
      select.value = activeQuality;
      select.dispatchEvent(new Event("change"));
    }
  });
}

// Start single episode download logic
async function startEpisodeDownload(
  episodeUrl,
  selectedLang,
  selectedQuality,
  itemElement,
) {
  const seriesTitle = elModalSeriesTitle.textContent;
  const epTitle = itemElement.querySelector(
    ".episode-title span:first-child",
  ).textContent;

  const btn = itemElement.querySelector(".ep-dl-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  try {
    let streams = null;
    if (episodeDetailsCache.has(episodeUrl)) {
      streams = episodeDetailsCache.get(episodeUrl);
    } else {
      const response = await fetch(
        `/api/extract-series-video?url=${encodeURIComponent(episodeUrl)}&t=${Date.now()}`,
      );
      const data = await response.json();
      if (data.success && data.streams.length > 0) {
        streams = data.streams;
        episodeDetailsCache.set(episodeUrl, streams);
      }
    }

    if (streams) {
      const targetStream = streams.find((s) => s.name === selectedLang);
      if (targetStream && targetStream.qualities) {
        const targetQuality =
          targetStream.qualities.find(
            (q) => q.resolution === selectedQuality,
          ) || targetStream.qualities[0];
        if (targetQuality) {
          const cleanSeriesName = seriesTitle
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_");

          const sMatch = epTitle.match(/(\d+)\.\s*Sezon/i);
          const eMatch = epTitle.match(/(\d+)\.\s*Bölüm/i);
          const pad = (num) => String(num).padStart(2, "0");
          const sNum = sMatch ? pad(sMatch[1]) : "01";
          const eNum = eMatch ? pad(eMatch[1]) : "01";

          const qClean = targetQuality.resolution.replace(/[^a-zA-Z0-9]/g, "");
          const cleanStreamName = targetStream.name
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/_+/g, "_");
          const outputName = `${cleanSeriesName}_S${sNum}E${eNum}_${cleanStreamName}_${qClean}.ts`;

          // Trigger download in parallel while passing the UI element for background color progress fill!
          autoDownloadFilm(
            targetQuality.m3u8Url,
            outputName,
            targetStream.subtitles || [],
            itemElement,
            episodeUrl,
          );
        }
      }
    }
  } catch (e) {
    console.error("İndirme başlatılamadı:", e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${SVG_DOWNLOAD_ICON} indir.`;
  }
}

// Download subtitle file directly in the browser
function downloadSubtitleInBrowser(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Bulk Download Handler
elBtnBulkDownload.addEventListener("click", async () => {
  if (bulkDownloadInProgress) return;
  if (activeSeasonEpisodes.length === 0) return;

  const selectedLang = elBulkLang.value;
  const selectedQuality = elBulkQuality.value;
  const seriesTitle = elModalSeriesTitle.textContent;

  const confirmed = await showCustomConfirm(
    `${seriesTitle} dizisinin bu sezonundaki tüm bölümler (${activeSeasonEpisodes.length} adet) toplu olarak sıraya eklenecektir. Onaylıyor musunuz?`,
  );
  if (!confirmed) {
    return;
  }

  bulkDownloadInProgress = true;
  elBtnBulkDownload.disabled = true;
  elBtnBulkDownload.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> sıraya ekleniyor...';

  // Keep modal open on bulk start (commented out)
  // elSeriesModal.classList.add("hidden");

  // Keep a status alert on UI or chrome manager
  const alertBox = document.createElement("div");
  alertBox.className = "dm-task-item";
  alertBox.style.background = "var(--surface-container-low)";
  alertBox.innerHTML = `
    <div style="font-family: monospace; font-size: 11px; color: var(--primary);">
      <i class="fa-solid fa-spinner fa-spin"></i> Sezon kuyruğa ekleniyor...
    </div>
  `;
  const emptyMsg = elDmTasksList.querySelector(".dm-empty");
  if (emptyMsg) emptyMsg.remove();
  elDmTasksList.prepend(alertBox);

  try {
    const tasksToRun = [];

    for (let i = 0; i < activeSeasonEpisodes.length; i++) {
      const ep = activeSeasonEpisodes[i];

      try {
        let streams = null;
        if (episodeDetailsCache.has(ep.url)) {
          streams = episodeDetailsCache.get(ep.url);
        } else {
          let attempts = 0;
          while (attempts < 3 && !streams) {
            try {
              attempts++;
              const response = await fetch(
                `/api/extract-series-video?url=${encodeURIComponent(ep.url)}&t=${Date.now()}`,
              );
              const data = await response.json();
              if (data.success && data.streams && data.streams.length > 0) {
                streams = data.streams;
                episodeDetailsCache.set(ep.url, streams);
              } else {
                if (attempts < 3) await new Promise((r) => setTimeout(r, 1000));
              }
            } catch (e) {
              console.warn(`Extraction denemesi #${attempts} başarısız:`, e.message);
              if (attempts < 3) await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }

        if (streams) {
          const targetStream = streams.find((s) => s.name === selectedLang);
          if (targetStream && targetStream.qualities) {
            const targetQuality =
              targetStream.qualities.find(
                (q) => q.resolution === selectedQuality,
              ) || targetStream.qualities[0];

            if (targetQuality) {
              const cleanSeriesName = seriesTitle
                .replace(/[^a-zA-Z0-9]/g, "_")
                .replace(/_+/g, "_");
              const pad = (num) => String(num).padStart(2, "0");
              const qClean = targetQuality.resolution.replace(
                /[^a-zA-Z0-9]/g,
                "",
              );
              const cleanStreamName = targetStream.name
                .replace(/[^a-zA-Z0-9]/g, "_")
                .replace(/_+/g, "_");
              const outputName = `${cleanSeriesName}_S${pad(ep.season)}E${pad(ep.episode)}_${cleanStreamName}_${qClean}.ts`;

              // Find episode item DOM if open (though modal is hidden, they are in DOM)
              const items = document.querySelectorAll(".episode-item");
              let epItem = null;
              items.forEach((el) => {
                if (el.dataset.url === ep.url) epItem = el;
              });

              tasksToRun.push({
                url: targetQuality.m3u8Url,
                title: outputName,
                subtitles: targetStream.subtitles || [],
                itemElement: epItem,
                episodeUrl: ep.url
              });
            }
          }
        }
      } catch (epErr) {
        console.error(
          "Bölüm toplu indirme sırasına eklenirken hata:",
          epErr.message,
        );
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    // Tüm görevleri sırayla kuyruğa ekle
    if (tasksToRun.length > 0) {
      for (let idx = 0; idx < tasksToRun.length; idx++) {
        const t = tasksToRun[idx];

        alertBox.innerHTML = `
          <div style="font-family: monospace; font-size: 11px; color: var(--primary);">
            <i class="fa-solid fa-spinner fa-spin"></i> Bölüm ${idx + 1}/${tasksToRun.length} sıraya ekleniyor...
          </div>
        `;

        await autoDownloadFilm(
          t.url,
          t.title,
          t.subtitles,
          t.itemElement,
          t.episodeUrl
        );

        await new Promise((r) => setTimeout(r, 100));
      }
    }

    alertBox.innerHTML = `
      <div style="font-family: monospace; font-size: 11px; color: var(--technical-green);">
        <i class="fa-solid fa-circle-check"></i> Tüm sezon sıraya eklendi.
      </div>
    `;
    setTimeout(() => alertBox.remove(), 4000);
  } catch (err) {
    alertBox.innerHTML = `
      <div style="font-family: monospace; font-size: 11px; color: var(--accent-red);">
        <i class="fa-solid fa-triangle-exclamation"></i> Sezon indirme hatası!
      </div>
    `;
    setTimeout(() => alertBox.remove(), 4000);
  } finally {
    bulkDownloadInProgress = false;
    elBtnBulkDownload.disabled = false;
    elBtnBulkDownload.innerHTML = `${SVG_DOWNLOAD_ICON} sezonu_indir.`;
  }
});

// Custom Confirm Modal Logic
function showCustomConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-confirm-modal");
    const textEl = document.getElementById("custom-confirm-text");
    const btnYes = document.getElementById("btn-confirm-yes");
    const btnNo = document.getElementById("btn-confirm-no");

    if (!modal || !textEl || !btnYes || !btnNo) {
      // Fallback to standard confirm if element is not in DOM
      resolve(confirm(message));
      return;
    }

    textEl.textContent = message;
    modal.classList.remove("hidden");

    const onYes = () => {
      modal.classList.add("hidden");
      resolve(true);
    };
    const onNo = () => {
      modal.classList.add("hidden");
      resolve(false);
    };

    btnYes.addEventListener("click", onYes, { once: true });
    btnNo.addEventListener("click", onNo, { once: true });
  });
}

// Film Details Modal Panel
async function showFilmDetails(url, title) {
  elModalSeriesTitle.textContent = title;
  elModalSeasonsBar.innerHTML = "";
  elModalEpisodesList.innerHTML =
    '<div class="options-loading"><i class="fa-solid fa-spinner fa-spin"></i> kaynaklar yükleniyor...</div>';
  elBulkDownloadPanel.classList.add("hidden");
  elSeriesModal.classList.remove("hidden");

  try {
    const playerRes = await fetch(
      `/api/extract-player?url=${encodeURIComponent(url)}`,
    );
    const playerData = await playerRes.json();
    if (!playerData.success || !playerData.languages || playerData.languages.length === 0) {
      elModalEpisodesList.innerHTML =
        '<div class="search-empty" style="color: var(--accent-red);">Film kaynakları alınamadı.</div>';
      return;
    }

    renderFilmSources(url, title, playerData);
  } catch (err) {
    elModalEpisodesList.innerHTML = `<div class="search-empty" style="color: var(--accent-red);">Hata: ${err.message}</div>`;
  }
}

// Render Film Sources and Download Controls
function renderFilmSources(filmUrl, filmTitle, playerData) {
  elModalEpisodesList.innerHTML = "";

  const item = document.createElement("div");
  item.className = "episode-item";
  item.dataset.url = filmUrl;
  item.dataset.title = filmTitle;

  const progressOverlay = document.createElement("div");
  progressOverlay.className = "episode-progress-overlay";
  item.appendChild(progressOverlay);

  const mainBar = document.createElement("div");
  mainBar.className = "episode-main";

  let langOptionsHtml = "";
  playerData.languages.forEach((l) => {
    langOptionsHtml += `<option value="${l.key}">${l.label}</option>`;
  });

  const defaultQualities = ["1080p", "720p", "480p", "360p"];
  let qualityOptionsHtml = "";
  defaultQualities.forEach((q) => {
    qualityOptionsHtml += `<option value="${q}">${q}</option>`;
  });

  mainBar.innerHTML = `
    <div class="episode-title">
      <span>film_kaynagi.</span>
      <span class="episode-name">${filmTitle}</span>
    </div>
    <div class="episode-controls">
      <select class="ep-lang-select" style="min-width: 130px; padding-right: 1.5rem;">
        ${langOptionsHtml}
      </select>
      <select class="ep-source-select" style="min-width: 90px; padding-right: 1.5rem;">
        <!-- Dinamik olarak dolacak -->
      </select>
      <select class="ep-quality-select" style="padding-right: 1.5rem;">
        ${qualityOptionsHtml}
      </select>
      <button class="btn btn-primary ep-dl-btn">
        ${SVG_DOWNLOAD_ICON} indir.
      </button>
      <button class="btn btn-danger ep-cancel-btn hidden">
        <i class="fa-solid fa-xmark"></i> iptal.
      </button>
    </div>
  `;

  item.appendChild(mainBar);
  elModalEpisodesList.appendChild(item);

  const langSelect = mainBar.querySelector(".ep-lang-select");
  const sourceSelect = mainBar.querySelector(".ep-source-select");
  const qualitySelect = mainBar.querySelector(".ep-quality-select");
  const dlBtn = mainBar.querySelector(".ep-dl-btn");
  const cancelBtn = mainBar.querySelector(".ep-cancel-btn");

  const updateSources = () => {
    sourceSelect.innerHTML = "";
    const selectedLangKey = langSelect.value;
    const playersForLang = playerData.sources[selectedLangKey] || [];
    playersForLang.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      sourceSelect.appendChild(opt);
    });
  };

  langSelect.addEventListener("change", updateSources);
  updateSources();

  const activeTask = downloadTasksByUrl.get(filmUrl);
  if (activeTask) {
    bindTaskToEpisodeItem(activeTask, item);
  }

  dlBtn.addEventListener("click", async () => {
    const selectedLangKey = langSelect.value;
    const selectedPlayer = sourceSelect.value;
    const selectedQuality = qualitySelect.value;
    dlBtn.disabled = true;
    dlBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> başlatılıyor...';

    try {
      const ajaxUrl = `/api/extract-stream?postId=${playerData.postId}&nonce=${playerData.nonce}&player=${encodeURIComponent(selectedPlayer)}&filmUrl=${encodeURIComponent(filmUrl)}&partKey=${encodeURIComponent(selectedLangKey)}`;
      const streamRes = await fetch(ajaxUrl);
      const sData = await streamRes.json();
      if (!sData.success) throw new Error(sData.error || "Kaynak çözülemedi.");

      const cleanTitle = filmTitle
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_+/g, "_");
      
      const outputName = `${cleanTitle}_${selectedPlayer}_${selectedQuality}.ts`;

      autoDownloadFilm(
        sData.manifestUrl,
        outputName,
        [],
        item,
        filmUrl,
        selectedQuality,
        sData.streamReferer
      );

    } catch (e) {
      alert(`İndirme başlatılamadı: ${e.message}`);
      dlBtn.disabled = false;
      dlBtn.innerHTML = `${SVG_DOWNLOAD_ICON} indir.`;
    }
  });

  cancelBtn.addEventListener("click", async () => {
    const activeTask = downloadTasksByUrl.get(filmUrl);
    if (activeTask && activeTask.taskId) {
      await fetch(`/api/task-cancel/${activeTask.taskId}`, { method: "POST" });
    }
  });
}

// ─── CUSTOM VIDEO PLAYER & DOWNLOADS LIST LOGIC ─────────────────────────────

// Video Player DOM Elements
const elVideoPlayerModal = document.getElementById("video-player-modal");
const elVideoPlayerTitle = document.getElementById("video-player-title");
const elBtnCloseVideo = document.getElementById("btn-close-video");
const elMainVideo = document.getElementById("main-video-element");
const elBtnVideoPlay = document.getElementById("btn-video-play");
const elBtnVideoRewind = document.getElementById("btn-video-rewind");
const elBtnVideoForward = document.getElementById("btn-video-forward");
const elBtnVideoMute = document.getElementById("btn-video-mute");
const elVideoVolumeSlider = document.getElementById("video-volume-slider");
const elVideoCurrentTime = document.getElementById("video-current-time");
const elVideoDuration = document.getElementById("video-duration");
const elBtnVideoPip = document.getElementById("btn-video-pip");
const elBtnVideoFullscreen = document.getElementById("btn-video-fullscreen");
const elVideoControlsOverlay = document.getElementById("video-controls-overlay");
const elVideoTimelineWrapper = document.getElementById("video-timeline-wrapper");
const elVideoTimelineBg = document.getElementById("video-timeline-bg");
const elVideoTimelineFill = document.getElementById("video-timeline-fill");
const elVideoTimelineHandle = document.getElementById("video-timeline-handle");

// Downloads Panel DOM Element
const elDownloadsList = document.getElementById("downloads-list");

// Fetch and Render Downloaded Videos
async function fetchDownloadsList() {
  if (!elDownloadsList) return;
  try {
    const res = await fetch("/api/downloads-list");
    const data = await res.json();
    if (data.success) {
      renderDownloadsList(data.files);
    }
  } catch (err) {
    console.error("İndirilenler listesi yüklenemedi:", err);
  }
}

function renderDownloadsList(files) {
  if (!elDownloadsList) return;
  if (!files || files.length === 0) {
    elDownloadsList.innerHTML = `
      <div class="downloads-empty">
        <i class="fa-solid fa-folder-minus" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.3;"></i>
        indirilen video bulunamadı.
      </div>
    `;
    return;
  }

  elDownloadsList.innerHTML = files.map(file => {
    const displaySize = formatBytes(file.size);
    const dateStr = new Date(file.createdAt).toLocaleDateString("tr-TR");
    return `
      <div class="download-item">
        <div class="download-item-info">
          <span class="download-item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <div class="download-item-meta">
            <span>boyut: ${displaySize}</span>
            <span>tarih: ${dateStr}</span>
          </div>
        </div>
        <div class="download-item-actions">
          <button class="btn btn-primary btn-small play-video-btn" data-file="${escapeHtml(file.name)}">
            <i class="fa-solid fa-play"></i> oynat.
          </button>
        </div>
      </div>
    `;
  }).join("");

  elDownloadsList.querySelectorAll(".play-video-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const fileName = btn.dataset.file;
      openVideoPlayer(fileName);
    });
  });
}

// Open Video Player Modal
function openVideoPlayer(fileName) {
  const isTs = fileName.toLowerCase().endsWith(".ts");
  let videoSrc = "";

  if (isTs) {
    // TS files: use stream API on server
    videoSrc = `/api/stream-ts?file=${encodeURIComponent(fileName)}`;
  } else {
    // MP4 files: static serve
    videoSrc = `/downloads/${encodeURIComponent(fileName)}`;
  }

  elVideoPlayerTitle.textContent = fileName;
  elMainVideo.src = videoSrc;
  elVideoPlayerModal.classList.remove("hidden");
  
  // Auto play
  elMainVideo.play().catch(err => {
    console.log("Otomatik oynatma engellendi:", err);
  });

  updatePlayPauseIcon();
  
  // Listen keyboard shortcuts globally when player is open
  document.addEventListener("keydown", handleVideoKeydown);
}

// Close Video Player Modal
function closeVideoPlayer() {
  elMainVideo.pause();
  elMainVideo.src = "";
  elVideoPlayerModal.classList.add("hidden");
  document.removeEventListener("keydown", handleVideoKeydown);
}

if (elBtnCloseVideo) {
  elBtnCloseVideo.addEventListener("click", closeVideoPlayer);
}

// Play & Pause Controls
function togglePlay() {
  if (elMainVideo.paused) {
    elMainVideo.play();
  } else {
    elMainVideo.pause();
  }
  updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
  if (!elBtnVideoPlay) return;
  const icon = elBtnVideoPlay.querySelector("i");
  if (elMainVideo.paused) {
    icon.className = "fa-solid fa-play";
  } else {
    icon.className = "fa-solid fa-pause";
  }
}

if (elBtnVideoPlay) elBtnVideoPlay.addEventListener("click", togglePlay);
if (elMainVideo) {
  elMainVideo.addEventListener("click", togglePlay);
  elMainVideo.addEventListener("play", updatePlayPauseIcon);
  elMainVideo.addEventListener("pause", updatePlayPauseIcon);
}

// Rewind & Forward
if (elBtnVideoRewind) {
  elBtnVideoRewind.addEventListener("click", () => {
    elMainVideo.currentTime = Math.max(0, elMainVideo.currentTime - 10);
  });
}

if (elBtnVideoForward) {
  elBtnVideoForward.addEventListener("click", () => {
    elMainVideo.currentTime = Math.min(elMainVideo.duration, elMainVideo.currentTime + 10);
  });
}

// Volume & Mute Controls
function updateVolumeIcon() {
  if (!elBtnVideoMute) return;
  const icon = elBtnVideoMute.querySelector("i");
  if (elMainVideo.muted || elMainVideo.volume === 0) {
    icon.className = "fa-solid fa-volume-xmark";
    elVideoVolumeSlider.value = 0;
  } else if (elMainVideo.volume < 0.5) {
    icon.className = "fa-solid fa-volume-low";
    elVideoVolumeSlider.value = elMainVideo.volume;
  } else {
    icon.className = "fa-solid fa-volume-high";
    elVideoVolumeSlider.value = elMainVideo.volume;
  }
}

if (elBtnVideoMute) {
  elBtnVideoMute.addEventListener("click", () => {
    elMainVideo.muted = !elMainVideo.muted;
    updateVolumeIcon();
  });
}

if (elVideoVolumeSlider) {
  elVideoVolumeSlider.addEventListener("input", (e) => {
    elMainVideo.volume = e.target.value;
    elMainVideo.muted = e.target.value == 0;
    updateVolumeIcon();
  });
}

// Formatting Duration to HH:MM:SS
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

if (elMainVideo) {
  elMainVideo.addEventListener("loadedmetadata", () => {
    elVideoDuration.textContent = formatTime(elMainVideo.duration);
  });

  elMainVideo.addEventListener("timeupdate", () => {
    elVideoCurrentTime.textContent = formatTime(elMainVideo.currentTime);
    if (elMainVideo.duration) {
      const pct = (elMainVideo.currentTime / elMainVideo.duration) * 100;
      if (elVideoTimelineFill) elVideoTimelineFill.style.width = `${pct}%`;
      if (elVideoTimelineHandle) elVideoTimelineHandle.style.left = `${pct}%`;
    }
  });
}

// Seek Timeline
if (elVideoTimelineWrapper) {
  elVideoTimelineWrapper.addEventListener("click", (e) => {
    const rect = elVideoTimelineBg.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    elMainVideo.currentTime = pos * elMainVideo.duration;
  });
}

// Picture-in-Picture
if (elBtnVideoPip) {
  elBtnVideoPip.addEventListener("click", async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (elMainVideo.readyState >= 1) {
        await elMainVideo.requestPictureInPicture();
      }
    } catch (err) {
      console.error("PiP hatası:", err);
    }
  });
}

// Fullscreen Controls
function toggleFullscreen() {
  const container = elMainVideo.parentElement;
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error("Tam ekran hatası:", err);
    });
  } else {
    document.exitFullscreen();
  }
}

if (elBtnVideoFullscreen) elBtnVideoFullscreen.addEventListener("click", toggleFullscreen);
if (elMainVideo) elMainVideo.addEventListener("dblclick", toggleFullscreen);

// Hide controls overlay after 3 seconds of inactivity
let controlsTimeout = null;
function showControls() {
  if (!elVideoControlsOverlay) return;
  elVideoControlsOverlay.classList.add("visible");
  clearTimeout(controlsTimeout);
  if (!elMainVideo.paused) {
    controlsTimeout = setTimeout(() => {
      elVideoControlsOverlay.classList.remove("visible");
    }, 3000);
  }
}

if (elMainVideo) {
  const container = elMainVideo.parentElement;
  container.addEventListener("mousemove", showControls);
  container.addEventListener("click", showControls);
  elMainVideo.addEventListener("play", showControls);
  elMainVideo.addEventListener("pause", showControls);
}

// Keyboard Listeners
function handleVideoKeydown(e) {
  if (elVideoPlayerModal.classList.contains("hidden")) return;
  
  const key = e.key.toLowerCase();
  if (key === " ") {
    e.preventDefault();
    togglePlay();
  } else if (key === "arrowleft") {
    e.preventDefault();
    elMainVideo.currentTime = Math.max(0, elMainVideo.currentTime - 10);
  } else if (key === "arrowright") {
    e.preventDefault();
    elMainVideo.currentTime = Math.min(elMainVideo.duration, elMainVideo.currentTime + 10);
  } else if (key === "arrowup") {
    e.preventDefault();
    elMainVideo.volume = Math.min(1, elMainVideo.volume + 0.05);
    if (elVideoVolumeSlider) elVideoVolumeSlider.value = elMainVideo.volume;
    updateVolumeIcon();
  } else if (key === "arrowdown") {
    e.preventDefault();
    elMainVideo.volume = Math.max(0, elMainVideo.volume - 0.05);
    if (elVideoVolumeSlider) elVideoVolumeSlider.value = elMainVideo.volume;
    updateVolumeIcon();
  } else if (key === "f") {
    e.preventDefault();
    toggleFullscreen();
  } else if (key === "escape") {
    if (!document.fullscreenElement) {
      closeVideoPlayer();
    }
  }
}

// Initialization on DOM load
window.addEventListener("DOMContentLoaded", () => {
  fetchDownloadsList();
});
