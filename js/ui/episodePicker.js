import { escapeHtml } from "./downloadManager.js";
import { apiDeleteFile, apiOpenFolder } from "../services/api.js";

let pickerEl = null;

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

export function openEpisodePicker(seriesKey, seriesName, episodes, onPlayEpisode) {
  // Varsa eski modalı temizle
  closeEpisodePicker();

  const seasonsSet = new Set();
  episodes.forEach(e => seasonsSet.add(e.season));
  const seasons = Array.from(seasonsSet).sort((a, b) => a - b);
  const activeSeason = seasons[0];

  // Modal elementlerini oluştur
  pickerEl = document.createElement("div");
  pickerEl.className = "episode-picker-overlay";
  pickerEl.id = "episode-picker-modal";
  pickerEl.style.zIndex = "1900"; // Video oynatıcının (2100) ve confirm modalın (2000) altında, diğerlerinin üstünde

  pickerEl.innerHTML = `
    <div class="episode-picker-content">
      <!-- Netflix tarzı üst afiş/başlık -->
      <div class="episode-picker-banner">
        <div class="absolute inset-0 bg-cover bg-center opacity-40 filter blur-xs" style="background-image: url('/api/video-thumbnail?file=${encodeURIComponent(episodes[0] ? episodes[0].name : '')}'); z-index: 1;"></div>
        <div class="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/60 to-transparent" style="z-index: 1;"></div>
        <div class="episode-picker-banner-title" style="z-index: 2;">${escapeHtml(seriesName)}</div>
      </div>

      <!-- Modal Başlık ve Kapatma Butonu -->
      <div class="episode-picker-header flex justify-between items-center">
        <h3 class="font-mono text-xs text-primary-container">bölüm_secimi.</h3>
        <button class="episode-picker-close">kapat.</button>
      </div>

      <!-- Sezon Sekmeleri -->
      <div class="season-tabs-container">
        ${seasons.map(s => `
          <button class="season-tab ${s === activeSeason ? "active" : ""}" data-season="${s}">Sezon ${s}</button>
        `).join("")}
      </div>

      <!-- Bölüm Listesi Gövdesi -->
      <div class="episode-picker-body custom-scrollbar">
        <!-- Dinamik doldurulacak -->
      </div>
    </div>
  `;

  document.body.appendChild(pickerEl);

  // Kapatma eylemleri
  const closeBtn = pickerEl.querySelector(".episode-picker-close");
  closeBtn.addEventListener("click", closeEpisodePicker);
  pickerEl.addEventListener("click", (e) => {
    if (e.target === pickerEl) {
      closeEpisodePicker();
    }
  });

  // Sezon sekmeleri geçişleri
  const tabs = pickerEl.querySelectorAll(".season-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const seasonNum = parseInt(tab.dataset.season, 10);
      renderEpisodesForSeason(seriesKey, seasonNum, episodes, onPlayEpisode);
    });
  });

  // İlk sezon bölümlerini listele
  renderEpisodesForSeason(seriesKey, activeSeason, episodes, onPlayEpisode);
}

