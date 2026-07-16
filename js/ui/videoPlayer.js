import { apiGetVideoSubtitles, apiPrepareVideo, apiLogToServer, apiGetSettings } from "../services/api.js";

// DOM Elements inside module (fetched lazily)
let elMainVideo, elVideoPlayerModal, elVideoPlayerTitle, elVideoControlsOverlay,
    elVideoGiantIndicator, elVideoTimelineFill, elVideoTimelineHandle, elVideoTimelineBg,
    elVideoCurrentTime, elVideoDuration, elBtnVideoPlay, elBtnVideoRewind, elBtnVideoForward,
    elBtnVideoNextEp, elBtnVideoMute, elVideoVolumeSlider, elVideoSubtitleSelect,
    elBtnCloseVideo, elBtnVideoPip,
    elBtnVideoFullscreen, elVideoEpisodesPanel, elVideoEpisodesList, elVideoEpisodesSeasonSelect,
    elVideoEpisodesSeasonContainer, elBtnVideoEpisodes, elBtnCloseEpisodesPanel,
    elBtnVideoSeasonPicker, elVideoSeasonDisplayValue, elVideoSeasonDropdownList,
    elVideoSpeedSelect, elVideoTimelineWrapper,
    elBtnVideoNextEpCountdownPlay, elNextEpisodeCountdown, elNextEpCountdownTitle,
    elNextEpCountdownTime, 
    elSubtitleSettingsPanel, elBtnCloseSubSettings,
    elSubSliderSize, elSubSliderY, elSubSizeVal, elSubYVal, elSubColorOptions, elSubBgOptions,
    // Yeni ayar menüsü elemanları
    elBtnVideoSettings, elVideoSettingsMenu, elSettingsMainPanel, elSettingsSpeedPanel,
    elSettingsSubtitlePanel, elBtnSubmenuSpeed, elBtnSubmenuSubtitle, elMenuSpeedVal,
    elMenuSubtitleVal, elBtnSpeedBack, elBtnSubtitleBack, elSettingsSpeedOptions,
    elSettingsSubtitleOptions, elBtnSubmenuSubtitleSettings;

// Module states
let pendingSeekPosition = null;
let controlsTimeout = null;
let activeDropdown = null; // 'speed', 'subtitle', 'season' or null
let nextEpisodeCountdownTimer = null;
let librarySeriesIndex = new Map(); // seriesKey -> [episodes]
let libraryFiles = []; // Array of downloaded files
let seriesProgressIndex = new Map(); // seriesKey -> { season, episode, position, duration, fileName }
let playerCloseCallback = null;

