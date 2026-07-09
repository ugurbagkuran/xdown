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
    document.querySelectorAll(".type-btn").forEach((b) => {
      b.className = "type-btn px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant hover:text-on-surface transition-all";
    });
    btn.className = "type-btn px-4 py-2 rounded-full text-xs font-bold bg-primary-container text-black transition-all";
    activeSearchType = btn.dataset.type;

    if (activeSearchType === "series") {
      elSearchInput.placeholder =
        "aranacak dizi adını girin (Breaking Bad, vb.)...";
    } else {
      elSearchInput.placeholder = "aranacak film adını girin...";
    }
  });
});

// ─── TAB MANAGEMENT ─────────────────────────────────────────────────────────
const tabPanels = document.querySelectorAll(".tab-panel");
const desktopNavBtns = document.querySelectorAll("aside button[data-tab]");
const mobileNavBtns = document.querySelectorAll("#mobile-nav button[data-tab]");
const elHeaderTitle = document.getElementById("header-title");
const elHeaderIcon = document.getElementById("header-icon");

function switchTab(tabId) {
  tabPanels.forEach(p => p.classList.add("hidden"));
  const activePanel = document.getElementById(tabId);
  if (activePanel) activePanel.classList.remove("hidden");

  desktopNavBtns.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.className = "nav-tab-btn flex items-center gap-3 px-4 py-3 bg-secondary-container text-on-secondary-container rounded-xl font-bold transition-all text-sm text-left w-full scale-95 duration-150";
    } else {
      btn.className = "nav-tab-btn flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-variant rounded-xl transition-all text-sm text-left w-full";
    }
  });

  mobileNavBtns.forEach(btn => {
    if (btn.dataset.tab === tabId) {
      btn.className = "nav-tab-btn text-primary-container font-bold border-b-2 border-primary-container pb-2 text-sm whitespace-nowrap";
    } else {
      btn.className = "nav-tab-btn text-on-surface-variant font-medium pb-2 text-sm whitespace-nowrap";
    }
  });

  if (tabId === "tab-search") {
    if (elHeaderTitle) elHeaderTitle.textContent = "film_indirme.";
    if (elHeaderIcon) elHeaderIcon.textContent = "download";
  } else if (tabId === "tab-library") {
    if (elHeaderTitle) elHeaderTitle.textContent = "kütüphane_";
    if (elHeaderIcon) elHeaderIcon.textContent = "movie_filter";
    fetchDownloadsList();
  }
}

desktopNavBtns.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
mobileNavBtns.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

const elBtnDmMobile = document.getElementById("btn-download-manager-mobile");
if (elBtnDmMobile) {
  elBtnDmMobile.addEventListener("click", (e) => {
    e.stopPropagation();
    elDownloadManagerPanel.classList.toggle("hidden");
  });
}

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
    elFilmGrid.innerHTML = '<div class="search-empty">arama_sorgusu_bekleniyor...</div>';
    return;
  }
  searchDebounceTimer = setTimeout(() => doSearch(), 600);
});

async function doSearch() {
  clearTimeout(searchDebounceTimer);
  const q = elSearchInput.value.trim();
  if (!q) return;
  elBtnSearch.disabled = true;
  elBtnSearch.innerHTML = '<i class="fa-solid fa-search"></i> aranıyor...';
  // Film grid içine spinner basma; mevcut sonuçlar (varsa) yerinde kalsın.

  try {
    const res = await fetch(
      `/api/search?q=${encodeURIComponent(q)}&type=${activeSearchType}`,
    );
    const data = await res.json();
    if (!data.success || data.films.length === 0) {
      elFilmGrid.innerHTML = `<div class="search-empty">${activeSearchType === "series" ? "dizi" : "film"} bulunamadı.</div>`;
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
    <div class="film-card group flex flex-col gap-3 cursor-pointer" data-url="${f.url}" data-title="${f.title}">
      <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 group-hover:border-primary-container/50 transition-colors">
        <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" referrerpolicy="no-referrer" src="${f.poster || ""}" alt="${escapeHtml(f.title)}" onerror="this.src='https://via.placeholder.com/320x480/111/555?text=NO+POSTER'">
        <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/60 to-transparent"></div>
        <div class="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
          <span class="material-symbols-outlined text-[48px] text-primary-container drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">download</span>
        </div>
      </div>
      <div class="flex flex-col px-1">
        <h3 class="font-bold text-sm text-on-surface truncate group-hover:text-primary-container transition-colors">${f.title}</h3>
        <div class="flex justify-between items-center mt-1">
          <span class="font-mono text-xs text-on-surface-variant/70">${f.year || ""}</span>
          ${f.rating ? `
          <div class="flex items-center gap-1 text-primary-container text-xs">
            <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>
            <span class="font-mono text-xs">${f.rating}</span>
          </div>` : ""}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  elFilmGrid.querySelectorAll(".film-card").forEach((card) => {
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

function encodeFileDataAttr(fileName) {
  return encodeURIComponent(String(fileName));
}

function decodeFileDataAttr(encodedFileName) {
  try {
    return decodeURIComponent(String(encodedFileName || ""));
  } catch {
    return String(encodedFileName || "");
  }
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

function getTaskByEpisodeUrl(episodeUrl) {
  if (!episodeUrl) return null;
  const taskUrl = episodeDownloadTasksByEpisodeUrl.get(episodeUrl);
  if (!taskUrl) return null;
  return downloadTasksByUrl.get(taskUrl) || null;
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
    } else if (
      task.status === "running" ||
      task.status === "waiting" ||
      task.status === "preparing"
    ) {
      overlay.style.background = "rgba(255, 110, 64, 0.15)";
    }
  }

  const epTitleSpan = task.itemElement.querySelector(
    ".episode-title span:first-child",
  );
  if (epTitleSpan) {
    if (!epTitleSpan.dataset.baseText) {
      epTitleSpan.dataset.baseText = epTitleSpan.textContent;
    }
    if (task.status === "running" || task.status === "waiting") {
      const suffix =
        task.status === "waiting" ? " (sırada)" : ` (${pct}%)`;
      epTitleSpan.textContent = `${epTitleSpan.dataset.baseText}${suffix}`;
    } else {
      epTitleSpan.textContent = epTitleSpan.dataset.baseText;
    }
  }

  const dlBtn = task.itemElement.querySelector(".ep-dl-btn");
  const cancelBtn = task.itemElement.querySelector(".ep-cancel-btn");
  if (dlBtn && cancelBtn) {
    // waiting/preparing/running sırasında iptal göster, indir gizle
    const isActive =
      task.status === "running" ||
      task.status === "preparing" ||
      task.status === "waiting";
    dlBtn.classList.toggle("hidden", isActive);
    cancelBtn.classList.toggle("hidden", !isActive);
    if (!isActive) {
      dlBtn.disabled = false;
      dlBtn.innerHTML = `${SVG_DOWNLOAD_ICON} indir.`;
    }
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
      filmTitle,
      filmUrl
    };
    downloadTasksByUrl.set(filmUrl, task);
    if (episodeUrl) {
      episodeDownloadTasksByEpisodeUrl.set(episodeUrl, filmUrl);
    }
    
    // Refresh library grid to show new downloading task immediately
    renderLibraryGrid(libraryFiles);

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
          
          // Dynamically refresh library view with download progress
          renderLibraryGrid(libraryFiles);

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
            parent.querySelectorAll(".task-export-btn").forEach(el => el.remove());

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

            // Dışa aktar (export) butonu ekle
            const exportBtn = document.createElement("button");
            exportBtn.className = "btn btn-success task-export-btn";
            exportBtn.style.marginLeft = "8px";
            exportBtn.style.fontSize = "10px";
            exportBtn.style.padding = "2px 6px";
            exportBtn.innerHTML = `<i class="fa-solid fa-file-arrow-down"></i> export.`;
            exportBtn.addEventListener("click", () => {
              exportVideoFile(data.outputName);
            });
            parent.appendChild(exportBtn);

            // İndirilenler listesini güncelle
            fetchDownloadsList();

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
    const outputName = elOutputName ? elOutputName.value.trim() || "video.mp4" : "video.mp4";

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

    elBulkQuality.dispatchEvent(new Event("change"));
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
  makeSelectCustom(elBulkLang);
  makeSelectCustom(elBulkQuality);
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
    
    makeSelectCustom(langSelect);
    makeSelectCustom(qualitySelect);

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
      qualitySelect.dispatchEvent(new Event("change"));
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
          const outputName = `${cleanSeriesName}_S${sNum}E${eNum}_${cleanStreamName}_${qClean}.mp4`;

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
              const outputName = `${cleanSeriesName}_S${pad(ep.season)}E${pad(ep.episode)}_${cleanStreamName}_${qClean}.mp4`;

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
  
  makeSelectCustom(langSelect);
  makeSelectCustom(sourceSelect);
  makeSelectCustom(qualitySelect);
  
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
    sourceSelect.dispatchEvent(new Event("change"));
  };

  langSelect.addEventListener("change", updateSources);
  updateSources();

  const activeTask = getTaskByEpisodeUrl(filmUrl);
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
        .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ\-_ ]/gi, "")
        .trim()
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_");

      const outputName = `${cleanTitle}_${selectedPlayer}_${selectedQuality}.mp4`;

      // filmUrl sayfa adresi episodeUrl olarak kaydedilir; görev anahtarı manifest URL'dir
      await autoDownloadFilm(
        sData.manifestUrl,
        outputName,
        [],
        item,
        filmUrl,
        selectedQuality,
        sData.streamReferer,
      );
    } catch (e) {
      alert(`İndirme başlatılamadı: ${e.message}`);
    } finally {
      // Aktif görev bağlandıysa updateEpisodeDownloadState butonları yönetir
      const bound = getTaskByEpisodeUrl(filmUrl);
      if (!bound || bound.status === "error" || bound.status === "cancelled") {
        dlBtn.disabled = false;
        dlBtn.innerHTML = `${SVG_DOWNLOAD_ICON} indir.`;
      }
    }
  });

  cancelBtn.addEventListener("click", async () => {
    const activeTask = getTaskByEpisodeUrl(filmUrl);
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
const elVideoSubtitleSelect = document.getElementById("video-subtitle-select");
const elVideoControlsOverlay = document.getElementById("video-controls-overlay");
const elVideoTimelineWrapper = document.getElementById("video-timeline-wrapper");
const elVideoTimelineBg = document.getElementById("video-timeline-bg");
const elVideoTimelineFill = document.getElementById("video-timeline-fill");
const elVideoTimelineHandle = document.getElementById("video-timeline-handle");

// Netflix Oynatıcı DOM Elemanları
const elBtnVideoNextEp = document.getElementById("btn-video-next-ep");
const elVideoSpeedSelect = document.getElementById("video-speed-select");
const elBtnVideoEpisodes = document.getElementById("btn-video-episodes");
const elVideoEpisodesPanel = document.getElementById("video-episodes-panel");
const elBtnCloseEpisodesPanel = document.getElementById("btn-close-episodes-panel");
const elVideoEpisodesSeasonContainer = document.getElementById("video-episodes-season-container");
const elVideoEpisodesSeasonSelect = document.getElementById("video-episodes-season-select");
const elVideoEpisodesList = document.getElementById("video-episodes-list");
const elNextEpisodeCountdown = document.getElementById("next-episode-countdown");
const elNextEpCountdownTitle = document.getElementById("next-ep-countdown-title");
const elNextEpCountdownTime = document.getElementById("next-ep-countdown-time");
const elBtnNextEpCountdownPlay = document.getElementById("btn-next-ep-countdown-play");
const elVideoGiantIndicator = document.getElementById("video-giant-indicator");

// Özel Dropdown DOM Elemanları
const elBtnVideoSpeed = document.getElementById("btn-video-speed");
const elSpeedDisplayValue = document.getElementById("speed-display-value");
const elSpeedDropdownList = document.getElementById("speed-dropdown-list");
const elBtnVideoSubtitle = document.getElementById("btn-video-subtitle");
const elSubtitleDisplayValue = document.getElementById("subtitle-display-value");
const elSubtitleDropdownList = document.getElementById("subtitle-dropdown-list");
const elBtnVideoSeasonPicker = document.getElementById("btn-video-season-picker");
const elVideoSeasonDisplayValue = document.getElementById("video-season-display-value");
const elVideoSeasonDropdownList = document.getElementById("video-season-dropdown-list");

// Downloads/Library DOM Elements
const elLibraryGrid = document.getElementById("library-grid");
const elLibrarySearchInput = document.getElementById("library-search-input");
const elLibraryTotalCount = document.getElementById("library-total-count");

// Global cache for downloaded files
let libraryFiles = [];

// Seri bazlı izleme ilerlemesi (localStorage) ve bölüm seçici için indeks
const librarySeriesIndex = new Map(); // seriesKey -> [{ name, season, episode }]
let lastPlaybackSaveAt = 0;
let pendingSeekPosition = null; // openVideoPlayer -> loadedmetadata seek

function seriesProgressKey(seriesKey) {
  return `series_progress_${seriesKey}`;
}

function playbackPositionKey(fileName) {
  return `playback_pos_${String(fileName || "")}`;
}

function getSeriesProgress(seriesKey) {
  try {
    return JSON.parse(localStorage.getItem(seriesProgressKey(seriesKey)) || "null");
  } catch {
    return null;
  }
}

function setSeriesProgress(seriesKey, season, episode, extra = {}) {
  try {
    const prev = getSeriesProgress(seriesKey) || {};
    localStorage.setItem(
      seriesProgressKey(seriesKey),
      JSON.stringify({
        season,
        episode,
        position:
          extra.position !== undefined
            ? Number(extra.position) || 0
            : Number(prev.position) || 0,
        duration:
          extra.duration !== undefined
            ? Number(extra.duration) || 0
            : Number(prev.duration) || 0,
        fileName:
          extra.fileName !== undefined
            ? String(extra.fileName || "")
            : String(prev.fileName || ""),
        updatedAt: Date.now(),
      }),
    );
  } catch {}
}

function getPlaybackPositionForFile(fileName) {
  if (!fileName) return 0;
  try {
    const raw = localStorage.getItem(playbackPositionKey(fileName));
    if (!raw) return 0;
    const data = JSON.parse(raw);
    return Number(data.position) || 0;
  } catch {
    return 0;
  }
}

function setPlaybackPositionForFile(fileName, position, duration = 0) {
  if (!fileName) return;
  try {
    localStorage.setItem(
      playbackPositionKey(fileName),
      JSON.stringify({
        position: Number(position) || 0,
        duration: Number(duration) || 0,
        updatedAt: Date.now(),
      }),
    );
  } catch {}
}

function isEpisodeNearlyFinished(position, duration) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration < 30) {
    return false;
  }
  return position / duration >= 0.9 || duration - position <= 45;
}

