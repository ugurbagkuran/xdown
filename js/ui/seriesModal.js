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
let currentSeriesTitle = "";

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
  currentSeriesTitle = seriesTitle || "";
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

let currentSeasonStreams = [];

function cleanEpisodeName(rawName, episodeNum) {
  if (!rawName) return "";
  let name = rawName.trim();
  if (name.startsWith("(") && name.endsWith(")")) {
    name = name.slice(1, -1).trim();
  }
  if (name.toLowerCase() === `${episodeNum}. bölüm` || name.toLowerCase() === `bölüm ${episodeNum}`) {
    return "";
  }
  return name;
}

function updateEpisodeRowSelectors(row, streams, selectedLang = null, selectedQuality = null) {
  const langSelect = row.querySelector(".ep-lang-select");
  const qualitySelect = row.querySelector(".ep-quality-select");
  if (!langSelect || !qualitySelect || !streams || streams.length === 0) return;

  const currentLang = selectedLang || langSelect.value || streams[0].name;
  langSelect.innerHTML = streams.map(s => 
    `<option value="${s.name}" ${s.name === currentLang ? "selected" : ""}>${s.name}</option>`
  ).join("");

  const updateQualities = () => {
    const chosenLang = langSelect.value;
    const stream = streams.find(s => s.name === chosenLang) || streams[0];
    if (stream && stream.qualities) {
      const currentQ = selectedQuality || qualitySelect.value || (stream.qualities[0] ? stream.qualities[0].resolution : "");
      qualitySelect.innerHTML = stream.qualities.map(q => 
        `<option value="${q.resolution}" ${q.resolution === currentQ ? "selected" : ""}>${q.resolution}</option>`
      ).join("");
    }
  };

  langSelect.onchange = () => updateQualities();
  updateQualities();
}

function updateAllEpisodeRowOptions(streams, defaultLang = null, defaultQuality = null) {
  if (!elModalEpisodesList) return;
  elModalEpisodesList.querySelectorAll(".episode-row").forEach(row => {
    updateEpisodeRowSelectors(row, streams, defaultLang, defaultQuality);
  });
}

async function loadSeasonAndEpisodes(episodes, seriesTitle) {
  activeSeasonEpisodes = episodes;
  currentSeasonStreams = [];
  if (elModalEpisodesList) elModalEpisodesList.innerHTML = '<div class="text-xs text-on-surface-variant font-mono py-8 text-center w-full">bölümler yükleniyor...</div>';
  if (elBulkDownloadPanel) elBulkDownloadPanel.classList.add("hidden");

  renderEpisodes(episodes);

  // Toplu indirme paneli ve satır seçicileri için ilk bölümün yayın ve kalitelerini çekelim
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
        currentSeasonStreams = details.streams;
        populateBulkPanelOptions(details.streams);
        updateAllEpisodeRowOptions(details.streams);
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
    const extraName = cleanEpisodeName(ep.name, ep.episode);

    return `
      <div class="episode-row" data-ep-url="${ep.url}">
        <div class="episode-progress-overlay absolute left-0 top-0 bottom-0 pointer-events-none transition-all duration-300" style="width: ${progressPct}%; background: rgba(255, 110, 64, 0.15)"></div>
        <div class="episode-title">
          <div class="ep-num">${ep.season}. Sezon ${ep.episode}. Bölüm</div>
          ${extraName ? `<div class="ep-name" title="${escapeHtml(extraName)}">${escapeHtml(extraName)}</div>` : `<div class="ep-name text-on-surface-variant/40 font-mono text-[10px]">Bölüm ${ep.episode}</div>`}
        </div>
        <div class="episode-controls">
          <select class="ep-lang-select">
            <option value="">yayın yükleniyor...</option>
          </select>
          <select class="ep-quality-select">
            <option value="">kalite...</option>
          </select>
          <button class="ep-dl-btn px-4 py-1.5 bg-primary-container text-black font-bold rounded-full text-xs hover:bg-primary-fixed transition-colors flex items-center shrink-0 ${isActive ? "hidden" : ""}">
            <i class="fa-solid fa-download mr-1.5"></i> indir.
          </button>
          <button class="ep-cancel-btn px-4 py-1.5 bg-red-950/40 text-red-400 border border-red-500/30 rounded-full text-xs hover:bg-red-900/60 transition-colors shrink-0 ${!isActive ? "hidden" : ""}">
            iptal.
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (currentSeasonStreams && currentSeasonStreams.length > 0) {
    updateAllEpisodeRowOptions(currentSeasonStreams);
  }

  elModalEpisodesList.querySelectorAll(".episode-row").forEach((row, index) => {
    const ep = episodes[index];
    const dlBtn = row.querySelector(".ep-dl-btn");
    const cancelBtn = row.querySelector(".ep-cancel-btn");
    const langSelect = row.querySelector(".ep-lang-select");
    const qualitySelect = row.querySelector(".ep-quality-select");
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

        // Satırdaki seçici değerlerini kontrol et
        const selectedLangVal = langSelect ? langSelect.value : "";
        const selectedQualityVal = qualitySelect ? qualitySelect.value : "";

        let stream = details.streams.find(s => s.name === selectedLangVal) || details.streams[0];
        let quality = stream.qualities ? (stream.qualities.find(q => q.resolution === selectedQualityVal) || stream.qualities[0]) : null;
        
        if (!quality) {
          throw new Error("Kalite akışı çözümlenemedi.");
        }

        const sNum = String(ep.season).padStart(2, "0");
        const eNum = String(ep.episode).padStart(2, "0");
        const epFileName = `${currentSeriesTitle || "Dizi"} - S${sNum}E${eNum}.mp4`;

        await autoDownloadFilm(
          quality.m3u8Url,
          epFileName,
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
    const stream = streams.find(s => s.name === selectedLang) || streams[0];
    if (stream && stream.qualities) {
      elBulkQuality.innerHTML = stream.qualities.map(q => 
        `<option value="${q.resolution}">${q.resolution}</option>`
      ).join("");
    }
  };

  elBulkLang.onchange = () => {
    updateQualities();
    // Toplu panel dili değişince tüm satırları senkronize et
    updateAllEpisodeRowOptions(streams, elBulkLang.value, elBulkQuality.value);
  };

  elBulkQuality.onchange = () => {
    // Toplu panel kalitesi değişince tüm satırları senkronize et
    updateAllEpisodeRowOptions(streams, elBulkLang.value, elBulkQuality.value);
  };

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
              const sNum = String(ep.season).padStart(2, "0");
              const eNum = String(ep.episode).padStart(2, "0");
              const epFileName = `${currentSeriesTitle || "Dizi"} - S${sNum}E${eNum}.mp4`;

              await autoDownloadFilm(
                q.m3u8Url,
                epFileName,
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