function getElements() {
  elMainVideo = document.getElementById("main-video-element");
  elVideoPlayerModal = document.getElementById("video-player-modal");
  elVideoPlayerTitle = document.getElementById("video-player-title");
  elVideoControlsOverlay = document.getElementById("video-controls-overlay");
  elVideoGiantIndicator = document.getElementById("video-giant-indicator");
  elVideoTimelineFill = document.getElementById("video-timeline-fill");
  elVideoTimelineHandle = document.getElementById("video-timeline-handle");
  elVideoTimelineBg = document.getElementById("video-timeline-bg");
  elVideoCurrentTime = document.getElementById("video-current-time");
  elVideoDuration = document.getElementById("video-duration");
  elBtnVideoPlay = document.getElementById("btn-video-play");
  elBtnVideoRewind = document.getElementById("btn-video-rewind");
  elBtnVideoForward = document.getElementById("btn-video-forward");
  elBtnVideoNextEp = document.getElementById("btn-video-next-ep");
  elBtnVideoMute = document.getElementById("btn-video-mute");
  elVideoVolumeSlider = document.getElementById("video-volume-slider");
  elVideoSubtitleSelect = document.getElementById("video-subtitle-select");
  elBtnCloseVideo = document.getElementById("btn-close-video");
  elBtnVideoPip = document.getElementById("btn-video-pip");
  elBtnVideoFullscreen = document.getElementById("btn-video-fullscreen");
  elVideoEpisodesPanel = document.getElementById("video-episodes-panel");
  elVideoEpisodesList = document.getElementById("video-episodes-list");
  elVideoEpisodesSeasonSelect = document.getElementById("video-episodes-season-select");
  elVideoEpisodesSeasonContainer = document.getElementById("video-episodes-season-container");
  elBtnVideoEpisodes = document.getElementById("btn-video-episodes");
  elBtnCloseEpisodesPanel = document.getElementById("btn-close-episodes-panel");
  elBtnVideoSeasonPicker = document.getElementById("btn-video-season-picker");
  elVideoSeasonDisplayValue = document.getElementById("video-season-display-value");
  elVideoSeasonDropdownList = document.getElementById("video-season-dropdown-list");
  elVideoSpeedSelect = document.getElementById("video-speed-select");
  elVideoTimelineWrapper = document.getElementById("video-timeline-wrapper");
  elBtnVideoNextEpCountdownPlay = document.getElementById("btn-next-ep-countdown-play");
  elNextEpisodeCountdown = document.getElementById("next-episode-countdown");
  elNextEpCountdownTitle = document.getElementById("next-ep-countdown-title");
  elNextEpCountdownTime = document.getElementById("next-ep-countdown-time");
  elSubtitleSettingsPanel = document.getElementById("subtitle-settings-panel");
  elBtnCloseSubSettings = document.getElementById("btn-close-sub-settings");
  elSubSliderSize = document.getElementById("sub-slider-size");
  elSubSliderY = document.getElementById("sub-slider-y");
  elSubSizeVal = document.getElementById("sub-size-val");
  elSubYVal = document.getElementById("sub-y-val");
  elSubColorOptions = document.getElementById("sub-color-options");
  elSubBgOptions = document.getElementById("sub-bg-options");

  // Yeni ayar menüsü elemanları
  elBtnVideoSettings = document.getElementById("btn-video-settings");
  elVideoSettingsMenu = document.getElementById("video-settings-menu");
  elSettingsMainPanel = document.getElementById("settings-main-panel");
  elSettingsSpeedPanel = document.getElementById("settings-speed-panel");
  elSettingsSubtitlePanel = document.getElementById("settings-subtitle-panel");
  elBtnSubmenuSpeed = document.getElementById("btn-submenu-speed");
  elBtnSubmenuSubtitle = document.getElementById("btn-submenu-subtitle");
  elMenuSpeedVal = document.getElementById("menu-speed-val");
  elMenuSubtitleVal = document.getElementById("menu-subtitle-val");
  elBtnSpeedBack = document.getElementById("btn-speed-back");
  elBtnSubtitleBack = document.getElementById("btn-subtitle-back");
  elSettingsSpeedOptions = document.getElementById("settings-speed-options");
  elSettingsSubtitleOptions = document.getElementById("settings-subtitle-options");
  elBtnSubmenuSubtitleSettings = document.getElementById("btn-submenu-subtitle-settings");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

// Progress positions helper (local storage wrapper)
export function getPlaybackPositionForFile(fileName) {
  try {
    const data = localStorage.getItem(`playback_pos_${fileName}`);
    return data ? Number.parseFloat(data) : 0;
  } catch (_) {
    return 0;
  }
}

export function setPlaybackPositionForFile(fileName, position, duration = 0) {
  try {
    localStorage.setItem(`playback_pos_${fileName}`, String(position));
    if (duration > 0) {
      localStorage.setItem(`playback_dur_${fileName}`, String(duration));
    }
  } catch (_) {}
}

export function getSeriesProgress(seriesKey) {
  try {
    const data = localStorage.getItem(`series_prog_${seriesKey}`);
    return data ? JSON.parse(data) : null;
  } catch (_) {
    return null;
  }
}

export function setSeriesProgress(seriesKey, season, episode, data = {}) {
  try {
    const val = { season, episode, ...data };
    localStorage.setItem(`series_prog_${seriesKey}`, JSON.stringify(val));
    seriesProgressIndex.set(seriesKey, val);
  } catch (_) {}
}

export function parseSeriesMetaClient(fileName) {
  const match = fileName.match(/(.+?)[._\s-]S(\d+)E(\d+)(?:[._\s-]|$)/i);
  if (match) {
    return {
      key: match[1].toLowerCase().replace(/[^a-z0-9]/g, "_"),
      season: parseInt(match[2], 10),
      episode: parseInt(match[3], 10)
    };
  }
  return null;
}

function isEpisodeNearlyFinished(current, total) {
  if (total <= 30) return false;
  return total - current < 30; // Son 30 saniye kaldıysa bitmiş sayılır
}

function resetVideoSubtitleSelect(placeholderText = "kapalı") {
  if (!elVideoSubtitleSelect) return;
  elVideoSubtitleSelect.innerHTML = `<option value="off">${placeholderText}</option>`;
  elVideoSubtitleSelect.disabled = true;
  elVideoSubtitleSelect.value = "off";

  const elSettingsSubtitleOptions = document.getElementById("settings-subtitle-options");
  const elMenuSubtitleVal = document.getElementById("menu-subtitle-val");

  if (elSettingsSubtitleOptions) {
    elSettingsSubtitleOptions.innerHTML = `<button class="px-4 py-2 text-left text-xs hover:bg-white/5 hover:text-primary-container transition-colors active text-primary-container" data-value="off">${placeholderText}</button>`;
  }
  if (elMenuSubtitleVal) {
    elMenuSubtitleVal.textContent = placeholderText;
  }
}

function clearVideoSubtitleTracks() {
  if (!elMainVideo) return;
  const tracks = elMainVideo.querySelectorAll("track");
  tracks.forEach(track => track.remove());
}

function applySelectedSubtitleTrack(val) {
  if (!elMainVideo) return;
  const tracks = elMainVideo.querySelectorAll("track");
  tracks.forEach((track, index) => {
    if (val === "off") {
      track.track.mode = "disabled";
    } else {
      track.track.mode = parseInt(val, 10) === index ? "showing" : "disabled";
    }
  });
}

async function loadVideoSubtitles(fileName) {
  resetVideoSubtitleSelect("aranıyor...");
  clearVideoSubtitleTracks();

  try {
    const data = await apiGetVideoSubtitles(fileName);
    const elSettingsSubtitleOptions = document.getElementById("settings-subtitle-options");
    const elMenuSubtitleVal = document.getElementById("menu-subtitle-val");

    if (!data.success || !Array.isArray(data.subtitles) || data.subtitles.length === 0) {
      resetVideoSubtitleSelect("yok");
      return;
    }

    elVideoSubtitleSelect.innerHTML = `<option value="off">kapali</option>`;
    data.subtitles.forEach((sub, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = sub.label || sub.lang || `sub${index + 1}`;
      elVideoSubtitleSelect.appendChild(option);

      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.label || sub.lang;
      track.srclang = sub.lang;
      track.src = sub.src;
      elMainVideo.appendChild(track);
    });

    if (elSettingsSubtitleOptions) {
      let subHtml = `<button class="px-4 py-2 text-left text-xs hover:bg-white/5 hover:text-primary-container transition-colors active text-primary-container" data-value="off">Kapalı</button>`;
      data.subtitles.forEach((sub, index) => {
        const text = sub.label || sub.lang || `Altyazı ${index + 1}`;
        subHtml += `<button class="px-4 py-2 text-left text-xs hover:bg-white/5 hover:text-primary-container transition-colors" data-value="${index}">${escapeHtml(text)}</button>`;
      });
      elSettingsSubtitleOptions.innerHTML = subHtml;

      elSettingsSubtitleOptions.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = btn.dataset.value;
          
          elSettingsSubtitleOptions.querySelectorAll("button").forEach(b => {
            b.classList.remove("active", "text-primary-container");
          });
          btn.classList.add("active", "text-primary-container");
          
          if (elVideoSubtitleSelect) {
            elVideoSubtitleSelect.value = val;
            elVideoSubtitleSelect.dispatchEvent(new Event("change"));
          }
          
          if (elMenuSubtitleVal) elMenuSubtitleVal.textContent = btn.textContent;
          closeSettingsSubmenus();
        });
      });
    }

    elVideoSubtitleSelect.disabled = false;
    elVideoSubtitleSelect.value = "off";
    if (elMenuSubtitleVal) elMenuSubtitleVal.textContent = "kapalı";
    applySelectedSubtitleTrack("off");
  } catch (err) {
    console.error("Altyazı listesi yüklenemedi:", err);
    resetVideoSubtitleSelect("yüklenemedi");
  }
}