/** Dizide kaldığın yer dosyasını ve (gerekirse) sonraki bölümü bulur. */
function resolveContinueEpisode(seriesKey, episodes) {
  if (!episodes || episodes.length === 0) return "";
  const sorted = episodes
    .slice()
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  const prog = getSeriesProgress(seriesKey);

  if (prog) {
    let hit = null;
    if (prog.fileName) {
      hit = episodes.find((e) => e.name === prog.fileName) || null;
    }
    if (!hit) {
      hit =
        episodes.find(
          (e) => e.season === prog.season && e.episode === prog.episode,
        ) || null;
    }

    if (hit) {
      // Bölüm neredeyse bittiyse bir sonrakine geç
      if (isEpisodeNearlyFinished(prog.position, prog.duration)) {
        const idx = sorted.findIndex((e) => e.name === hit.name);
        if (idx !== -1 && idx < sorted.length - 1) {
          return sorted[idx + 1].name;
        }
      }
      return hit.name;
    }
  }

  // İlerleme yoksa ilk bölümden başla (en son değil!)
  return sorted[0].name;
}

function saveCurrentPlaybackProgress(force = false) {
  if (!elMainVideo || !elVideoPlayerTitle) return;
  const fileName = elVideoPlayerTitle.textContent;
  if (!fileName) return;

  const position = elMainVideo.currentTime;
  const duration = elMainVideo.duration;
  if (!Number.isFinite(position) || position < 1.5) return;
  if (!force && Date.now() - lastPlaybackSaveAt < 2500) return;
  lastPlaybackSaveAt = Date.now();

  setPlaybackPositionForFile(
    fileName,
    position,
    Number.isFinite(duration) ? duration : 0,
  );

  const meta = parseSeriesMetaClient(fileName);
  if (meta) {
    setSeriesProgress(meta.key, meta.season, meta.episode, {
      position,
      duration: Number.isFinite(duration) ? duration : 0,
      fileName,
    });
  }
}

// İstemci tarafı SxxExx ayrıştırıcı (openVideoPlayer'da ilerleme için)
function parseSeriesMetaClient(fileName) {
  const base = String(fileName).replace(/\.[^/.]+$/, "");
  const m = base.match(/^(.*?)[_\s-]+S(\d{1,2})E(\d{1,2})(?:[_\s-]|$)/i);
  if (!m) return null;
  return {
    key: m[1].replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase(),
    title: m[1].replace(/_/g, " ").replace(/\s+/g, " ").trim(),
    season: Number.parseInt(m[2], 10),
    episode: Number.parseInt(m[3], 10),
  };
}

// Fetch and Render Downloaded Videos
async function fetchDownloadsList() {
  try {
    const res = await fetch("/api/downloads-list");
    const data = await res.json();
    if (data.success) {
      libraryFiles = data.files || [];
      renderLibraryGrid(libraryFiles);
    }
  } catch (err) {
    console.error("İndirilenler listesi yüklenemedi:", err);
  }
}

// Client-side live search inside library
if (elLibrarySearchInput) {
  elLibrarySearchInput.addEventListener("input", () => {
    const q = elLibrarySearchInput.value.trim().toLowerCase();
    if (!q) {
      renderLibraryGrid(libraryFiles);
      return;
    }
    const filtered = libraryFiles.filter(f => f.name.toLowerCase().includes(q));
    renderLibraryGrid(filtered);
  });
}

