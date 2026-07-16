import { escapeHtml } from "./downloadManager.js";

let pickerEl = null;

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
        <div class="absolute inset-0 bg-cover bg-center opacity-40 filter blur-xs" style="background-image: url('/api/video-thumbnail?file=${encodeURIComponent(episodes[0].name)}'); z-index: 1;"></div>
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
    const progressPct = dur > 0 ? (pos / dur) * 100 : 0;
    const isWatched = dur > 0 && (dur - pos < 30); // son 30 saniye ise izlenmiş say

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

    const playHandler = async () => {
      console.log("episodePicker: playHandler triggered for file:", fileName);
      console.log("episodePicker: onPlayEpisode type:", typeof onPlayEpisode);
      
      if (typeof onPlayEpisode !== "function") {
        alert("Hata: Oynatma fonksiyonu geçerli değil (onPlayEpisode is not a function).");
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
  });
}

export function closeEpisodePicker() {
  if (pickerEl) {
    pickerEl.remove();
    pickerEl = null;
  }
}