export async function openVideoPlayer(fileName, options = {}) {
  getElements();
  if (!fileName) return;
  const shouldResume = options.resume !== false;

  applySavedSubtitleSettings();

  let defaultSpeed = 1;
  try {
    const settingsData = await apiGetSettings();
    if (settingsData.success && settingsData.settings) {
      defaultSpeed = parseFloat(settingsData.settings.defaultPlaybackSpeed) || 1;
    }
  } catch (_) {}

  if (elVideoSpeedSelect) elVideoSpeedSelect.value = String(defaultSpeed);
  if (elMainVideo) elMainVideo.playbackRate = defaultSpeed;

  const elMenuSpeedVal = document.getElementById("menu-speed-val");
  if (elMenuSpeedVal) {
    elMenuSpeedVal.textContent = defaultSpeed === 1 ? "1x" : `${defaultSpeed}x`;
  }

  closeEpisodesPanel();
  hideNextEpisodeCountdown();

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
    updateNextEpisodeButtonState(fileName);
    if (elBtnVideoEpisodes) elBtnVideoEpisodes.classList.remove("hidden");
    setupEpisodesPanel(meta.key, fileName);
  } else {
    if (elBtnVideoNextEp) elBtnVideoNextEp.classList.add("hidden");
    if (elBtnVideoEpisodes) elBtnVideoEpisodes.classList.add("hidden");
  }

  pendingSeekPosition = null;
  if (shouldResume) {
    const savedPos = getPlaybackPositionForFile(fileName);
    if (savedPos > 5) {
      pendingSeekPosition = savedPos;
    }
  }

  if (elVideoPlayerTitle) elVideoPlayerTitle.textContent = fileName;
  if (elMainVideo) {
    elMainVideo.pause();
    elMainVideo.removeAttribute("src");
    elMainVideo.load();
    const resolvedSrc = await resolvePlayableVideoSrc(fileName);
    elMainVideo.src = resolvedSrc;
    elMainVideo.load();
  }
  if (elVideoPlayerModal) elVideoPlayerModal.classList.remove("hidden");
  loadVideoSubtitles(fileName);

  if (elVideoTimelineFill) elVideoTimelineFill.style.width = "0%";
  if (elVideoTimelineHandle) elVideoTimelineHandle.style.left = "0%";
  if (elVideoCurrentTime) elVideoCurrentTime.textContent = "00:00:00";
  if (elVideoDuration) elVideoDuration.textContent = "00:00:00";
  if (elVideoControlsOverlay) elVideoControlsOverlay.classList.add("visible");

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