function renderLibraryGrid(files) {
  if (!elLibraryGrid) return;
  
  if (elLibraryTotalCount) {
    elLibraryTotalCount.textContent = files.length;
  }

  // Get active tasks (excluding cancelled/error/completed)
  const activeTasks = Array.from(downloadTasksByUrl.values()).filter(t => t.status === "running" || t.status === "waiting" || t.status === "preparing");

  if (files.length === 0 && activeTasks.length === 0) {
    elLibraryGrid.innerHTML = `
      <div class="library-empty col-span-full text-center py-16 border border-dashed border-outline rounded-xl flex flex-col items-center justify-center gap-3">
        <span class="material-symbols-outlined text-4xl text-on-surface-variant/20">folder_open</span>
        <span class="font-mono text-xs text-on-surface-variant/50">indirilen film bulunamadı.</span>
      </div>
    `;
    return;
  }

  const normalizeDisplayName = (name) =>
    name.replace(/\.[^/.]+$/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();

  const parseSeriesMeta = (fileName) => {
    const base = fileName.replace(/\.[^/.]+$/, "");
    const m = base.match(/^(.*?)[_\s-]+S(\d{1,2})E(\d{1,2})(?:[_\s-]|$)/i);
    if (!m) return null;
    const title = m[1].replace(/_/g, " ").replace(/\s+/g, " ").trim();
    return {
      key: title.toLowerCase(),
      title,
      season: Number.parseInt(m[2], 10),
      episode: Number.parseInt(m[3], 10),
    };
  };

  const groups = new Map();
  files.forEach((file) => {
    const seriesMeta = parseSeriesMeta(file.name);
    const groupKey = seriesMeta ? `series:${seriesMeta.key}` : `single:${file.name.toLowerCase()}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        isSeries: Boolean(seriesMeta),
        title: seriesMeta ? seriesMeta.title : normalizeDisplayName(file.name),
        items: [],
      });
    }
    groups.get(groupKey).items.push({ file, seriesMeta });
  });

  const sortedGroups = Array.from(groups.values()).sort((a, b) => {
    const aLatest = Math.max(...a.items.map((x) => new Date(x.file.createdAt).getTime()));
    const bLatest = Math.max(...b.items.map((x) => new Date(x.file.createdAt).getTime()));
    return bLatest - aLatest;
  });

  let htmlContent = "";

  // 1) Render Active Tasks first
  activeTasks.forEach(task => {
    const pct = task.progress || 0;
    const cleanName = task.filmTitle || "İndiriliyor...";
    htmlContent += `
      <div class="group flex flex-col gap-3 relative" data-task-id="${task.procId}">
        <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 transition-colors">
          <div class="w-full h-full flex flex-col items-center justify-center bg-surface-container-high/80 text-on-surface-variant gap-2 p-4 text-center">
            <span class="material-symbols-outlined text-3xl animate-bounce text-primary-container">downloading</span>
            <span class="font-mono text-[10px] text-primary-container tracking-wider uppercase">DOWNLOADING...</span>
          </div>
          <div class="absolute bottom-0 left-0 w-full h-1 bg-surface-variant z-10">
            <div class="h-full bg-primary-container transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="flex flex-col px-1">
          <h3 class="font-bold text-sm text-on-surface truncate">${cleanName}</h3>
          <div class="flex justify-between items-center mt-1">
            <span class="font-mono text-xs text-primary-container/80 animate-pulse">${pct}% • ${task.status === "waiting" ? "bekliyor." : "indiriliyor."}</span>
            <button class="text-red-400 hover:text-red-300 font-mono text-[10px] dm-task-cancel-btn-lib" data-url="${task.filmUrl || ""}">
              iptal.
            </button>
          </div>
        </div>
      </div>
    `;
  });

  // 2) Render sorted groups
  sortedGroups.forEach((group) => {
    const items = group.items.slice().sort((a, b) => {
      if (group.isSeries && a.seriesMeta && b.seriesMeta) {
        if (a.seriesMeta.season !== b.seriesMeta.season) {
          return a.seriesMeta.season - b.seriesMeta.season;
        }
        return a.seriesMeta.episode - b.seriesMeta.episode;
      }
      return new Date(b.file.createdAt).getTime() - new Date(a.file.createdAt).getTime();
    });

    if (group.isSeries) {
      const seriesKey = group.items[0].seriesMeta.key;
      const episodes = group.items
        .filter((x) => x.seriesMeta)
        .map((x) => ({
          name: x.file.name,
          season: x.seriesMeta.season,
          episode: x.seriesMeta.episode,
          size: x.file.size,
          createdAt: x.file.createdAt
        }));
      librarySeriesIndex.set(seriesKey, episodes);

      // Kart görseli olarak serideki en son indirilen bölümün thumbnail'ini kullanalım
      const latestItem = group.items.reduce((latest, current) => {
        return new Date(current.file.createdAt) > new Date(latest.file.createdAt) ? current : latest;
      }, group.items[0]);
      
      const encodedFileName = encodeFileDataAttr(latestItem.file.name);
      const thumbUrl = `/api/video-thumbnail?file=${encodedFileName}&t=${new Date(latestItem.file.createdAt).getTime()}`;
      const seriesTitle = group.title;
      const episodeCount = episodes.length;

      htmlContent += `
        <div class="group flex flex-col gap-3 cursor-pointer play-series-card-btn" data-series-key="${escapeHtml(seriesKey)}">
          <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 group-hover:border-primary-container/50 transition-colors">
            <div class="library-series-badge">DİZİ</div>
            <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" src="${thumbUrl}" alt="${escapeHtml(seriesTitle)}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');">
            <div class="video-thumb-fallback hidden w-full h-full flex flex-col items-center justify-center bg-surface-container-high text-on-surface-variant/40 p-4 text-center">
              <span class="material-symbols-outlined text-4xl">folder_zip</span>
              <span class="font-mono text-[9px] text-on-surface-variant/30 mt-2">DİZİ ARŞİVİ</span>
            </div>
            <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/60 to-transparent"></div>
            
            <!-- Hover Menüsü (Netflix Tarzı) -->
            <div class="absolute inset-0 bg-background/90 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center backdrop-blur-sm z-10 gap-4 p-6">
              <!-- Devam Et -->
              <button class="w-full flex items-center justify-center gap-2 py-2 bg-primary-container text-black font-bold rounded-lg text-xs hover:bg-primary-fixed transition-colors play-series-continue-btn" data-series-key="${escapeHtml(seriesKey)}" onclick="event.stopPropagation();">
                <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">play_arrow</span> devam et.
              </button>
              <!-- Bölümler -->
              <button class="w-full flex items-center justify-center gap-2 py-2 bg-surface-container-highest border border-outline text-on-surface font-bold rounded-lg text-xs hover:bg-surface-variant transition-colors play-series-episodes-btn" data-series-key="${escapeHtml(seriesKey)}" onclick="event.stopPropagation();">
                <span class="material-symbols-outlined text-sm">playlist_play</span> bölümler.
              </button>
            </div>
          </div>
          <div class="flex flex-col px-1">
            <h3 class="font-bold text-sm text-on-surface truncate group-hover:text-primary-container transition-colors">${escapeHtml(seriesTitle)}</h3>
            <div class="flex justify-between items-center mt-1">
              <span class="font-mono text-[10px] text-primary-container/80 font-bold">${episodeCount} Bölüm İndirildi</span>
            </div>
          </div>
        </div>
      `;
    } else {
      const { file } = items[0];
      const isTs = file.name.toLowerCase().endsWith(".ts");
      const displaySize = formatBytes(file.size);
      const dateStr = new Date(file.createdAt).toLocaleDateString("tr-TR");
      const encodedFileName = encodeFileDataAttr(file.name);
      const displayName = normalizeDisplayName(file.name);
      const thumbUrl = `/api/video-thumbnail?file=${encodedFileName}&t=${new Date(file.createdAt).getTime()}`;

      htmlContent += `
        <div class="group flex flex-col gap-3 cursor-pointer play-library-btn" data-file="${encodedFileName}">
          <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 group-hover:border-primary-container/50 transition-colors">
            <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" src="${thumbUrl}" alt="${escapeHtml(displayName)}" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');">
            <div class="video-thumb-fallback hidden w-full h-full flex flex-col items-center justify-center bg-surface-container-high text-on-surface-variant/40 p-4 text-center">
              <span class="material-symbols-outlined text-4xl">movie</span>
              <span class="font-mono text-[9px] text-on-surface-variant/30 mt-2">${isTs ? "TS CONTAINER" : "MP4 CONTAINER"}</span>
            </div>
            <div class="absolute top-3 right-3 bg-surface-container/90 backdrop-blur-sm border border-outline/50 px-2 py-1 rounded font-mono text-[9px] text-primary-container">${isTs ? "TS" : "MP4"}</div>
            <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/60 to-transparent"></div>
            <div class="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm z-10">
              <span class="material-symbols-outlined text-[48px] text-primary-container drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">play_circle</span>
            </div>
          </div>
          <div class="flex flex-col px-1" onclick="event.stopPropagation();">
            <h3 class="font-bold text-sm text-on-surface truncate group-hover:text-primary-container transition-colors play-title-click" data-file="${encodedFileName}" style="cursor: pointer;">${escapeHtml(displayName)}</h3>
            <div class="flex justify-between items-center mt-1">
              <span class="font-mono text-[10px] text-on-surface-variant/70">${displaySize} • ${dateStr}</span>
              <button class="px-3 py-1 bg-surface-container-highest border border-outline rounded-full font-mono text-[9px] text-primary-container hover:bg-primary-container hover:text-black transition-all export-video-btn" data-file="${encodedFileName}">
                export.
              </button>
            </div>
          </div>
        </div>
      `;
    }
  });

  elLibraryGrid.innerHTML = htmlContent;

  // Bind events
  elLibraryGrid.querySelectorAll(".play-library-btn").forEach(card => {
    card.addEventListener("click", () => {
      const fileName = decodeFileDataAttr(card.dataset.file);
      openVideoPlayer(fileName);
    });
  });

  elLibraryGrid.querySelectorAll(".play-title-click").forEach(title => {
    title.addEventListener("click", () => {
      const fileName = decodeFileDataAttr(title.dataset.file);
      openVideoPlayer(fileName);
    });
  });

  elLibraryGrid.querySelectorAll(".export-video-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const fileName = decodeFileDataAttr(btn.dataset.file);
      exportVideoFile(fileName);
    });
  });

  elLibraryGrid.querySelectorAll(".dm-task-cancel-btn-lib").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filmUrl = btn.dataset.url;
      const activeTask = downloadTasksByUrl.get(filmUrl);
      if (activeTask) {
        activeTask.status = "cancelled";
        if (activeTask.taskId) {
          await fetch(`/api/task-cancel/${activeTask.taskId}`, { method: "POST" });
        }
        if (activeTask.interval) clearInterval(activeTask.interval);
        downloadTasksByUrl.delete(filmUrl);
        if (activeTask.episodeUrl) {
          episodeDownloadTasksByEpisodeUrl.delete(activeTask.episodeUrl);
        }
        const card = elDmTasksList.querySelector(`[data-task-id="${activeTask.procId}"]`);
        if (card) card.remove();
        if (elDmTasksList.children.length === 0) {
          elDmTasksList.innerHTML = '<div class="dm-empty">aktif indirme yok.</div>';
        }
        updateDownloadCountBadge();
        renderLibraryGrid(libraryFiles);
      }
    });
  });

  // Dizi kartı tıklaması (varsayılan olarak bölüm seçiciyi açar)
  elLibraryGrid.querySelectorAll(".play-series-card-btn").forEach(card => {
    card.addEventListener("click", () => {
      const seriesKey = card.dataset.seriesKey;
      openEpisodePicker(seriesKey);
    });
  });

  // Hover buton olayları
  elLibraryGrid.querySelectorAll(".play-series-continue-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const seriesKey = btn.dataset.seriesKey;
      playSeriesContinue(seriesKey);
    });
  });

  elLibraryGrid.querySelectorAll(".play-series-episodes-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const seriesKey = btn.dataset.seriesKey;
      openEpisodePicker(seriesKey);
    });
  });
}

// Bölüm seçme paneli: seriye ait indirilmiş bölümleri listeler, seçilen oynatılır
function openEpisodePicker(seriesKey) {
  const episodes = librarySeriesIndex.get(seriesKey);
  if (!episodes || episodes.length === 0) return;

  const prog = getSeriesProgress(seriesKey);
  
  // Sezonları bulalım
  const seasonsSet = new Set();
  episodes.forEach(e => seasonsSet.add(e.season));
  const seasons = Array.from(seasonsSet).sort((a, b) => a - b);
  
  // Varsayılan aktif sezon: kaldığı yer varsa o, yoksa ilk sezon
  let activeSeason = seasons[0];
  if (prog && seasonsSet.has(prog.season)) {
    activeSeason = prog.season;
  }

  // "Kaldığın yerden devam et" dosyası (zaman damgası + neredeyse biten bölüm mantığı)
  const continueFile = resolveContinueEpisode(seriesKey, episodes);

  const overlay = document.createElement("div");
  overlay.className = "episode-picker-overlay";
  
  // Dizi Başlığı (temizlenmiş başlık)
  const seriesTitle = String(episodes[0].name)
    .replace(/\.[^/.]+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .split(/[\s-]+S\d+/i)[0]
    .trim();

  overlay.innerHTML = `
    <div class="episode-picker-content">
      <div class="episode-picker-banner">
        <div class="episode-picker-banner-title">${escapeHtml(seriesTitle)}</div>
        <button class="episode-picker-close absolute top-4 right-4 z-20">kapat.</button>
      </div>

      <div class="flex items-center justify-between px-6 py-4 bg-surface-container-high/40 border-b border-outline/30">
        <span class="font-mono text-xs text-on-surface-variant">${episodes.length} Bölüm İndirildi</span>
        ${continueFile ? `
          <button class="btn-continue text-xs" data-continue="${encodeURIComponent(continueFile)}">
            <span class="material-symbols-outlined" style="font-size:16px;">play_arrow</span> kaldığın yerden devam et
          </button>
        ` : ""}
      </div>

      ${seasons.length > 1 ? `
        <div class="season-tabs-container hide-scrollbar">
          ${seasons.map(s => `
            <button class="season-tab ${s === activeSeason ? "active" : ""}" data-season="${s}">
              Sezon ${s}
            </button>
          `).join("")}
        </div>
      ` : ""}

      <div class="episode-picker-body custom-scrollbar"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Bölümleri render eden fonksiyon
  function renderSeasonEpisodes(seasonNum) {
    const pickerBody = overlay.querySelector(".episode-picker-body");
    if (!pickerBody) return;

    const filtered = episodes
      .filter(e => e.season === seasonNum)
      .sort((a, b) => a.episode - b.episode);

    pickerBody.innerHTML = filtered.map(e => {
      const watched = prog && prog.season === e.season && prog.episode === e.episode;
      const code = `S${String(e.season).padStart(2, "0")}E${String(e.episode).padStart(2, "0")}`;
      
      const cleanEpTitle = String(e.name)
        .replace(/\.[^/.]+$/, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const displaySize = formatBytes(e.size);
      const dateStr = new Date(e.createdAt).toLocaleDateString("tr-TR");

      return `
        <div class="episode-list-row ${watched ? "watched" : ""}">
          <div class="episode-row-left">
            <span class="episode-row-num">${code}</span>
            <div class="episode-row-info">
              <span class="episode-row-title">${escapeHtml(cleanEpTitle)}</span>
              <span class="episode-row-meta">${displaySize} • ${dateStr}</span>
            </div>
          </div>
          <div class="episode-row-actions">
            <button class="btn-episode-play" data-file="${encodeURIComponent(e.name)}" title="Oynat">
              <span class="material-symbols-outlined" style="font-size: 18px; font-variation-settings: 'FILL' 1;">play_arrow</span>
            </button>
            <button class="btn-episode-export" data-file="${encodeURIComponent(e.name)}">
              export.
            </button>
          </div>
        </div>
      `;
    }).join("");

    pickerBody.querySelectorAll(".btn-episode-play").forEach(btn => {
      btn.addEventListener("click", () => {
        const file = decodeURIComponent(btn.dataset.file);
        overlay.remove();
        openVideoPlayer(file);
      });
    });

    pickerBody.querySelectorAll(".btn-episode-export").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const file = decodeURIComponent(btn.dataset.file);
        exportVideoFile(file);
      });
    });
  }

  // İlk sezonu render et
  renderSeasonEpisodes(activeSeason);

  overlay.querySelector(".episode-picker-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const btnContinue = overlay.querySelector(".btn-continue");
  if (btnContinue) {
    btnContinue.addEventListener("click", () => {
      const file = decodeURIComponent(btnContinue.dataset.continue);
      overlay.remove();
      openVideoPlayer(file, { resume: true });
    });
  }

  overlay.querySelectorAll(".season-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      overlay.querySelectorAll(".season-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const s = Number.parseInt(tab.dataset.season, 10);
      renderSeasonEpisodes(s);
    });
  });
}