function renderEpisodesForSeason(seriesKey, seasonNum, episodes, onPlayEpisode) {
  if (!pickerEl) return;
  const body = pickerEl.querySelector(".episode-picker-body");
  if (!body) return;

  const filtered = episodes
    .filter(e => e.season === seasonNum)
    .sort((a, b) => a.episode - b.episode);

  body.innerHTML = filtered.map(ep => {
    const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${ep.name}`) || "0");
    const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${ep.name}`) || "0");
    
    // İzlenme yüzdesi
    const isWatched = dur > 0 && (dur - pos < 30 || pos >= dur * 0.9);

    return `
      <div class="episode-list-row ${isWatched ? "watched" : ""}" data-file="${encodeURIComponent(ep.name)}">
        <div class="episode-row-left">
          <div class="episode-row-num font-mono">Bölüm ${ep.episode}</div>
          <div class="episode-row-info">
            <div class="episode-row-title truncate" title="${escapeHtml(ep.title)}">${escapeHtml(ep.title || `${ep.season}. Sezon ${ep.episode}. Bölüm`)}</div>
            <div class="episode-row-meta font-mono">${ep.sizeStr}</div>
          </div>
        </div>
        <div class="episode-row-actions">
          <button class="btn-episode-action btn-ep-folder" title="Klasörde Göster">
            <span class="material-symbols-outlined text-[15px]">folder_open</span>
          </button>
          <button class="btn-episode-action btn-ep-toggle-watch ${isWatched ? "watched-active" : ""}" title="${isWatched ? "İzlenmedi Olarak İşaretle" : "İzlendi Olarak İşaretle"}">
            <span class="material-symbols-outlined text-[15px]">${isWatched ? "check_circle" : "check"}</span>
          </button>
          <button class="btn-episode-action btn-ep-delete" title="Bölümü Diskten Sil">
            <span class="material-symbols-outlined text-[15px]">delete</span>
          </button>
          <button class="btn-episode-play" title="Bölümü Oynat">
            <span class="material-symbols-outlined text-[18px]" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
          </button>
        </div>
      </div>
    `;
  }).join("");

  body.querySelectorAll(".episode-list-row").forEach(row => {
    const fileName = decodeURIComponent(row.dataset.file);
    const playBtn = row.querySelector(".btn-episode-play");
    const folderBtn = row.querySelector(".btn-ep-folder");
    const toggleWatchBtn = row.querySelector(".btn-ep-toggle-watch");
    const deleteBtn = row.querySelector(".btn-ep-delete");

    const playHandler = async () => {
      if (typeof onPlayEpisode !== "function") {
        alert("Hata: Oynatma fonksiyonu geçerli değil.");
        return;
      }
      try {
        closeEpisodePicker();
        await onPlayEpisode(fileName);
      } catch (err) {
        console.error("episodePicker: Error during onPlayEpisode call:", err);
        alert("Bölüm oynatılamadı: " + err.message);
      }
    };

    row.addEventListener("click", (e) => {
      if (!e.target.closest("button")) {
        playHandler();
      }
    });

    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playHandler();
      });
    }

    if (folderBtn) {
      folderBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await apiOpenFolder(fileName);
      });
    }

    if (toggleWatchBtn) {
      toggleWatchBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dur = Number.parseFloat(localStorage.getItem(`playback_dur_${fileName}`) || "100");
        const pos = Number.parseFloat(localStorage.getItem(`playback_pos_${fileName}`) || "0");
        const currentlyWatched = dur > 0 && (dur - pos < 30 || pos >= dur * 0.9);

        if (currentlyWatched) {
          // Sıfırla
          localStorage.setItem(`playback_pos_${fileName}`, "0");
          row.classList.remove("watched");
          toggleWatchBtn.classList.remove("watched-active");
          toggleWatchBtn.querySelector("span").textContent = "check";
          toggleWatchBtn.title = "İzlendi Olarak İşaretle";
        } else {
          // İzlendi yap
          localStorage.setItem(`playback_pos_${fileName}`, String(dur));
          row.classList.add("watched");
          toggleWatchBtn.classList.add("watched-active");
          toggleWatchBtn.querySelector("span").textContent = "check_circle";
          toggleWatchBtn.title = "İzlenmedi Olarak İşaretle";
        }

        if (typeof window.refreshLibraryList === "function") {
          window.refreshLibraryList();
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirm(`"${fileName}" dosyasını kalıcı olarak silmek istediğinize emin misiniz?`);
        if (!confirmed) return;

        deleteBtn.disabled = true;
        try {
          const res = await apiDeleteFile(fileName);
          if (res.success) {
            // episodes dizisinden çıkar
            const idx = episodes.findIndex(ep => ep.name === fileName);
            if (idx !== -1) episodes.splice(idx, 1);
            
            // Eğer dizide bölüm kalmadıysa modalı kapat
            if (episodes.length === 0) {
              closeEpisodePicker();
            } else {
              renderEpisodesForSeason(seriesKey, seasonNum, episodes, onPlayEpisode);
            }

            if (typeof window.refreshLibraryList === "function") {
              window.refreshLibraryList();
            }
          } else {
            alert("Silme başarısız: " + (res.error || "Bilinmeyen hata"));
            deleteBtn.disabled = false;
          }
        } catch (err) {
          alert("Hata oluştu: " + err.message);
          deleteBtn.disabled = false;
        }
      });
    }
  });
}

export function closeEpisodePicker() {
  if (pickerEl) {
    pickerEl.remove();
    pickerEl = null;
  }
}