export function closeVideoPlayer() {
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

  if (playerCloseCallback) {
    try { playerCloseCallback(); } catch (_) {}
  }
}

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

function seekVideoByClientX(clientX) {
  if (!elMainVideo || !elVideoTimelineBg || !Number.isFinite(elMainVideo.duration) || elMainVideo.duration <= 0) return;
  const rect = elVideoTimelineBg.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  elMainVideo.currentTime = ratio * elMainVideo.duration;
}

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

function toggleEpisodesPanel() {
  if (!elVideoEpisodesPanel) return;
  const isOpen = elVideoEpisodesPanel.classList.contains("translate-x-0");
  if (isOpen) {
    closeEpisodesPanel();
  } else {
    elVideoEpisodesPanel.classList.remove("translate-x-full");
    elVideoEpisodesPanel.classList.add("translate-x-0");
    showControls();
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

  if (elVideoEpisodesSeasonSelect && elVideoEpisodesSeasonContainer) {
    if (seasons.length > 1) {
      elVideoEpisodesSeasonContainer.classList.remove("hidden");
      elVideoEpisodesSeasonSelect.innerHTML = seasons.map(s => `<option value="${s}">Sezon ${s}</option>`).join("");
      
      const activeSeason = prog ? prog.season : seasons[0];
      elVideoEpisodesSeasonSelect.value = String(activeSeason);
      if (elVideoSeasonDisplayValue) elVideoSeasonDisplayValue.textContent = `Sezon ${activeSeason}`;

      if (elVideoSeasonDropdownList) {
        elVideoSeasonDropdownList.innerHTML = seasons.map(s => 
          `<button class="${s === activeSeason ? "active" : ""}" data-value="${s}">Sezon ${s}</button>`
        ).join("");

        elVideoSeasonDropdownList.querySelectorAll("button").forEach(btn => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = btn.dataset.value;
            elVideoSeasonDropdownList.querySelectorAll("button").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            elVideoEpisodesSeasonSelect.value = val;
            if (elVideoSeasonDisplayValue) elVideoSeasonDisplayValue.textContent = `Sezon ${val}`;
            closeAllDropdowns();
            renderEpisodesListInPanel(seriesKey, parseInt(val, 10), currentFileName);
          });
        });
      }
      renderEpisodesListInPanel(seriesKey, activeSeason, currentFileName);
    } else {
      elVideoEpisodesSeasonContainer.classList.add("hidden");
      renderEpisodesListInPanel(seriesKey, seasons[0], currentFileName);
    }
  }
}