// Function to trigger manual export download
function exportVideoFile(fileName) {
  const a = document.createElement("a");
  a.href = `/downloads/${encodeURIComponent(fileName)}`;
  a.setAttribute("download", fileName);
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function playSeriesContinue(seriesKey) {
  const episodes = librarySeriesIndex.get(seriesKey);
  if (!episodes || episodes.length === 0) return;

  const continueFile = resolveContinueEpisode(seriesKey, episodes);
  if (continueFile) {
    openVideoPlayer(continueFile, { resume: true });
  }
}

function resetVideoSubtitleSelect(label = "altyazi: kapali") {
  if (!elVideoSubtitleSelect) return;
  elVideoSubtitleSelect.innerHTML = "";
  const option = document.createElement("option");
  option.value = "off";
  option.textContent = label;
  elVideoSubtitleSelect.appendChild(option);
  elVideoSubtitleSelect.value = "off";
  elVideoSubtitleSelect.disabled = label !== "altyazi: kapali";

  // Özel altyazı dropdown sıfırlaması
  if (elSubtitleDisplayValue) elSubtitleDisplayValue.textContent = label;
  if (elSubtitleDropdownList) {
    elSubtitleDropdownList.innerHTML = `<button class="active" data-value="off">${label}</button>`;
  }
}

function applySelectedSubtitleTrack(trackIndexValue) {
  if (!elMainVideo || !elMainVideo.textTracks) return;
  const tracks = elMainVideo.textTracks;
  for (let i = 0; i < tracks.length; i++) {
    tracks[i].mode = "disabled";
  }
  if (trackIndexValue !== "off") {
    const index = Number.parseInt(trackIndexValue, 10);
    if (Number.isInteger(index) && tracks[index]) {
      tracks[index].mode = "showing";
    }
  }
}

function clearVideoSubtitleTracks() {
  if (!elMainVideo) return;
  const trackElements = elMainVideo.querySelectorAll("track");
  trackElements.forEach((track) => track.remove());
}

async function resolvePlayableVideoSrc(fileName) {
  const fallbackTsStream = `/api/stream-ts?file=${encodeURIComponent(fileName)}`;
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "mp4") {
    return `/downloads/${encodeURIComponent(fileName)}`;
  }
  if (ext !== "ts") {
    return `/downloads/${encodeURIComponent(fileName)}`;
  }

  try {
    const res = await fetch(`/api/prepare-video?file=${encodeURIComponent(fileName)}`);
    const data = await res.json();
    if (data && data.success && data.url) {
      return data.url;
    }
    return fallbackTsStream;
  } catch {
    return fallbackTsStream;
  }
}

