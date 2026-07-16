import fs from "fs";
import path from "path";

const settingsPath = path.join(process.cwd(), "settings.json");

export let appSettings = {
  downloadsDir: path.join(process.cwd(), "downloads"),
  maxConcurrency: 5,
  showNotifications: true,
  defaultPlaybackSpeed: 1
};

export function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      Object.assign(appSettings, data);
    }
  } catch (err) {
    console.error("Ayarlar yüklenirken hata:", err);
  }
}

export function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(appSettings, null, 2), "utf-8");
  } catch (err) {
    console.error("Ayarlar kaydedilirken hata:", err);
  }
}

// İlk yükleme
loadSettings();