function renderEpisodesListInPanel(seriesKey, seasonNum, currentFileName) {
  const episodes = librarySeriesIndex.get(seriesKey);
  if (!episodes || !elVideoEpisodesList) return;

  const filtered = episodes.filter(e => e.season === seasonNum).sort((a, b) => a.episode - b.episode);
  elVideoEpisodesList.innerHTML = filtered.map(ep => {
    const isCurrent = ep.name === currentFileName;
    const pos = getPlaybackPositionForFile(ep.name);
    const dur = localStorage.getItem(`playback_dur_${ep.name}`) ? Number.parseFloat(localStorage.getItem(`playback_dur_${ep.name}`)) : 0;
    const progressPct = dur > 0 ? (pos / dur) * 100 : 0;

    return `
      <div class="video-ep-row flex gap-3 p-2.5 rounded-lg cursor-pointer transition-colors relative overflow-hidden ${
        isCurrent ? "bg-primary-container/10 border border-primary-container/30" : "hover:bg-white/5"
      }" data-file="${encodeURIComponent(ep.name)}">
        <!-- Thumbnail Cache ya da CSS placeholder -->
        <div class="relative w-24 aspect-[16/10] bg-surface-container rounded overflow-hidden flex-shrink-0 border border-outline/20">
          <img class="w-full h-full object-cover" src="/api/video-thumbnail?file=${encodeURIComponent(ep.name)}" alt="" onerror="this.style.display='none';">
          <div class="absolute inset-0 flex items-center justify-center bg-black/40 ${isCurrent ? "opacity-100" : "opacity-0 hover:opacity-100"} transition-opacity">
            <span class="material-symbols-outlined text-[20px] text-white">${isCurrent ? "play_circle" : "play_arrow"}</span>
          </div>
          ${progressPct > 0 ? `<div class="absolute bottom-0 left-0 h-1 bg-primary-container" style="width: ${progressPct}%"></div>` : ""}
        </div>
        <div class="flex-grow flex flex-col justify-center min-w-0">
          <div class="font-mono text-[10px] text-primary-container font-semibold">BÖLÜM ${ep.episode}</div>
          <div class="text-[11px] font-bold text-on-surface truncate mt-0.5">${ep.title}</div>
          <div class="text-[9px] text-on-surface-variant font-mono mt-0.5">${ep.sizeStr}</div>
        </div>
      </div>
    `;
  }).join("");

  elVideoEpisodesList.querySelectorAll(".video-ep-row").forEach(row => {
    row.addEventListener("click", () => {
      const file = decodeURIComponent(row.dataset.file);
      openVideoPlayer(file);
    });
  });
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
      const nextEp = sorted[currentIndex + 1];
      elBtnVideoNextEp.classList.remove("hidden");
      elBtnVideoNextEp.dataset.nextFile = encodeURIComponent(nextEp.name);
      return;
    }
  }
  elBtnVideoNextEp.classList.add("hidden");
}

function showNextEpisodeCountdown(nextEp, seconds) {
  if (!elNextEpisodeCountdown || !elNextEpCountdownTitle || !elNextEpCountdownTime || !elBtnVideoNextEpCountdownPlay) return;

  elNextEpCountdownTitle.textContent = `${nextEp.season}. Sezon ${nextEp.episode}. Bölüm`;
  elNextEpCountdownTime.textContent = `${seconds} saniye içinde...`;
  elBtnVideoNextEpCountdownPlay.dataset.nextFile = encodeURIComponent(nextEp.name);

  elNextEpisodeCountdown.classList.remove("pointer-events-none", "translate-y-10", "opacity-0");
  elNextEpisodeCountdown.classList.add("translate-y-0", "opacity-100");
}

function hideNextEpisodeCountdown() {
  if (!elNextEpisodeCountdown) return;
  elNextEpisodeCountdown.classList.remove("translate-y-0", "opacity-100");
  elNextEpisodeCountdown.classList.add("pointer-events-none", "translate-y-10", "opacity-0");
}

function playSeriesNextEpisode(currentFile) {
  const meta = parseSeriesMetaClient(currentFile);
  if (!meta) return;
  const episodes = librarySeriesIndex.get(meta.key);
  if (episodes && episodes.length > 0) {
    const sorted = episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode);
    const currentIndex = sorted.findIndex(e => e.name === currentFile);
    if (currentIndex !== -1 && currentIndex < sorted.length - 1) {
      openVideoPlayer(sorted[currentIndex + 1].name);
    }
  }
}

async function resolvePlayableVideoSrc(fileName) {
  const ext = fileName.split(".").pop().toLowerCase();
  if (ext === "mp4") {
    return `/downloads/${encodeURIComponent(fileName)}`;
  }
  
  try {
    const data = await apiPrepareVideo(fileName);
    if (data.success) {
      return data.url;
    }
    return `/downloads/${encodeURIComponent(fileName)}`;
  } catch (err) {
    console.error("Video oynatılabilirlik hazırlığı hatası:", err);
    return `/downloads/${encodeURIComponent(fileName)}`;
  }
}