async function loadVideoSubtitles(fileName) {
  clearVideoSubtitleTracks();
  resetVideoSubtitleSelect("altyazi: yukleniyor...");

  try {
    const res = await fetch(`/api/video-subtitles?file=${encodeURIComponent(fileName)}`);
    const data = await res.json();
    if (!data.success || !Array.isArray(data.subtitles) || data.subtitles.length === 0) {
      resetVideoSubtitleSelect("altyazi: yok");
      return;
    }

    if (!elMainVideo || !elVideoSubtitleSelect) return;

    data.subtitles.forEach((sub, index) => {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.label || `Altyazi ${index + 1}`;
      track.srclang = sub.lang || `sub${index + 1}`;
      track.src = sub.src;
      elMainVideo.appendChild(track);
    });

    elVideoSubtitleSelect.innerHTML = "";

    const offOption = document.createElement("option");
    offOption.value = "off";
    offOption.textContent = "altyazi: kapali";
    elVideoSubtitleSelect.appendChild(offOption);

    data.subtitles.forEach((sub, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `altyazi: ${sub.label || sub.lang || `sub${index + 1}`}`;
      elVideoSubtitleSelect.appendChild(option);
    });

    // Özel altyazı dropdown listesini dinamik olarak doldur
    if (elSubtitleDropdownList) {
      let subHtml = `<button class="active" data-value="off">altyazi: kapali</button>`;
      data.subtitles.forEach((sub, index) => {
        const text = `altyazi: ${sub.label || sub.lang || `sub${index + 1}`}`;
        subHtml += `<button data-value="${index}">${escapeHtml(text)}</button>`;
      });
      elSubtitleDropdownList.innerHTML = subHtml;

      // Özel altyazı buton olayları
      elSubtitleDropdownList.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = btn.dataset.value;
          
          elSubtitleDropdownList.querySelectorAll("button").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          
          if (elVideoSubtitleSelect) {
            elVideoSubtitleSelect.value = val;
            elVideoSubtitleSelect.dispatchEvent(new Event("change"));
          }
          
          if (elSubtitleDisplayValue) elSubtitleDisplayValue.textContent = btn.textContent;
          closeAllDropdowns();
        });
      });
    }

    elVideoSubtitleSelect.disabled = false;
    elVideoSubtitleSelect.value = "off";
    if (elSubtitleDisplayValue) elSubtitleDisplayValue.textContent = "altyazi: kapali";
    applySelectedSubtitleTrack("off");
  } catch (err) {
    console.error("Altyazı listesi yüklenemedi:", err);
    resetVideoSubtitleSelect("altyazi: yuklenemedi");
  }
}

// Open Video Player Modal
// options.resume: true ise kaydedilmiş zamandan devam et (kaldığın yerden)
async function openVideoPlayer(fileName, options = {}) {
  if (!fileName) return;
  const shouldResume = options.resume !== false; // varsayılan: kaldığın yerden

  // Oynatma hızını sıfırla
  if (elVideoSpeedSelect) elVideoSpeedSelect.value = "1";
  if (elMainVideo) elMainVideo.playbackRate = 1;

  // Açık olan panelleri ve sayacı sıfırla
  closeEpisodesPanel();
  hideNextEpisodeCountdown();

  // Seri ise izleme ilerlemesini kaydet (kaldığın yerden devam et için)
  // Not: zaman damgası timeupdate/close ile güncellenir; burada sadece bölüm bilgisini tutarız.
  const meta = parseSeriesMetaClient(fileName);
  if (meta) {
    const prev = getSeriesProgress(meta.key);
    const keepPosition =
      prev &&
      prev.fileName === fileName &&
      Number.isFinite(prev.position)
        ? prev.position
        : getPlaybackPositionForFile(fileName);
    const keepDuration =
      prev && prev.fileName === fileName && Number.isFinite(prev.duration)
        ? prev.duration
        : 0;
    setSeriesProgress(meta.key, meta.season, meta.episode, {
      position: keepPosition || 0,
      duration: keepDuration || 0,
      fileName,
    });
    // Sonraki bölüm kontrolü
    updateNextEpisodeButtonState(fileName);
    if (elBtnVideoEpisodes) elBtnVideoEpisodes.classList.remove("hidden");
    setupEpisodesPanel(meta.key, fileName);
  } else {
    if (elBtnVideoNextEp) elBtnVideoNextEp.classList.add("hidden");
    if (elBtnVideoEpisodes) elBtnVideoEpisodes.classList.add("hidden");
  }

  // Kaldığın saniyeyi hazırla (neredeyse bitmişse baştan)
  pendingSeekPosition = null;
  if (shouldResume) {
    const savedPos = getPlaybackPositionForFile(fileName);
    if (savedPos > 5) {
      pendingSeekPosition = savedPos;
    }
  }

  if (elVideoPlayerTitle) elVideoPlayerTitle.textContent = fileName;
  if (elMainVideo) {
    // Her açılışta src'yi temizle ki aynı dosya tekrar oynatılabilsin
    elMainVideo.pause();
    elMainVideo.removeAttribute("src");
    elMainVideo.load();
    const resolvedSrc = await resolvePlayableVideoSrc(fileName);
    elMainVideo.src = resolvedSrc;
    elMainVideo.load();
  }
  if (elVideoPlayerModal) elVideoPlayerModal.classList.remove("hidden");
  loadVideoSubtitles(fileName);

  // UI state'i sıfırla
  if (elVideoTimelineFill) elVideoTimelineFill.style.width = "0%";
  if (elVideoTimelineHandle) elVideoTimelineHandle.style.left = "0%";
  if (elVideoCurrentTime) elVideoCurrentTime.textContent = "00:00:00";
  if (elVideoDuration) elVideoDuration.textContent = "00:00:00";
  if (elVideoControlsOverlay) elVideoControlsOverlay.classList.add("visible");

  // Önceki açılışlardan kalan keydown listener'ı temizle, sonra yeniden bağla
  document.removeEventListener("keydown", handleVideoKeydown);
  document.addEventListener("keydown", handleVideoKeydown);

  updatePlayPauseIcon();
  showControls();

  if (elMainVideo) {
    const playResult = elMainVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {});
    }
  }
}

// Close Video Player Modal
function closeVideoPlayer() {
  // Kapatmadan önce kaldığın yeri kaydet
  saveCurrentPlaybackProgress(true);

  closeEpisodesPanel();
  hideNextEpisodeCountdown();
  pendingSeekPosition = null;

  if (elMainVideo) {
    elMainVideo.pause();
    clearVideoSubtitleTracks();
    elMainVideo.removeAttribute("src");
    elMainVideo.load();
  }
  if (elVideoPlayerModal) elVideoPlayerModal.classList.add("hidden");
  if (elVideoControlsOverlay) elVideoControlsOverlay.classList.remove("visible");
  resetVideoSubtitleSelect();
  clearTimeout(controlsTimeout);
  document.removeEventListener("keydown", handleVideoKeydown);
}

if (elBtnCloseVideo) {
  elBtnCloseVideo.addEventListener("click", closeVideoPlayer);
}

// Play & Pause Controls
function triggerGiantPlayIndicator(isPlay) {
  if (!elVideoGiantIndicator) return;
  const icon = elVideoGiantIndicator.querySelector("span");
  if (!icon) return;
  
  icon.textContent = isPlay ? "play_arrow" : "pause";
  
  elVideoGiantIndicator.classList.remove("giant-indicator-animate");
  elVideoGiantIndicator.classList.remove("opacity-0");
  void elVideoGiantIndicator.offsetWidth; // Reflow
  elVideoGiantIndicator.classList.add("giant-indicator-animate");
}

function togglePlay() {
  if (!elMainVideo) return;
  const isPlay = elMainVideo.paused;
  if (isPlay) {
    const playResult = elMainVideo.play();
    if (playResult && typeof playResult.catch === "function") {
      playResult.catch((err) => {
        console.error("Video oynatma başlatılamadı:", err);
      });
    }
  } else {
    elMainVideo.pause();
  }
  updatePlayPauseIcon();
  triggerGiantPlayIndicator(isPlay);
}

