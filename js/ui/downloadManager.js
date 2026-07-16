import { 
  apiExtractPlayer, 
  apiExtractStream, 
  apiAnalyze, 
  apiDownload, 
  apiGetTaskStatus, 
  apiCancelTask,
  apiGetSettings 
} from "../services/api.js";
import { openVideoPlayer } from "./videoPlayer.js";

const SVG_DOWNLOAD_ICON = `<svg class="download-svg-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" stroke-linejoin="miter" style="display:inline-block; vertical-align:middle; margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>`;

export const downloadTasksByUrl = new Map();
export const episodeDownloadTasksByEpisodeUrl = new Map();
let taskCounter = 0;
let fetchDownloadsListCallback = null;

// DOM Elements inside module
let elDownloadCountBadge, elDmTasksList, elDownloadManagerPanel, elBtnClearDm;

function getElements() {
  elDownloadCountBadge = document.getElementById("download-count-badge");
  elDmTasksList = document.getElementById("dm-tasks-list");
  elDownloadManagerPanel = document.getElementById("download-manager-panel");
  elBtnClearDm = document.getElementById("btn-clear-dm");
}

export function escapeHtml(str) {
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

export function registerDownloadsCallback(callback) {
  fetchDownloadsListCallback = callback;
}

export function updateDownloadCountBadge() {
  getElements();
  if (!elDmTasksList || !elDownloadCountBadge) return;
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

export function updateEpisodeDownloadState(task, pct = task.progress || 0) {
  if (!task.itemElement) return;

  const overlay = task.itemElement.querySelector(".episode-progress-overlay");
  if (overlay) {
    overlay.style.width = `${pct}%`;
    if (task.status === "completed") {
      overlay.style.background = "rgba(255, 110, 64, 0.22)";
    } else if (task.status === "error" || task.status === "cancelled") {
      overlay.style.background = "rgba(255, 92, 92, 0.2)";
    } else {
      overlay.style.background = "rgba(255, 110, 64, 0.15)";
    }
  }

  const epTitleSpan = task.itemElement.querySelector(".episode-title span:first-child");
  if (epTitleSpan) {
    if (!epTitleSpan.dataset.baseText) {
      epTitleSpan.dataset.baseText = epTitleSpan.textContent;
    }
    if (task.status === "running" || task.status === "waiting") {
      const suffix = task.status === "waiting" ? " (sırada)" : ` (${pct}%)`;
      epTitleSpan.textContent = `${epTitleSpan.dataset.baseText}${suffix}`;
    } else {
      epTitleSpan.textContent = epTitleSpan.dataset.baseText;
    }
  }

  const dlBtn = task.itemElement.querySelector(".ep-dl-btn");
  const cancelBtn = task.itemElement.querySelector(".ep-cancel-btn");
  if (dlBtn && cancelBtn) {
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

export function bindTaskToEpisodeItem(task, itemElement) {
  task.itemElement = itemElement;
  updateEpisodeDownloadState(task, task.progress || 0);
}

function createDownloadCard(filmTitle) {
  getElements();
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

export async function autoDownloadFilm(
  filmUrl,
  filmTitle,
  subtitles = [],
  itemElement = null,
  episodeUrl = null,
  selectedQuality = null,
  customReferer = null,
  onProgressRefresh = null,
) {
  getElements();
  return new Promise(async (resolve) => {
    if (downloadTasksByUrl.has(filmUrl)) {
      const existingTask = downloadTasksByUrl.get(filmUrl);
      if (itemElement) bindTaskToEpisodeItem(existingTask, itemElement);
      elDownloadManagerPanel.classList.remove("hidden");
      const existingCard = elDmTasksList.querySelector(`[data-task-id="${existingTask.procId}"]`);
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
    
    if (onProgressRefresh) onProgressRefresh();

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
        await apiCancelTask(task.taskId);
      } else {
        finishTask();
        root.remove();
        if (elDmTasksList.children.length === 0) {
          elDmTasksList.innerHTML = '<div class="dm-empty">aktif indirme yok.</div>';
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
        const playerData = await apiExtractPlayer(filmUrl);
        if (!playerData.success) throw new Error(playerData.error);
        setExtractStep(root, "film", "done");

        setExtractStep(root, "ajax", "active");
        const sData = await apiExtractStream(playerData.postId, playerData.nonce, "FastPlay", filmUrl, playerData.partKey);
        if (!sData.success) throw new Error(sData.error);
        setExtractStep(root, "ajax", "done");
        setExtractStep(root, "manifest", "done", sData.usedPlayer ? `(${sData.usedPlayer})` : "");

        streamData = sData;
      }

      setExtractStep(root, "analyze", "active");
      const analyzeData = await apiAnalyze(streamData.manifestUrl, streamData.streamReferer, selectedQuality);
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
          try { return new URL(u).host; } catch (_) { return null; }
        })
        .filter(Boolean);

      const concurrency = candidateHosts.length > 1 ? 12 : 4;
      const suggestion = analyzeData.suggestion || { method: "none" };

      const dlData = await apiDownload({
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
      });
      if (!dlData.success) throw new Error(dlData.error);

      task.taskId = dlData.taskId;
      task.total = analyzeData.segments.length;

      progressCount.textContent = `0 / ${task.total}`;
      task.status = "waiting";
      badge.textContent = "bekliyor.";
      badge.className = "status-badge status-running dm-task-status-badge";
      updateEpisodeDownloadState(task, 0);
      updateDownloadCountBadge();

      resolve();

      task.interval = setInterval(async () => {
        try {
          const data = await apiGetTaskStatus(task.taskId);

          progressCount.textContent = `${data.completed} / ${data.total || task.total}`;
          const pct = data.total ? Math.round((data.completed / data.total) * 100) : 0;
          progressBarFill.style.width = `${pct}%`;
          progressPercent.textContent = `${pct}%`;
          task.progress = pct;
          task.status = data.status;
          updateEpisodeDownloadState(task, pct);
          
          if (onProgressRefresh) onProgressRefresh();

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
            
            // Sistem bildirimi gönder
            try {
              apiGetSettings().then(settingsData => {
                if (settingsData.success && settingsData.settings && settingsData.settings.showNotifications) {
                  if (Notification.permission === "granted") {
                    new Notification("İndirme Tamamlandı", {
                      body: `${task.fileName || 'Video'} başarıyla indirildi.`,
                      icon: "/download.svg"
                    });
                  } else if (Notification.permission !== "denied") {
                    Notification.requestPermission().then(permission => {
                      if (permission === "granted") {
                        new Notification("İndirme Tamamlandı", {
                          body: `${task.fileName || 'Video'} başarıyla indirildi.`,
                          icon: "/download.svg"
                        });
                      }
                    });
                  }
                }
              });
            } catch (err) {
              console.error("Bildirim gönderilemedi:", err);
            }
            downloadBtn.href = `/downloads/${data.outputName}`;
            downloadBtn.setAttribute("download", data.outputName);
            cancelBtn.remove();
            
            const parent = downloadBtn.parentNode;
            parent.querySelectorAll(".sub-dl-btn").forEach(el => el.remove());
            parent.querySelectorAll(".task-play-btn").forEach(el => el.remove());
            parent.querySelectorAll(".task-export-btn").forEach(el => el.remove());

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

            if (fetchDownloadsListCallback) fetchDownloadsListCallback();

            task.status = "completed";
            task.progress = 100;
            updateEpisodeDownloadState(task, 100);

            finishTask();
            updateDownloadCountBadge();
          } else if (data.status === "error" || data.status === "cancelled") {
            badge.textContent = data.status === "cancelled" ? "iptal edildi." : "hata.";
            badge.className = data.status === "cancelled"
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
      sizeLabel.textContent = err.message ? `hata: ${err.message}` : "hata oluştu";
      updateEpisodeDownloadState(task, task.progress || 0);
      finishTask();
      updateDownloadCountBadge();
      resolve();
    }
  });
}

export function initDownloadManagerEvents() {
  getElements();

  if (elBtnClearDm) {
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
  }
}
