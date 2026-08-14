// Import modular components
import { initTabs } from "./js/ui/tabs.js";
import { initSettings } from "./js/ui/settings.js";
import { 
  initDownloadManagerEvents, 
  autoDownloadFilm, 
  registerDownloadsCallback, 
  updateDownloadCountBadge,
  escapeHtml 
} from "./js/ui/downloadManager.js";
import { 
  initSeriesModalEvents, 
  showSeriesDetails, 
  registerProgressRefreshCallback 
} from "./js/ui/seriesModal.js";
import {
  setupVideoPlayerEvents, 
  registerLibraryData, 
  closeAllDropdowns,
  openVideoPlayer,
  registerPlayerCloseCallback
} from "./js/ui/videoPlayer.js";
import { openEpisodePicker } from "./js/ui/episodePicker.js";
import { 
  apiSearch, 
  apiGetDownloadsList, 
  apiDeleteFile, 
  apiDeleteSeries, 
  apiOpenFolder, 
  apiGetStorageInfo 
} from "./js/services/api.js";

// DOM Elements
const elSearchInput = document.getElementById("search-input");
const elBtnSearch = document.getElementById("btn-search");
const elFilmGrid = document.getElementById("film-grid");
const elLibraryGrid = document.getElementById("library-grid");
const elLibrarySearchInput = document.getElementById("library-search-input");
const elLibraryTotalCount = document.getElementById("library-total-count");
const elLibSizeVal = document.getElementById("lib-size-val");
const elLibFreeVal = document.getElementById("lib-free-val");
const elBtnOpenDownloadsDir = document.getElementById("btn-open-downloads-dir");

// App States
let activeSearchType = "movie";
let libraryFiles = [];
const librarySeriesIndex = new Map(); // seriesKey -> [episodes]

function showConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("custom-confirm-modal");
    const text = document.getElementById("custom-confirm-text");
    const btnYes = document.getElementById("btn-confirm-yes");
    const btnNo = document.getElementById("btn-confirm-no");
    if (!modal || !text || !btnYes || !btnNo) {
      resolve(window.confirm(message));
      return;
    }

    text.textContent = message;
    modal.classList.remove("hidden");

    const cleanup = () => {
      modal.classList.add("hidden");
      btnYes.removeEventListener("click", onYes);
      btnNo.removeEventListener("click", onNo);
    };

    const onYes = () => {
      cleanup();
      resolve(true);
    };

    const onNo = () => {
      cleanup();
      resolve(false);
    };

    btnYes.addEventListener("click", onYes);
    btnNo.addEventListener("click", onNo);
  });
}

async function updateStorageDisplay() {
  try {
    const data = await apiGetStorageInfo();
    if (data && data.success) {
      if (elLibSizeVal) elLibSizeVal.textContent = data.libraryFormatted || "0 B";
      if (elLibFreeVal) elLibFreeVal.textContent = data.freeFormatted || "0 GB";
    }
  } catch (_) {}
}

// Search Type Selector Logic
document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach((b) => {
      b.className = "type-btn px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant hover:text-on-surface transition-all";
    });
    btn.className = "type-btn px-4 py-2 rounded-full text-xs font-bold bg-primary-container text-black transition-all";
    activeSearchType = btn.dataset.type;

    if (activeSearchType === "series") {
      elSearchInput.placeholder = "aranacak dizi adını girin (Breaking Bad, vb.)...";
    } else {
      elSearchInput.placeholder = "aranacak film adını girin...";
    }
  });
});

// Arama Arayüzü Tetikleyicileri
elBtnSearch.addEventListener("click", doSearch);
elSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

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

  try {
    const data = await apiSearch(q, activeSearchType);
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
        // Doğrudan film indir/çöz
        const filmUrl = card.dataset.url;
        const filmTitle = card.dataset.title;
        autoDownloadFilm(filmUrl, filmTitle + ".ts", [], null, null, null, null, renderLibrary);
      }
    });
  });
}

// Kütüphane Arama ve Filtreleme
if (elLibrarySearchInput) {
  elLibrarySearchInput.addEventListener("input", () => {
    renderLibraryGrid(libraryFiles);
  });
}

async function fetchDownloadsList() {
  try {
    const data = await apiGetDownloadsList();
    if (data.success) {
      libraryFiles = data.files || [];
      buildSeriesLibraryIndex();
      registerLibraryData(libraryFiles, librarySeriesIndex);
      renderLibraryGrid(libraryFiles);
    }
    updateStorageDisplay();
  } catch (err) {
    console.error("Kütüphane listesi çekilemedi:", err);
  }
}