function saveCurrentPlaybackProgress(isClose = false) {
  if (!elMainVideo || !elVideoPlayerTitle || elVideoPlayerModal.classList.contains("hidden")) return;
  const fileName = elVideoPlayerTitle.textContent;
  const current = elMainVideo.currentTime;
  const duration = elMainVideo.duration;

  if (Number.isFinite(current) && current > 2 && Number.isFinite(duration)) {
    setPlaybackPositionForFile(fileName, current, duration);

    const meta = parseSeriesMetaClient(fileName);
    if (meta) {
      setSeriesProgress(meta.key, meta.season, meta.episode, {
        position: current,
        duration: duration,
        fileName,
      });
    }
  }
}

// Custom dropdowns management
function closeSettingsSubmenus() {
  const elMainPanel = document.getElementById("settings-main-panel");
  const elSpeedPanel = document.getElementById("settings-speed-panel");
  const elSubtitlePanel = document.getElementById("settings-subtitle-panel");

  if (elMainPanel) elMainPanel.classList.remove("hidden");
  if (elSpeedPanel) elSpeedPanel.classList.add("hidden");
  if (elSubtitlePanel) elSubtitlePanel.classList.add("hidden");
}

function toggleSettingsDropdown() {
  if (!elVideoSettingsMenu) return;
  
  if (activeDropdown === "settings") {
    closeAllDropdowns();
  } else {
    closeAllDropdowns();
    elVideoSettingsMenu.classList.remove("opacity-0", "pointer-events-none", "translate-y-2");
    elVideoSettingsMenu.classList.add("opacity-100", "translate-y-0");
    activeDropdown = "settings";
  }
}

function toggleSeasonDropdown() {
  if (!elVideoSeasonDropdownList) return;
  if (activeDropdown === "season") {
    closeAllDropdowns();
  } else {
    closeAllDropdowns();
    elVideoSeasonDropdownList.classList.remove("opacity-0", "pointer-events-none", "-translate-y-2");
    elVideoSeasonDropdownList.classList.add("opacity-100", "translate-y-0");
    if (elBtnVideoSeasonPicker) {
      elBtnVideoSeasonPicker.querySelector(".select-arrow-icon").classList.add("rotate-180");
    }
    activeDropdown = "season";
  }
}

export function closeAllDropdowns() {
  if (elVideoSettingsMenu) {
    elVideoSettingsMenu.classList.remove("opacity-100", "translate-y-0");
    elVideoSettingsMenu.classList.add("opacity-0", "pointer-events-none", "translate-y-2");
  }
  closeSettingsSubmenus();

  if (elVideoSeasonDropdownList) {
    elVideoSeasonDropdownList.classList.remove("opacity-100", "translate-y-0");
    elVideoSeasonDropdownList.classList.add("opacity-0", "pointer-events-none", "-translate-y-2");
  }
  if (elSubtitleSettingsPanel) {
    elSubtitleSettingsPanel.classList.add("hidden");
  }

  document.querySelectorAll(".select-arrow-icon").forEach(icon => {
    icon.classList.remove("rotate-180");
  });

  activeDropdown = null;
}

// Initial setup triggers
export function registerPlayerCloseCallback(callback) {
  playerCloseCallback = callback;
}

export function registerLibraryData(files, seriesIndex) {
  libraryFiles = files;
  librarySeriesIndex = seriesIndex;
}

