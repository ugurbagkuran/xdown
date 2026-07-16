import { apiGetSeriesDetail, apiExtractSeriesVideo } from "../services/api.js";
import { 
  autoDownloadFilm, 
  escapeHtml, 
  downloadTasksByUrl, 
  episodeDownloadTasksByEpisodeUrl, 
  bindTaskToEpisodeItem 
} from "./downloadManager.js";

// DOM Elements
let elSeriesModal, elModalSeriesTitle, elBtnCloseModal, elModalSeasonsBar,
    elModalEpisodesList, elBulkDownloadPanel, elBulkLang, elBulkQuality, elBtnBulkDownload;

const episodeDetailsCache = new Map();
let activeSeasonEpisodes = [];
let onProgressRefreshCallback = null;

function getElements() {
  elSeriesModal = document.getElementById("series-modal");
  elModalSeriesTitle = document.getElementById("modal-series-title");
  elBtnCloseModal = document.getElementById("btn-close-modal");
  elModalSeasonsBar = document.getElementById("modal-seasons-bar");
  elModalEpisodesList = document.getElementById("modal-episodes-list");
  elBulkDownloadPanel = document.getElementById("bulk-download-panel");
  elBulkLang = document.getElementById("bulk-lang");
  elBulkQuality = document.getElementById("bulk-quality");
  elBtnBulkDownload = document.getElementById("btn-bulk-download");
}

function getTaskByEpisodeUrl(episodeUrl) {
  if (!episodeUrl) return null;
  const taskUrl = episodeDownloadTasksByEpisodeUrl.get(episodeUrl);
  if (!taskUrl) return null;
  return downloadTasksByUrl.get(taskUrl) || null;
}

export function registerProgressRefreshCallback(callback) {
  onProgressRefreshCallback = callback;
}

export async function showSeriesDetails(seriesUrl, seriesTitle) {
  getElements();
  if (elModalSeriesTitle) elModalSeriesTitle.textContent = seriesTitle;
  if (elModalSeasonsBar) elModalSeasonsBar.innerHTML = '<div class="text-xs text-on-surface-variant font-mono py-2">yükleniyor...</div>';
  if (elModalEpisodesList) elModalEpisodesList.innerHTML = "";
  if (elBulkDownloadPanel) elBulkDownloadPanel.classList.add("hidden");
  if (elSeriesModal) elSeriesModal.classList.remove("hidden");

  try {
    const data = await apiGetSeriesDetail(seriesUrl);
    if (!data.success || data.seasons.length === 0) {
      if (elModalSeasonsBar) elModalSeasonsBar.innerHTML = '<div class="text-xs text-red-400 font-mono py-2">sezon bulunamadı.</div>';
      return;
    }

    if (elModalSeasonsBar) {
      elModalSeasonsBar.innerHTML = data.seasons.map(s => 
        `<button class="season-tab-btn px-4 py-1.5 bg-surface-container border border-outline rounded-full text-xs font-bold text-on-surface hover:border-primary-container transition-all" data-season="${s.season}">Sezon ${s.season}</button>`
      ).join("");

      elModalSeasonsBar.querySelectorAll(".season-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          elModalSeasonsBar.querySelectorAll(".season-tab-btn").forEach(b => {
            b.className = "season-tab-btn px-4 py-1.5 bg-surface-container border border-outline rounded-full text-xs font-bold text-on-surface hover:border-primary-container transition-all";
          });
          btn.className = "season-tab-btn px-4 py-1.5 bg-primary-container text-black font-bold rounded-full text-xs transition-all";
          const seasonNum = parseInt(btn.dataset.season, 10);
          const seasonData = data.seasons.find(s => s.season === seasonNum);
          loadSeasonAndEpisodes(seasonData.episodes, seriesTitle);
        });
      });

      // Default to first season
      const firstTab = elModalSeasonsBar.querySelector(".season-tab-btn");
      if (firstTab) firstTab.click();
    }
  } catch (err) {
    if (elModalSeasonsBar) elModalSeasonsBar.innerHTML = `<div class="text-xs text-red-400 font-mono py-2">Hata: ${err.message}</div>`;
  }
}

