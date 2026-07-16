import { apiGetSettings, apiSaveSettings, apiSelectFolder } from "../services/api.js";

// DOM Elements
let elDownloadsDirInput, elBtnSelectDir, elConcurrencySelect, 
    elPlaybackSpeedSelect, elNotificationsCheckbox, elBtnSave;

function getElements() {
  elDownloadsDirInput = document.getElementById("settings-downloads-dir");
  elBtnSelectDir = document.getElementById("btn-settings-select-dir");
  elConcurrencySelect = document.getElementById("settings-concurrency");
  elPlaybackSpeedSelect = document.getElementById("settings-playback-speed");
  elNotificationsCheckbox = document.getElementById("settings-notifications");
  elBtnSave = document.getElementById("btn-settings-save");
}

async function loadSettingsFromServer() {
  getElements();
  try {
    const data = await apiGetSettings();
    if (data.success && data.settings) {
      const s = data.settings;
      if (elDownloadsDirInput) elDownloadsDirInput.value = s.downloadsDir || "";
      if (elConcurrencySelect) elConcurrencySelect.value = String(s.maxConcurrency || 5);
      if (elPlaybackSpeedSelect) elPlaybackSpeedSelect.value = String(s.defaultPlaybackSpeed || 1);
      if (elNotificationsCheckbox) elNotificationsCheckbox.checked = !!s.showNotifications;
    }
  } catch (err) {
    console.error("Ayarlar sunucudan yüklenemedi:", err);
  }
}

async function saveSettingsToServer() {
  getElements();
  if (!elBtnSave) return;

  elBtnSave.disabled = true;
  elBtnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> kaydediliyor...';

  const settingsData = {
    downloadsDir: elDownloadsDirInput ? elDownloadsDirInput.value.trim() : "",
    maxConcurrency: elConcurrencySelect ? parseInt(elConcurrencySelect.value, 10) : 5,
    defaultPlaybackSpeed: elPlaybackSpeedSelect ? parseFloat(elPlaybackSpeedSelect.value) : 1,
    showNotifications: elNotificationsCheckbox ? elNotificationsCheckbox.checked : true
  };

  try {
    const data = await apiSaveSettings(settingsData);
    if (data.success) {
      alert("Ayarlar başarıyla kaydedildi.");
      // Ayarlar kaydolduktan sonra kütüphanenin de yenilenmesi gerekir çünkü downloadsDir değişmiş olabilir.
      if (window.refreshLibraryList) {
        window.refreshLibraryList();
      }
    } else {
      alert("Ayarlar kaydedilemedi: " + (data.error || "Bilinmeyen hata"));
    }
  } catch (err) {
    alert("Ayarlar kaydedilirken hata oluştu: " + err.message);
  } finally {
    elBtnSave.disabled = false;
    elBtnSave.innerHTML = '<span class="material-symbols-outlined text-[18px]">save</span> ayarları_kaydet.';
  }
}

async function handleSelectFolder() {
  try {
    const data = await apiSelectFolder();
    if (data.success && data.path) {
      if (elDownloadsDirInput) elDownloadsDirInput.value = data.path;
    } else if (data.error) {
      alert("Klasör seçilemedi: " + data.error);
    }
  } catch (err) {
    alert("Klasör seçici açılamadı: " + err.message);
  }
}

export function initSettings() {
  getElements();

  if (elBtnSelectDir) {
    elBtnSelectDir.addEventListener("click", handleSelectFolder);
  }

  if (elBtnSave) {
    elBtnSave.addEventListener("click", saveSettingsToServer);
  }

  // İlk yükleme
  loadSettingsFromServer();
}