function parseSeriesMeta(fileName) {
  if (!fileName) return null;
  
  const sPattern = /^(?:(.+?)[._\s-])?S(\d+)E(\d+)(?:[._\s-]|$)/i;
  const matchS = fileName.match(sPattern);
  if (matchS) {
    const rawName = matchS[1] ? matchS[1].replace(/[._-]/g, " ").trim() : "Dizi";
    return {
      key: (matchS[1] || "dizi").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, ""),
      seriesName: rawName || "Dizi",
      season: parseInt(matchS[2], 10),
      episode: parseInt(matchS[3], 10)
    };
  }

  const trPattern = /^(?:(.+?)[._\s-])?(\d+)[._\s]*(?:sezon|sez|s)[._\s]*(\d+)[._\s]*(?:bolum|bölüm|bol|b)(?:[._\s-]|$)/i;
  const matchTr = fileName.match(trPattern);
  if (matchTr) {
    const rawName = matchTr[1] ? matchTr[1].replace(/[._-]/g, " ").trim() : "Dizi";
    return {
      key: (matchTr[1] || "dizi").toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, ""),
      seriesName: rawName || "Dizi",
      season: parseInt(matchTr[2], 10),
      episode: parseInt(matchTr[3], 10)
    };
  }

  return null;
}

function buildSeriesLibraryIndex() {
  librarySeriesIndex.clear();
  libraryFiles.forEach(file => {
    const meta = parseSeriesMeta(file.name);
    if (meta) {
      if (!librarySeriesIndex.has(meta.key)) {
        librarySeriesIndex.set(meta.key, []);
      }
      librarySeriesIndex.get(meta.key).push({
        name: file.name,
        sizeStr: formatBytes(file.size),
        season: meta.season,
        episode: meta.episode,
        title: `${meta.season}. Sezon ${meta.episode}. Bölüm`
      });
    }
  });
}