async function loadSeasonAndEpisodes(episodes, seriesTitle) {
  activeSeasonEpisodes = episodes;
  if (elModalEpisodesList) elModalEpisodesList.innerHTML = '<div class="text-xs text-on-surface-variant font-mono py-8 text-center w-full">bölümler yükleniyor...</div>';
  if (elBulkDownloadPanel) elBulkDownloadPanel.classList.add("hidden");

  renderEpisodes(episodes);

  // Toplu indirme paneli için ilk bölümün yayın ve kalitelerini çekelim
  if (episodes.length > 0) {
    const firstEp = episodes[0];
    try {
      let details = episodeDetailsCache.get(firstEp.url);
      if (!details) {
        details = await apiExtractSeriesVideo(firstEp.url);
        if (details.success) {
          episodeDetailsCache.set(firstEp.url, details);
        }
      }

      if (details && details.success && details.streams.length > 0) {
        populateBulkPanelOptions(details.streams);
      }
    } catch (_) {}
  }
}

function renderEpisodes(episodes) {
  if (!elModalEpisodesList) return;
  elModalEpisodesList.innerHTML = episodes.map(ep => {
    const task = getTaskByEpisodeUrl(ep.url);
    const hasTask = !!task;
    const progressPct = hasTask ? task.progress : 0;
    const isActive = hasTask && (task.status === "running" || task.status === "preparing" || task.status === "waiting");

    return `
      <div class="episode-row flex items-center justify-between p-3 bg-surface-container-low border border-outline/35 rounded-xl hover:border-primary-container/40 transition-all relative overflow-hidden" data-ep-url="${ep.url}">
        <div class="episode-progress-overlay absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-300" style="width: ${progressPct}%; background: rgba(255, 110, 64, 0.15)"></div>
        <div class="episode-title flex flex-col z-10 min-w-0 pr-4 flex-grow">
          <span class="block text-xs font-bold text-on-surface truncate">${ep.name}</span>
          <span class="block text-[9px] text-on-surface-variant/60 font-mono mt-0.5 truncate">${ep.title}</span>
        </div>
        <div class="episode-controls flex gap-2 z-10 shrink-0">
          <button class="ep-dl-btn px-4 py-1.5 bg-primary-container text-black font-bold rounded-full text-[10px] hover:bg-primary-fixed transition-colors flex items-center ${isActive ? "hidden" : ""}">
            <i class="fa-solid fa-download mr-1"></i> indir.
          </button>
          <button class="ep-cancel-btn px-4 py-1.5 bg-red-950/40 text-red-400 border border-red-500/30 rounded-full text-[10px] hover:bg-red-900/60 transition-colors ${!isActive ? "hidden" : ""}">
            iptal.
          </button>
        </div>
      </div>
    `;
  }).join("");

  elModalEpisodesList.querySelectorAll(".episode-row").forEach((row, index) => {
    const ep = episodes[index];
    const dlBtn = row.querySelector(".ep-dl-btn");
    const cancelBtn = row.querySelector(".ep-cancel-btn");
    const task = getTaskByEpisodeUrl(ep.url);

    if (task) {
      bindTaskToEpisodeItem(task, row);
    }

    dlBtn.addEventListener("click", async () => {
      dlBtn.disabled = true;
      dlBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> hazırlanıyor...';
      
      try {
        let details = episodeDetailsCache.get(ep.url);
        if (!details) {
          details = await apiExtractSeriesVideo(ep.url);
          if (details.success) {
            episodeDetailsCache.set(ep.url, details);
          }
        }

        if (!details || !details.success || details.streams.length === 0) {
          throw new Error("Yayın kaynağı bulunamadı.");
        }

        const stream = details.streams[0]; // Türkçe Altyazılı veya ilk yayın
        const quality = stream.qualities[0];
        
        await autoDownloadFilm(
          quality.m3u8Url,
          ep.title + ".ts",
          stream.subtitles || [],
          row,
          ep.url,
          quality.resolution,
          "https://www.diziyou.one/",
          onProgressRefreshCallback
        );
      } catch (err) {
        alert("Bölüm indirme başlatılamadı: " + err.message);
        dlBtn.disabled = false;
        dlBtn.innerHTML = '<i class="fa-solid fa-download mr-1"></i> indir.';
      }
    });

    cancelBtn.addEventListener("click", async () => {
      const activeTask = getTaskByEpisodeUrl(ep.url);
      if (activeTask && activeTask.taskId) {
        cancelBtn.disabled = true;
        cancelBtn.textContent = "iptal ediliyor...";
        await apiCancelTask(activeTask.taskId);
      }
    });
  });
}