function updatePlayPauseIcon() {
  if (!elBtnVideoPlay || !elMainVideo) return;
  const icon = elBtnVideoPlay.querySelector("span");
  if (elMainVideo.paused) {
    icon.textContent = "play_arrow";
  } else {
    icon.textContent = "pause";
  }
}

if (elBtnVideoPlay) elBtnVideoPlay.addEventListener("click", togglePlay);
if (elMainVideo) {
  elMainVideo.addEventListener("click", togglePlay);
  elMainVideo.addEventListener("play", updatePlayPauseIcon);
  elMainVideo.addEventListener("pause", updatePlayPauseIcon);
  elMainVideo.addEventListener("error", () => {
    const mediaError = elMainVideo.error;
    const code = mediaError ? mediaError.code : "unknown";
    const details = {
      code,
      src: elMainVideo.currentSrc || elMainVideo.src || "",
      readyState: elMainVideo.readyState,
      networkState: elMainVideo.networkState,
      currentTime: elMainVideo.currentTime,
      duration: elMainVideo.duration,
    };
    console.error("Video oynatma hatası:", details);
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "VIDEO_ERROR", message: JSON.stringify(details) }),
    }).catch(() => {});
    showControls();
  });
}

// Rewind & Forward
if (elBtnVideoRewind && elMainVideo) {
  elBtnVideoRewind.addEventListener("click", () => {
    elMainVideo.currentTime = Math.max(0, elMainVideo.currentTime - 10);
  });
}

if (elBtnVideoForward && elMainVideo) {
  elBtnVideoForward.addEventListener("click", () => {
    elMainVideo.currentTime = Math.min(elMainVideo.duration, elMainVideo.currentTime + 10);
  });
}

// Volume & Mute Controls
function updateVolumeIcon() {
  if (!elBtnVideoMute || !elMainVideo) return;
  const icon = elBtnVideoMute.querySelector("span");
  if (elMainVideo.muted || elMainVideo.volume === 0) {
    icon.textContent = "volume_off";
    if (elVideoVolumeSlider) elVideoVolumeSlider.value = 0;
  } else if (elMainVideo.volume < 0.5) {
    icon.textContent = "volume_down";
    if (elVideoVolumeSlider) elVideoVolumeSlider.value = elMainVideo.volume;
  } else {
    icon.textContent = "volume_up";
    if (elVideoVolumeSlider) elVideoVolumeSlider.value = elMainVideo.volume;
  }
}

if (elBtnVideoMute && elMainVideo) {
  elBtnVideoMute.addEventListener("click", () => {
    elMainVideo.muted = !elMainVideo.muted;
    updateVolumeIcon();
  });
}

if (elVideoVolumeSlider && elMainVideo) {
  elVideoVolumeSlider.addEventListener("input", (e) => {
    elMainVideo.volume = e.target.value;
    elMainVideo.muted = e.target.value == 0;
    updateVolumeIcon();
  });
}

if (elVideoSubtitleSelect) {
  elVideoSubtitleSelect.addEventListener("change", (e) => {
    applySelectedSubtitleTrack(e.target.value);
  });
  resetVideoSubtitleSelect();
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
    if (elVideoDuration) elVideoDuration.textContent = formatTime(elMainVideo.duration);
  });

  // Kaldığın saniyeye daha güvenilir şekilde sarabilmek için canplay olayını dinliyoruz
  elMainVideo.addEventListener("canplay", () => {
    if (
      pendingSeekPosition !== null &&
      Number.isFinite(elMainVideo.duration) &&
      elMainVideo.duration > 10
    ) {
      let seekTo = pendingSeekPosition;
      // Neredeyse bitmişse baştan başlat
      if (isEpisodeNearlyFinished(seekTo, elMainVideo.duration)) {
        seekTo = 0;
      } else {
        seekTo = Math.min(seekTo, Math.max(0, elMainVideo.duration - 3));
      }
      if (seekTo > 5) {
        try {
          elMainVideo.currentTime = seekTo;
        } catch (_) {}
      }
      pendingSeekPosition = null;
    }
  });

  elMainVideo.addEventListener("timeupdate", () => {
    if (elVideoCurrentTime) elVideoCurrentTime.textContent = formatTime(elMainVideo.currentTime);
    if (elMainVideo.duration) {
      const pct = (elMainVideo.currentTime / elMainVideo.duration) * 100;
      if (elVideoTimelineFill) elVideoTimelineFill.style.width = `${pct}%`;
      if (elVideoTimelineHandle) elVideoTimelineHandle.style.left = `${pct}%`;

      // İzleme konumunu periyodik kaydet (kaldığın yerden devam için)
      saveCurrentPlaybackProgress(false);

      // Netflix Otomatik Sonraki Bölüm Geri Sayımı
      if (elMainVideo.duration > 30) {
        const timeLeft = elMainVideo.duration - elMainVideo.currentTime;
        const currentFile = elVideoPlayerTitle ? elVideoPlayerTitle.textContent : "";
        const meta = parseSeriesMetaClient(currentFile);
        if (meta) {
          const episodes = librarySeriesIndex.get(meta.key);
          if (episodes && episodes.length > 0) {
            const sorted = episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
            const currentIndex = sorted.findIndex(e => e.name === currentFile);
            if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
              const nextEp = sorted[currentIndex + 1];
              if (timeLeft <= 15 && timeLeft > 0.5) {
                showNextEpisodeCountdown(nextEp, Math.ceil(timeLeft));
              } else if (timeLeft <= 0.5) {
                hideNextEpisodeCountdown();
                playSeriesNextEpisode(currentFile);
              } else {
                hideNextEpisodeCountdown();
              }
            }
          }
        }
      }
    }
  });

  elMainVideo.addEventListener("pause", () => {
    saveCurrentPlaybackProgress(true);
  });

  elMainVideo.addEventListener("ended", () => {
    // Biten bölümü %100 tamamlandı olarak işaretle (continue sonraki bölüme geçsin)
    if (elVideoPlayerTitle && Number.isFinite(elMainVideo.duration)) {
      setPlaybackPositionForFile(
        elVideoPlayerTitle.textContent,
        elMainVideo.duration,
        elMainVideo.duration,
      );
      const meta = parseSeriesMetaClient(elVideoPlayerTitle.textContent);
      if (meta) {
        setSeriesProgress(meta.key, meta.season, meta.episode, {
          position: elMainVideo.duration,
          duration: elMainVideo.duration,
          fileName: elVideoPlayerTitle.textContent,
        });
      }
    }

    if (elMainVideo.currentTime < 2) {
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "VIDEO_EARLY_ENDED",
          message: JSON.stringify({
            src: elMainVideo.currentSrc || elMainVideo.src || "",
            currentTime: elMainVideo.currentTime,
            duration: elMainVideo.duration,
            readyState: elMainVideo.readyState,
          }),
        }),
      }).catch(() => {});
    }
    showControls();
    updatePlayPauseIcon();
  });
}

// Seek Timeline
function seekVideoByClientX(clientX) {
  if (!elMainVideo || !elVideoTimelineBg || !Number.isFinite(elMainVideo.duration) || elMainVideo.duration <= 0) return;
  const rect = elVideoTimelineBg.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  elMainVideo.currentTime = ratio * elMainVideo.duration;
}

if (elVideoTimelineWrapper && elMainVideo && elVideoTimelineBg) {
  let isTimelineScrubbing = false;

  elVideoTimelineWrapper.addEventListener("click", (e) => {
    seekVideoByClientX(e.clientX);
  });

  elVideoTimelineWrapper.addEventListener("pointerdown", (e) => {
    isTimelineScrubbing = true;
    seekVideoByClientX(e.clientX);
    elVideoTimelineWrapper.setPointerCapture?.(e.pointerId);
  });

  elVideoTimelineWrapper.addEventListener("pointermove", (e) => {
    if (isTimelineScrubbing) {
      seekVideoByClientX(e.clientX);
    }
  });

  const stopScrub = (e) => {
    if (!isTimelineScrubbing) return;
    isTimelineScrubbing = false;
    if (e) seekVideoByClientX(e.clientX);
  };

  elVideoTimelineWrapper.addEventListener("pointerup", stopScrub);
  elVideoTimelineWrapper.addEventListener("pointercancel", stopScrub);
}

// Picture-in-Picture
if (elBtnVideoPip && elMainVideo) {
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
  if (!elMainVideo) return;
  const container = elMainVideo.parentElement;
  if (!container) return;
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
  if (elMainVideo && !elMainVideo.paused) {
    controlsTimeout = setTimeout(() => {
      elVideoControlsOverlay.classList.remove("visible");
    }, 3000);
  }
}

if (elMainVideo) {
  const container = elMainVideo.parentElement;
  if (container) {
    container.addEventListener("mousemove", showControls);
    container.addEventListener("click", showControls);
  }
  elMainVideo.addEventListener("play", showControls);
  elMainVideo.addEventListener("pause", showControls);
}

if (elVideoPlayerModal) {
  elVideoPlayerModal.addEventListener("click", (e) => {
    if (e.target === elVideoPlayerModal) {
      closeVideoPlayer();
    }
  });
}