function renderLibrary() {
  renderLibraryGrid(libraryFiles);
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

function renderLibraryGrid(files) {
  if (!elLibraryGrid) return;
  const q = elLibrarySearchInput ? elLibrarySearchInput.value.trim().toLowerCase() : "";

  // Filtreleme yapalım
  let filtered = files;
  if (q) {
    filtered = files.filter(f => f.name.toLowerCase().includes(q));
  }

  // Seri bölümlerini gruplayalım, her diziden sadece bir "Devam Et" kartı gösterilsin
  const renderedKeys = new Set();
  const gridItemsHtml = [];

  filtered.forEach(file => {
    const meta = parseSeriesMeta(file.name);
    if (meta) {
      if (renderedKeys.has(meta.key)) return; // Bu dizi için kart basıldı
      renderedKeys.add(meta.key);

      // İlerleme durumunu kontrol edelim
      const episodes = librarySeriesIndex.get(meta.key) || [];
      const sorted = episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
      
      // En son oynatılan/açılan bölümü bulmaya çalışalım (Netflix tarzı bellek)
      let targetEp = null;
      try {
        const progStr = localStorage.getItem(`series_prog_${meta.key}`);
        if (progStr) {
          const prog = JSON.parse(progStr);
          if (prog && prog.fileName) {
            const foundEp = episodes.find(e => e.name === prog.fileName);
            if (foundEp) {
              const pos = prog.position || 0;
              const dur = prog.duration || 0;
              if (isEpisodeNearlyFinished(pos, dur)) {
                // Eğer son izlenen bölüm bitmişse, bir sonraki bölümü bulmaya çalış
                const currentIndex = sorted.findIndex(e => e.name === prog.fileName);
                if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
                  targetEp = sorted[currentIndex + 1];
                } else {
                  targetEp = foundEp; // Son bölüm ise kendisi kalsın
                }
              } else {
                targetEp = foundEp; // Yarım kalmışsa doğrudan o bölüm
              }
            }
          }
        }
      } catch (_) {}

      // Eğer son izlenen bölüm bulunamazsa, izleme durumuna göre sıradaki tamamlanmamış bölümü bul
      if (!targetEp) {
        targetEp = sorted[0];
        for (const ep of sorted) {
          const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${ep.name}`) || "0");
          const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${ep.name}`) || "0");
          
          if (!isEpisodeNearlyFinished(pos, dur)) {
            targetEp = ep;
            break;
          }
        }
      }
      
      const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${targetEp.name}`) || "0");
      const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${targetEp.name}`) || "0");
      const progressPct = dur > 0 ? (pos / dur) * 100 : 0;

      gridItemsHtml.push({
        html: `
          <div class="library-card group flex flex-col gap-3 cursor-pointer relative" data-file="${encodeURIComponent(targetEp.name)}" data-is-series="true" data-series-key="${meta.key}">
            <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 group-hover:border-primary-container/50 transition-colors">
              <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="/api/video-thumbnail?file=${encodeURIComponent(targetEp.name)}" alt="" onerror="this.src='https://via.placeholder.com/320x480/111/555?text=${encodeURIComponent(meta.seriesName)}'">
              
              <div class="card-quick-actions">
                <button class="card-action-btn btn-show-episodes" title="Bölümleri Listele">
                  <span class="material-symbols-outlined text-[16px]">playlist_play</span>
                </button>
                <button class="card-action-btn btn-delete btn-delete-series" title="Tüm Diziyi Diskten Sil">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>

              <div class="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                <div class="btn-play-series flex flex-col items-center gap-2 cursor-pointer z-20 hover:scale-105 transition-transform">
                  <span class="material-symbols-outlined text-[48px] text-primary-container drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">play_circle</span>
                  <span class="font-mono text-[9px] text-on-surface-variant">${targetEp.season}. Sezon ${targetEp.episode}. Bölüm</span>
                </div>
              </div>
              ${progressPct > 0 ? `<div class="absolute bottom-0 left-0 h-1.5 bg-primary-container transition-all" style="width: ${progressPct}%"></div>` : ""}
            </div>
            <div class="flex flex-col px-1">
              <h3 class="font-bold text-sm text-on-surface truncate group-hover:text-primary-container transition-colors">${meta.seriesName}</h3>
              <div class="flex justify-between items-center mt-1">
                <span class="font-mono text-xs text-primary-container">${episodes.length} Bölüm</span>
                <span class="font-mono text-[10px] text-on-surface-variant/70">Dizi</span>
              </div>
            </div>
          </div>
        `,
        createdAt: file.createdAt
      });
    } else {
      // Normal film kartı
      const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${file.name}`) || "0");
      const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${file.name}`) || "0");
      const progressPct = dur > 0 ? (pos / dur) * 100 : 0;
      const isWatched = progressPct >= 90 || (dur > 0 && dur - pos < 30);

      gridItemsHtml.push({
        html: `
          <div class="library-card group flex flex-col gap-3 cursor-pointer relative" data-file="${encodeURIComponent(file.name)}">
            <div class="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container border border-outline/50 group-hover:border-primary-container/50 transition-colors">
              <img class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="/api/video-thumbnail?file=${encodeURIComponent(file.name)}" alt="" onerror="this.src='https://via.placeholder.com/320x480/111/555?text=${encodeURIComponent(file.name)}'">
              
              <div class="card-quick-actions">
                <button class="card-action-btn btn-card-folder" title="Klasörde Göster">
                  <span class="material-symbols-outlined text-[16px]">folder_open</span>
                </button>
                <button class="card-action-btn btn-card-watch-toggle ${isWatched ? "text-emerald-400" : ""}" title="${isWatched ? "İzlenmedi Olarak İşaretle" : "İzlendi Olarak İşaretle"}">
                  <span class="material-symbols-outlined text-[16px]">${isWatched ? "check_circle" : "check"}</span>
                </button>
                <button class="card-action-btn btn-delete btn-card-delete" title="Filmi Diskten Sil">
                  <span class="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>

              <div class="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-sm">
                <span class="material-symbols-outlined text-[48px] text-primary-container drop-shadow-lg" style="font-variation-settings: 'FILL' 1;">play_circle</span>
              </div>
              ${progressPct > 0 ? `<div class="absolute bottom-0 left-0 h-1.5 bg-primary-container transition-all" style="width: ${progressPct}%"></div>` : ""}
            </div>
            <div class="flex flex-col px-1">
              <h3 class="font-bold text-sm text-on-surface truncate group-hover:text-primary-container transition-colors">${file.name}</h3>
              <div class="flex justify-between items-center mt-1">
                <span class="font-mono text-xs text-on-surface-variant/70">${formatBytes(file.size)}</span>
                <span class="font-mono text-[10px] text-on-surface-variant/70">Film</span>
              </div>
            </div>
          </div>
        `,
        createdAt: file.createdAt
      });
    }
  });

  if (gridItemsHtml.length === 0) {
    elLibraryGrid.innerHTML = `
      <div class="library-empty col-span-full text-center py-16 border border-dashed border-outline rounded-xl flex flex-col items-center justify-center gap-3">
        <span class="material-symbols-outlined text-4xl text-on-surface-variant/20">folder_open</span>
        <span class="font-mono text-xs text-on-surface-variant/50">indirilen film bulunamadı.</span>
      </div>
    `;
    if (elLibraryTotalCount) elLibraryTotalCount.textContent = "0";
    return;
  }

  elLibraryGrid.innerHTML = gridItemsHtml.map(item => item.html).join("");
  if (elLibraryTotalCount) elLibraryTotalCount.textContent = String(filtered.length);

  elLibraryGrid.querySelectorAll(".library-card").forEach(card => {
    const fileName = decodeURIComponent(card.dataset.file);
    const seriesKey = card.dataset.seriesKey;
    const isSeries = card.dataset.isSeries === "true";

    // 1. Bölümleri listele butonu (Dizi)
    const btnEpisodes = card.querySelector(".btn-show-episodes");
    if (btnEpisodes) {
      btnEpisodes.addEventListener("click", (e) => {
        e.stopPropagation();
        const episodes = librarySeriesIndex.get(seriesKey) || [];
        const seriesName = card.querySelector("h3").textContent;
        openEpisodePicker(seriesKey, seriesName, episodes, openVideoPlayer);
      });
    }

    // 2. Tüm diziyi sil butonu (Dizi)
    const btnDeleteSeries = card.querySelector(".btn-delete-series");
    if (btnDeleteSeries) {
      btnDeleteSeries.addEventListener("click", async (e) => {
        e.stopPropagation();
        const episodes = librarySeriesIndex.get(seriesKey) || [];
        const seriesName = card.querySelector("h3").textContent;
        const confirmed = await showConfirm(`"${seriesName}" dizisine ait ${episodes.length} bölümün tamamını diskten kalıcı olarak silmek istiyor musunuz?`);
        if (!confirmed) return;

        btnDeleteSeries.disabled = true;
        try {
          const res = await apiDeleteSeries(episodes.map(ep => ep.name));
          if (res.success) {
            fetchDownloadsList();
          } else {
            alert("Silme başarısız: " + (res.error || "Bilinmeyen hata"));
            btnDeleteSeries.disabled = false;
          }
        } catch (err) {
          alert("Hata oluştu: " + err.message);
          btnDeleteSeries.disabled = false;
        }
      });
    }

    // 3. Klasörde göster butonu (Film)
    const btnCardFolder = card.querySelector(".btn-card-folder");
    if (btnCardFolder) {
      btnCardFolder.addEventListener("click", async (e) => {
        e.stopPropagation();
        await apiOpenFolder(fileName);
      });
    }

    // 4. İzlendi / Sıfırla butonu (Film)
    const btnWatchToggle = card.querySelector(".btn-card-watch-toggle");
    if (btnWatchToggle) {
      btnWatchToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${fileName}`) || "100");
        const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${fileName}`) || "0");
        const isWatched = pos >= dur * 0.9 || (dur > 0 && dur - pos < 30);

        if (isWatched) {
          localStorage.setItem(`playback_pos_${fileName}`, "0");
        } else {
          localStorage.setItem(`playback_pos_${fileName}`, String(dur));
        }
        renderLibrary();
      });
    }

    // 5. Filmi sil butonu (Film)
    const btnCardDelete = card.querySelector(".btn-card-delete");
    if (btnCardDelete) {
      btnCardDelete.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirm(`"${fileName}" filmini diskten kalıcı olarak silmek istiyor musunuz?`);
        if (!confirmed) return;

        btnCardDelete.disabled = true;
        try {
          const res = await apiDeleteFile(fileName);
          if (res.success) {
            fetchDownloadsList();
          } else {
            alert("Silme başarısız: " + (res.error || "Bilinmeyen hata"));
            btnCardDelete.disabled = false;
          }
        } catch (err) {
          alert("Hata oluştu: " + err.message);
          btnCardDelete.disabled = false;
        }
      });
    }

    // 6. Kart tıklama (Oynat)
    card.addEventListener("click", () => {
      openVideoPlayer(fileName);
    });
  });
}