function populateBulkPanelOptions(streams) {
  if (!elBulkLang || !elBulkQuality || !elBulkDownloadPanel) return;

  elBulkLang.innerHTML = streams.map(s => `<option value="${s.name}">${s.name}</option>`).join("");
  
  const updateQualities = () => {
    const selectedLang = elBulkLang.value;
    const stream = streams.find(s => s.name === selectedLang);
    if (stream && stream.qualities) {
      elBulkQuality.innerHTML = stream.qualities.map(q => 
        `<option value="${q.resolution}">${q.resolution}</option>`
      ).join("");
    }
  };

  elBulkLang.onchange = updateQualities;
  updateQualities();

  elBulkDownloadPanel.classList.remove("hidden");
}

function getEpisodeQuality(streams, lang, quality) {
  const stream = streams.find((s) => s.name === lang);
  if (!stream || !stream.qualities) return null;
  return (
    stream.qualities.find((q) => q.resolution === quality) ||
    stream.qualities[0]
  );
}

export function initSeriesModalEvents() {
  getElements();

  if (elBtnCloseModal) {
    elBtnCloseModal.addEventListener("click", () => {
      if (elSeriesModal) elSeriesModal.classList.add("hidden");
    });
  }

  if (elBtnBulkDownload) {
    elBtnBulkDownload.addEventListener("click", async () => {
      const lang = elBulkLang.value;
      const quality = elBulkQuality.value;
      
      const confirmText = `${activeSeasonEpisodes.length} bölümün (${lang} - ${quality}) indirme sırasına eklenmesini onaylıyor musunuz?`;
      if (!confirm(confirmText)) return;

      elBtnBulkDownload.disabled = true;
      elBtnBulkDownload.textContent = "başlatılıyor...";

      for (const ep of activeSeasonEpisodes) {
        const task = getTaskByEpisodeUrl(ep.url);
        if (task && (task.status === "running" || task.status === "waiting" || task.status === "preparing")) {
          continue; // Zaten indirilenleri atla
        }

        try {
          const row = elModalEpisodesList.querySelector(`[data-ep-url="${ep.url}"]`);
          
          let details = episodeDetailsCache.get(ep.url);
          if (!details) {
            details = await apiExtractSeriesVideo(ep.url);
            if (details.success) {
              episodeDetailsCache.set(ep.url, details);
            }
          }

          if (details && details.success) {
            const stream = details.streams.find(s => s.name === lang) || details.streams[0];
            const q = getEpisodeQuality(details.streams, lang, quality);
            
            if (q) {
              await autoDownloadFilm(
                q.m3u8Url,
                ep.title + ".ts",
                stream.subtitles || [],
                row,
                ep.url,
                q.resolution,
                "https://www.diziyou.one/",
                onProgressRefreshCallback
              );
            }
          }
        } catch (_) {}
      }

      elBtnBulkDownload.disabled = false;
      elBtnBulkDownload.textContent = "sezonu_indir.";
    });
  }
}