// Keyboard Listeners
function handleVideoKeydown(e) {
  if (!elMainVideo || elVideoPlayerModal.classList.contains("hidden")) return;
  
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

// Sayfa kapatılırken veya yenilenirken son izleme konumunu kaydet
window.addEventListener("beforeunload", () => {
  saveCurrentPlaybackProgress(true);
});

// Initialization on DOM load
window.addEventListener("DOMContentLoaded", () => {
  fetchDownloadsList();

  // Netflix Oynatıcı Kontrol Dinleyicileri
  if (elVideoSpeedSelect && elMainVideo) {
    elVideoSpeedSelect.addEventListener("change", (e) => {
      elMainVideo.playbackRate = Number.parseFloat(e.target.value);
    });
  }

  // Özel Hız Seçimi Olayları
  if (elBtnVideoSpeed) {
    elBtnVideoSpeed.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSpeedDropdown();
    });
  }

  if (elSpeedDropdownList) {
    elSpeedDropdownList.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = btn.dataset.value;
        
        elSpeedDropdownList.querySelectorAll("button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        if (elVideoSpeedSelect) {
          elVideoSpeedSelect.value = val;
          elVideoSpeedSelect.dispatchEvent(new Event("change"));
        }
        
        if (elSpeedDisplayValue) {
          elSpeedDisplayValue.textContent = val === "1" ? "hız: 1x" : `${val}x`;
        }
        
        closeAllDropdowns();
      });
    });
  }

  // Özel Altyazı Dropdown Tetikleyicisi
  if (elBtnVideoSubtitle) {
    elBtnVideoSubtitle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSubtitleDropdown();
    });
  }

  if (elBtnVideoEpisodes) {
    elBtnVideoEpisodes.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleEpisodesPanel();
    });
  }

  if (elBtnCloseEpisodesPanel) {
    elBtnCloseEpisodesPanel.addEventListener("click", () => {
      closeEpisodesPanel();
    });
  }

  if (elBtnVideoNextEp) {
    elBtnVideoNextEp.addEventListener("click", () => {
      const nextFile = decodeURIComponent(elBtnVideoNextEp.dataset.nextFile);
      if (nextFile) {
        openVideoPlayer(nextFile);
      }
    });
  }

  // Özel Sezon Dropdown Tetikleyicisi
  if (elBtnVideoSeasonPicker) {
    elBtnVideoSeasonPicker.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSeasonDropdown();
    });
  }

  // Click Outside (Dışarı tıklandığında menüleri kapat)
  document.addEventListener("click", () => {
    closeAllDropdowns();
  });
});

// ==========================================================================
// Netflix Oynatıcı Yardımcı Fonksiyonları
// ==========================================================================

function toggleEpisodesPanel() {
  if (!elVideoEpisodesPanel) return;
  const isOpen = elVideoEpisodesPanel.classList.contains("translate-x-0");
  if (isOpen) {
    closeEpisodesPanel();
  } else {
    elVideoEpisodesPanel.classList.remove("translate-x-full");
    elVideoEpisodesPanel.classList.add("translate-x-0");
    showControls(); // Kontrolleri açık tut
  }
}

function closeEpisodesPanel() {
  if (!elVideoEpisodesPanel) return;
  elVideoEpisodesPanel.classList.remove("translate-x-0");
  elVideoEpisodesPanel.classList.add("translate-x-full");
}

function setupEpisodesPanel(seriesKey, currentFileName) {
  const episodes = librarySeriesIndex.get(seriesKey);
  if (!episodes || episodes.length === 0 || !elVideoEpisodesList) return;

  const prog = getSeriesProgress(seriesKey);
  const seasonsSet = new Set();
  episodes.forEach(e => seasonsSet.add(e.season));
  const seasons = Array.from(seasonsSet).sort((a, b) => a - b);

  // Sezon Seçici Dropdown
  if (elVideoEpisodesSeasonSelect && elVideoEpisodesSeasonContainer) {
    if (seasons.length > 1) {
      elVideoEpisodesSeasonContainer.classList.remove("hidden");
      elVideoEpisodesSeasonSelect.innerHTML = seasons.map(s => `
        <option value="${s}">Sezon ${s}</option>
      `).join("");
      
      const currentMeta = parseSeriesMetaClient(currentFileName);
      let currentSeasonVal = seasons[0];
      if (currentMeta && seasonsSet.has(currentMeta.season)) {
        currentSeasonVal = currentMeta.season;
      }
      elVideoEpisodesSeasonSelect.value = String(currentSeasonVal);

      // Özel dropdown başlığını güncelle
      if (elVideoSeasonDisplayValue) elVideoSeasonDisplayValue.textContent = `Sezon ${currentSeasonVal}`;

      // Özel dropdown listesini doldur
      if (elVideoSeasonDropdownList) {
        elVideoSeasonDropdownList.innerHTML = seasons.map(s => `
          <button class="${s === currentSeasonVal ? "active" : ""}" data-value="${s}">Sezon ${s}</button>
        `).join("");

        // Özel dropdown buton olaylarını bağla
        elVideoSeasonDropdownList.querySelectorAll("button").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const sVal = Number.parseInt(btn.dataset.value, 10);
            
            elVideoSeasonDropdownList.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            if (elVideoSeasonDisplayValue) elVideoSeasonDisplayValue.textContent = btn.textContent;
            
            if (elVideoEpisodesSeasonSelect) {
              elVideoEpisodesSeasonSelect.value = String(sVal);
              elVideoEpisodesSeasonSelect.dispatchEvent(new Event("change"));
            }
            closeAllDropdowns();
          });
        });
      }
    } else {
      elVideoEpisodesSeasonContainer.classList.add("hidden");
    }
  }

  function renderPanelEpisodes(seasonNum) {
    const filtered = episodes
      .filter(e => e.season === seasonNum)
      .sort((a, b) => a.episode - b.episode);

    elVideoEpisodesList.innerHTML = filtered.map(e => {
      const isCurrent = e.name === currentFileName;
      const watched = prog && prog.season === e.season && prog.episode === e.episode;
      const code = `S${String(e.season).padStart(2, "0")}E${String(e.episode).padStart(2, "0")}`;
      
      const cleanTitle = String(e.name)
        .replace(/\.[^/.]+$/, "")
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      return `
        <div class="player-ep-row ${isCurrent ? "active" : ""} ${watched ? "watched" : ""}" data-file="${encodeURIComponent(e.name)}">
          <div class="flex flex-col gap-1 min-w-0">
            <span class="font-mono text-[9px] text-primary-container font-bold">${code}${isCurrent ? " • oynatılıyor" : ""}</span>
            <span class="text-xs text-on-surface truncate font-semibold">${escapeHtml(cleanTitle)}</span>
          </div>
          <span class="material-symbols-outlined text-sm flex-shrink-0 text-primary-container/80">play_arrow</span>
        </div>
      `;
    }).join("");

    elVideoEpisodesList.querySelectorAll(".player-ep-row").forEach(row => {
      row.addEventListener("click", () => {
        const file = decodeURIComponent(row.dataset.file);
        closeEpisodesPanel();
        openVideoPlayer(file);
      });
    });
  }

  const initialSeason = elVideoEpisodesSeasonSelect ? Number.parseInt(elVideoEpisodesSeasonSelect.value, 10) : seasons[0];
  renderPanelEpisodes(initialSeason || seasons[0]);

  if (elVideoEpisodesSeasonSelect) {
    elVideoEpisodesSeasonSelect.onchange = () => {
      const s = Number.parseInt(elVideoEpisodesSeasonSelect.value, 10);
      renderPanelEpisodes(s);
    };
  }
}

function updateNextEpisodeButtonState(currentFileName) {
  if (!elBtnVideoNextEp) return;
  const meta = parseSeriesMetaClient(currentFileName);
  if (!meta) {
    elBtnVideoNextEp.classList.add("hidden");
    return;
  }
  const episodes = librarySeriesIndex.get(meta.key);
  if (episodes && episodes.length > 0) {
    const sorted = episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
    const currentIndex = sorted.findIndex(e => e.name === currentFileName);
    if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
      elBtnVideoNextEp.classList.remove("hidden");
      elBtnVideoNextEp.dataset.nextFile = encodeURIComponent(sorted[currentIndex + 1].name);
    } else {
      elBtnVideoNextEp.classList.add("hidden");
    }
  } else {
    elBtnVideoNextEp.classList.add("hidden");
  }
}

function playSeriesNextEpisode(currentFileName) {
  const meta = parseSeriesMetaClient(currentFileName);
  if (!meta) return;
  const episodes = librarySeriesIndex.get(meta.key);
  if (episodes && episodes.length > 0) {
    const sorted = episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
    const currentIndex = sorted.findIndex(e => e.name === currentFileName);
    if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
      const nextFile = sorted[currentIndex + 1].name;
      openVideoPlayer(nextFile);
    }
  }
}