export function setupVideoPlayerEvents() {
  getElements();
  
  if (elBtnCloseVideo) elBtnCloseVideo.addEventListener("click", closeVideoPlayer);
  if (elBtnVideoPlay) elBtnVideoPlay.addEventListener("click", togglePlay);
  
  if (elMainVideo) {
    elMainVideo.addEventListener("click", togglePlay);
    elMainVideo.addEventListener("play", updatePlayPauseIcon);
    elMainVideo.addEventListener("pause", updatePlayPauseIcon);
    
    elMainVideo.addEventListener("loadedmetadata", () => {
      if (elVideoDuration) elVideoDuration.textContent = formatTime(elMainVideo.duration);
    });

    elMainVideo.addEventListener("canplay", () => {
      if (
        pendingSeekPosition !== null &&
        Number.isFinite(elMainVideo.duration) &&
        elMainVideo.duration > 10
      ) {
        let seekTo = pendingSeekPosition;
        if (isEpisodeNearlyFinished(seekTo, elMainVideo.duration)) {
          seekTo = 0;
        } else {
          seekTo = Math.min(seekTo, Math.max(0, elMainVideo.duration - 3));
        }
        if (seekTo > 5) {
          try { elMainVideo.currentTime = seekTo; } catch (_) {}
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

        saveCurrentPlaybackProgress(false);

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
      if (elVideoPlayerTitle && Number.isFinite(elMainVideo.duration)) {
        setPlaybackPositionForFile(elVideoPlayerTitle.textContent, elMainVideo.duration, elMainVideo.duration);
        const meta = parseSeriesMetaClient(elVideoPlayerTitle.textContent);
        if (meta) {
          setSeriesProgress(meta.key, meta.season, meta.episode, {
            position: elMainVideo.duration,
            duration: elMainVideo.duration,
            fileName: elVideoPlayerTitle.textContent,
          });
        }
      }
      showControls();
      updatePlayPauseIcon();
    });

    elMainVideo.addEventListener("error", () => {
      const mediaError = elMainVideo.error;
      const details = {
        code: mediaError ? mediaError.code : "unknown",
        src: elMainVideo.currentSrc || elMainVideo.src || "",
        currentTime: elMainVideo.currentTime,
        duration: elMainVideo.duration,
      };
      apiLogToServer("VIDEO_ERROR", JSON.stringify(details));
      showControls();
    });

    const container = elMainVideo.parentElement;
    if (container) {
      container.addEventListener("mousemove", showControls);
      container.addEventListener("click", showControls);
    }
  }

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
      if (isTimelineScrubbing) seekVideoByClientX(e.clientX);
    });

    const stopScrub = (e) => {
      if (!isTimelineScrubbing) return;
      isTimelineScrubbing = false;
      if (e) seekVideoByClientX(e.clientX);
    };

    elVideoTimelineWrapper.addEventListener("pointerup", stopScrub);
    elVideoTimelineWrapper.addEventListener("pointercancel", stopScrub);
  }

  if (elBtnVideoPip && elMainVideo) {
    elBtnVideoPip.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (elMainVideo.readyState >= 1) {
          await elMainVideo.requestPictureInPicture();
        }
      } catch (err) { console.error(err); }
    });
  }

  if (elBtnVideoFullscreen) elBtnVideoFullscreen.addEventListener("click", toggleFullscreen);
  if (elMainVideo) elMainVideo.addEventListener("dblclick", toggleFullscreen);

  if (elVideoPlayerModal) {
    elVideoPlayerModal.addEventListener("click", (e) => {
      if (e.target === elVideoPlayerModal) closeVideoPlayer();
    });
  }

  if (elVideoSpeedSelect && elMainVideo) {
    elVideoSpeedSelect.addEventListener("change", (e) => {
      elMainVideo.playbackRate = Number.parseFloat(e.target.value);
    });
  }

  // Yeni Ayarlar Menüsü Olayları
  if (elBtnVideoSettings) {
    elBtnVideoSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSettingsDropdown();
    });
  }

  if (elVideoSettingsMenu) {
    elVideoSettingsMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (elBtnSubmenuSpeed) {
    elBtnSubmenuSpeed.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elSettingsMainPanel) elSettingsMainPanel.classList.add("hidden");
      if (elSettingsSpeedPanel) elSettingsSpeedPanel.classList.remove("hidden");
    });
  }

  if (elBtnSubmenuSubtitle) {
    elBtnSubmenuSubtitle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elSettingsMainPanel) elSettingsMainPanel.classList.add("hidden");
      if (elSettingsSubtitlePanel) elSettingsSubtitlePanel.classList.remove("hidden");
    });
  }

  if (elBtnSpeedBack) {
    elBtnSpeedBack.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elSettingsSpeedPanel) elSettingsSpeedPanel.classList.add("hidden");
      if (elSettingsMainPanel) elSettingsMainPanel.classList.remove("hidden");
    });
  }

  if (elBtnSubtitleBack) {
    elBtnSubtitleBack.addEventListener("click", (e) => {
      e.stopPropagation();
      if (elSettingsSubtitlePanel) elSettingsSubtitlePanel.classList.add("hidden");
      if (elSettingsMainPanel) elSettingsMainPanel.classList.remove("hidden");
    });
  }

  if (elSettingsSpeedOptions) {
    elSettingsSpeedOptions.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = btn.dataset.value;
        elSettingsSpeedOptions.querySelectorAll("button").forEach(b => {
          b.classList.remove("active", "text-primary-container");
        });
        btn.classList.add("active", "text-primary-container");

        if (elVideoSpeedSelect) {
          elVideoSpeedSelect.value = val;
          elVideoSpeedSelect.dispatchEvent(new Event("change"));
        }
        if (elMenuSpeedVal) {
          elMenuSpeedVal.textContent = val === "1" ? "1x" : `${val}x`;
        }
        closeAllDropdowns();
      });
    });
  }

  if (elBtnSubmenuSubtitleSettings) {
    elBtnSubmenuSubtitleSettings.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = elSubtitleSettingsPanel.classList.contains("hidden");
      closeAllDropdowns();
      closeEpisodesPanel();
      if (isHidden) {
        elSubtitleSettingsPanel.classList.remove("hidden");
      } else {
        elSubtitleSettingsPanel.classList.add("hidden");
      }
    });
  }

  if (elBtnVideoEpisodes) {
    elBtnVideoEpisodes.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleEpisodesPanel();
    });
  }

  if (elBtnCloseEpisodesPanel) {
    elBtnCloseEpisodesPanel.addEventListener("click", () => closeEpisodesPanel());
  }

  if (elBtnVideoNextEp) {
    elBtnVideoNextEp.addEventListener("click", () => {
      const nextFile = decodeURIComponent(elBtnVideoNextEp.dataset.nextFile);
      if (nextFile) openVideoPlayer(nextFile);
    });
  }

  if (elBtnVideoNextEpCountdownPlay) {
    elBtnVideoNextEpCountdownPlay.addEventListener("click", () => {
      const nextFile = decodeURIComponent(elBtnVideoNextEpCountdownPlay.dataset.nextFile);
      if (nextFile) openVideoPlayer(nextFile);
    });
  }

  if (elBtnVideoSeasonPicker) {
    elBtnVideoSeasonPicker.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSeasonDropdown();
    });
  }

  document.addEventListener("click", () => {
    closeAllDropdowns();
  });

  if (elBtnCloseSubSettings) {
    elBtnCloseSubSettings.addEventListener("click", () => {
      if (elSubtitleSettingsPanel) elSubtitleSettingsPanel.classList.add("hidden");
    });
  }

  if (elSubtitleSettingsPanel) {
    elSubtitleSettingsPanel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  if (elSubSliderSize) {
    elSubSliderSize.addEventListener("input", (e) => {
      const val = e.target.value;
      if (elSubSizeVal) elSubSizeVal.textContent = `${val}%`;
      if (elMainVideo) elMainVideo.style.setProperty("--sub-size", `${val}%`);
      localStorage.setItem("sub_size", val);
    });
  }

  if (elSubSliderY) {
    elSubSliderY.addEventListener("input", (e) => {
      const val = e.target.value;
      if (elSubYVal) elSubYVal.textContent = `${val}px`;
      if (elMainVideo) elMainVideo.style.setProperty("--sub-y-offset", `${val}px`);
      localStorage.setItem("sub_y_offset", val);
    });
  }

  if (elSubColorOptions) {
    elSubColorOptions.querySelectorAll(".sub-option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        elSubColorOptions.querySelectorAll(".sub-option-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const color = btn.dataset.color;
        if (elMainVideo) elMainVideo.style.setProperty("--sub-color", color);
        localStorage.setItem("sub_color", color);
      });
    });
  }

  if (elSubBgOptions) {
    elSubBgOptions.querySelectorAll(".sub-option-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        elSubBgOptions.querySelectorAll(".sub-option-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const bg = btn.dataset.bg;
        if (elMainVideo) elMainVideo.style.setProperty("--sub-bg", bg);
        localStorage.setItem("sub_bg", bg);
      });
    });
  }
}