function isEpisodeNearlyFinished(current, total) {
  if (total <= 30) return false;
  return total - current < 30;
}

// App Initialization triggers
window.addEventListener("DOMContentLoaded", () => {
  // Global reference for settings change
  window.refreshLibraryList = fetchDownloadsList;

  // Initialize UI panels and controls
  initTabs(fetchDownloadsList);
  initDownloadManagerEvents();
  initSeriesModalEvents();
  setupVideoPlayerEvents();
  initSettings();

  // Bind download callbacks
  registerDownloadsCallback(fetchDownloadsList);
  registerProgressRefreshCallback(renderLibrary);
  registerPlayerCloseCallback(fetchDownloadsList);

  // Klasör Aç Butonu (Header)
  if (elBtnOpenDownloadsDir) {
    elBtnOpenDownloadsDir.addEventListener("click", async () => {
      await apiOpenFolder();
    });
  }

  // Initial downloads fetch
  fetchDownloadsList();
  
  // Mobile popover triggers
  const btnDmMobile = document.getElementById("btn-download-manager-mobile");
  const dmPanel = document.getElementById("download-manager-panel");
  if (btnDmMobile && dmPanel) {
    btnDmMobile.addEventListener("click", (e) => {
      e.stopPropagation();
      dmPanel.classList.toggle("hidden");
    });
  }
});