function showNextEpisodeCountdown(nextEp, secondsLeft) {
  if (!elNextEpisodeCountdown) return;
  
  const cleanEpTitle = String(nextEp.name)
    .replace(/\.[^/.]+$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (elNextEpCountdownTitle) elNextEpCountdownTitle.textContent = cleanEpTitle;
  if (elNextEpCountdownTime) elNextEpCountdownTime.textContent = `${secondsLeft} saniye içinde...`;
  
  elNextEpisodeCountdown.classList.add("visible");
  
  if (elBtnNextEpCountdownPlay) {
    elBtnNextEpCountdownPlay.onclick = () => {
      hideNextEpisodeCountdown();
      openVideoPlayer(nextEp.name);
    };
  }
}

function hideNextEpisodeCountdown() {
  if (!elNextEpisodeCountdown) return;
  elNextEpisodeCountdown.classList.remove("visible");
}

function toggleSpeedDropdown() {
  if (!elSpeedDropdownList) return;
  const isVisible = elSpeedDropdownList.classList.contains("dropdown-list-visible");
  closeAllDropdowns();
  if (!isVisible) {
    elSpeedDropdownList.classList.add("dropdown-list-visible");
    if (elBtnVideoSpeed) {
      const arrow = elBtnVideoSpeed.querySelector(".select-arrow-icon");
      if (arrow) arrow.classList.add("dropdown-arrow-rotate");
    }
  }
}

function toggleSubtitleDropdown() {
  if (!elSubtitleDropdownList) return;
  const isVisible = elSubtitleDropdownList.classList.contains("dropdown-list-visible");
  closeAllDropdowns();
  if (!isVisible) {
    elSubtitleDropdownList.classList.add("dropdown-list-visible");
    if (elBtnVideoSubtitle) {
      const arrow = elBtnVideoSubtitle.querySelector(".select-arrow-icon");
      if (arrow) arrow.classList.add("dropdown-arrow-rotate");
    }
  }
}

function toggleSeasonDropdown() {
  if (!elVideoSeasonDropdownList) return;
  const isVisible = elVideoSeasonDropdownList.classList.contains("dropdown-list-visible");
  closeAllDropdowns();
  if (!isVisible) {
    elVideoSeasonDropdownList.classList.add("dropdown-list-visible");
    if (elBtnVideoSeasonPicker) {
      const arrow = elBtnVideoSeasonPicker.querySelector(".select-arrow-icon");
      if (arrow) arrow.classList.add("dropdown-arrow-rotate");
    }
  }
}

function closeAllDropdowns() {
  if (elSpeedDropdownList) elSpeedDropdownList.classList.remove("dropdown-list-visible");
  if (elSubtitleDropdownList) elSubtitleDropdownList.classList.remove("dropdown-list-visible");
  if (elVideoSeasonDropdownList) elVideoSeasonDropdownList.classList.remove("dropdown-list-visible");
  
  if (elBtnVideoSpeed) {
    const arrow = elBtnVideoSpeed.querySelector(".select-arrow-icon");
    if (arrow) arrow.classList.remove("dropdown-arrow-rotate");
  }
  if (elBtnVideoSubtitle) {
    const arrow = elBtnVideoSubtitle.querySelector(".select-arrow-icon");
    if (arrow) arrow.classList.remove("dropdown-arrow-rotate");
  }
  if (elBtnVideoSeasonPicker) {
    const arrow = elBtnVideoSeasonPicker.querySelector(".select-arrow-icon");
    if (arrow) arrow.classList.remove("dropdown-arrow-rotate");
  }

  // Dinamik olarak eklenen select dropdown'larını da kapat
  document.querySelectorAll(".custom-select-wrapper").forEach(wrapper => {
    if (typeof wrapper.closeDropdown === "function") {
      wrapper.closeDropdown();
    }
  });
}

function makeSelectCustom(selectElement, placeholderPrefix = "") {
  if (!selectElement || selectElement.dataset.customized === "true") return;
  selectElement.dataset.customized = "true";
  
  selectElement.style.display = "none";
  
  const wrapper = document.createElement("div");
  wrapper.className = "relative inline-block custom-select-wrapper";
  
  if (selectElement.className) {
    const classes = selectElement.className.replace("hidden", "").trim();
    if (classes) {
      wrapper.className += " " + classes;
    }
  }
  if (selectElement.style.minWidth) {
    wrapper.style.minWidth = selectElement.style.minWidth;
  }
  
  const triggerBtn = document.createElement("button");
  triggerBtn.className = "h-8 min-w-[70px] bg-black/40 border border-outline rounded-lg px-2.5 font-mono text-[10px] text-on-surface hover:text-primary-container hover:border-primary-container transition-all flex items-center justify-between gap-1 w-full";
  triggerBtn.type = "button";
  
  const labelSpan = document.createElement("span");
  labelSpan.className = "truncate flex-grow text-left";
  
  const arrowSpan = document.createElement("span");
  arrowSpan.className = "material-symbols-outlined text-[12px] transition-transform select-arrow-icon shrink-0";
  arrowSpan.style.fontSize = "12px";
  arrowSpan.textContent = "keyboard_arrow_down";
  
  triggerBtn.appendChild(labelSpan);
  triggerBtn.appendChild(arrowSpan);
  
  const dropdownList = document.createElement("div");
  dropdownList.className = "absolute top-9 right-0 bg-black/95 border border-outline/30 rounded-lg py-1 shadow-2xl z-30 min-w-full flex flex-col gap-0.5 transition-all opacity-0 pointer-events-none transform -translate-y-1 max-h-48 overflow-y-auto custom-scrollbar";
  
  wrapper.appendChild(triggerBtn);
  wrapper.appendChild(dropdownList);
  
  selectElement.parentNode.insertBefore(wrapper, selectElement.nextSibling);
  
  const reposition = () => {
    if (!dropdownList.parentNode) return;
    const rect = triggerBtn.getBoundingClientRect();
    dropdownList.style.position = "fixed";
    dropdownList.style.left = `${rect.left}px`;
    dropdownList.style.right = "auto";
    dropdownList.style.width = `${rect.width}px`;
    
    // Yüksekliği sınırla veya scrollHeight'ı kullan
    const dropdownHeight = Math.min(dropdownList.scrollHeight, 192); // max-h-48 (12rem = 192px)
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
      // Üste aç
      dropdownList.style.top = `${rect.top - dropdownHeight - 4}px`;
    } else {
      // Alta aç
      dropdownList.style.top = `${rect.bottom + 4}px`;
    }
    dropdownList.style.zIndex = "9999";
  };
  
  const updateDropdownItems = () => {
    dropdownList.innerHTML = "";
    const options = Array.from(selectElement.options);
    
    const activeIndex = selectElement.selectedIndex >= 0 ? selectElement.selectedIndex : 0;
    const activeOption = options[activeIndex];
    if (activeOption) {
      labelSpan.textContent = activeOption.textContent;
    } else {
      labelSpan.textContent = placeholderPrefix || "...";
    }
    
    options.forEach((opt, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "px-3 py-1.5 text-left font-mono text-[10px] text-on-surface hover:bg-white/5 hover:text-primary-container transition-colors w-full truncate block";
      if (idx === activeIndex) {
        btn.classList.add("active");
      }
      btn.textContent = opt.textContent;
      btn.dataset.value = opt.value;
      
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        
        selectElement.value = opt.value;
        selectElement.dispatchEvent(new Event("change"));
        
        updateDropdownItems();
        closeAllDropdowns();
      });
      
      dropdownList.appendChild(btn);
    });
  };
  
  triggerBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = dropdownList.classList.contains("dropdown-list-visible");
    closeAllDropdowns();
    if (!isVisible) {
      document.body.appendChild(dropdownList);
      
      // Önce konumu ayarla (menü henüz görünmezken)
      reposition();
      
      // Tarayıcının konum değişikliğini kaydetmesi için reflow zorla
      dropdownList.offsetHeight; 
      
      dropdownList.classList.add("dropdown-list-visible");
      arrowSpan.classList.add("dropdown-arrow-rotate");
      
      // Kaydırma ve yeniden boyutlandırma olaylarını dinle
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
    }
  });
  
  updateDropdownItems();

  // Programatik değer ve selectedIndex değişikliklerini yakalayıp özel UI'ı senkronize et
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(selectElement, "value", {
    get() {
      return valueDesc.get.call(this);
    },
    set(val) {
      valueDesc.set.call(this, val);
      updateDropdownItems();
    },
    configurable: true
  });

  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "selectedIndex");
  Object.defineProperty(selectElement, "selectedIndex", {
    get() {
      return indexDesc.get.call(this);
    },
    set(val) {
      indexDesc.set.call(this, val);
      updateDropdownItems();
    },
    configurable: true
  });
  
  const observer = new MutationObserver(() => {
    updateDropdownItems();
  });
  observer.observe(selectElement, { childList: true, characterData: true, subtree: true });
  
  selectElement.addEventListener("change", () => {
    updateDropdownItems();
  });
  
  wrapper.closeDropdown = () => {
    dropdownList.classList.remove("dropdown-list-visible");
    arrowSpan.classList.remove("dropdown-arrow-rotate");
    if (dropdownList.parentNode === document.body) {
      document.body.removeChild(dropdownList);
      wrapper.appendChild(dropdownList);
    }
    
    // Orijinal absolute stillere geri dön
    dropdownList.style.position = "";
    dropdownList.style.left = "";
    dropdownList.style.right = "";
    dropdownList.style.width = "";
    dropdownList.style.top = "";
    dropdownList.style.zIndex = "";
    
    window.removeEventListener("scroll", reposition, true);
    window.removeEventListener("resize", reposition);
  };
}