export function applySavedSubtitleSettings() {
  getElements();
  if (!elMainVideo) return;

  const size = localStorage.getItem("sub_size") || "100";
  const yOffset = localStorage.getItem("sub_y_offset") || "0";
  const color = localStorage.getItem("sub_color") || "#ffffff";
  const bg = localStorage.getItem("sub_bg") || "rgba(0, 0, 0, 0.6)";

  elMainVideo.style.setProperty("--sub-size", `${size}%`);
  elMainVideo.style.setProperty("--sub-y-offset", `${yOffset}px`);
  elMainVideo.style.setProperty("--sub-color", color);
  elMainVideo.style.setProperty("--sub-bg", bg);

  if (elSubSliderSize) {
    elSubSliderSize.value = size;
    if (elSubSizeVal) elSubSizeVal.textContent = `${size}%`;
  }
  if (elSubSliderY) {
    elSubSliderY.value = yOffset;
    if (elSubYVal) elSubYVal.textContent = `${yOffset}px`;
  }

  if (elSubColorOptions) {
    elSubColorOptions.querySelectorAll(".sub-option-btn").forEach(btn => {
      if (btn.dataset.color === color) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  if (elSubBgOptions) {
    elSubBgOptions.querySelectorAll(".sub-option-btn").forEach(btn => {
      if (btn.dataset.bg === bg) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }
}
