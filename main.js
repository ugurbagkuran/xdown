import { app, BrowserWindow, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { startServer } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverInstance = null;
let serverPort = 3000;

async function bootExpressServer() {
  // Port çakışmalarını önlemek için 3000'den başlayıp boş port arıyoruz
  for (let p = 3000; p < 3020; p++) {
    try {
      serverInstance = await startServer(p);
      serverPort = p;
      console.log(`Express sunucusu başarıyla başlatıldı. Port: ${serverPort}`);
      return true;
    } catch (err) {
      if (err.code !== "EADDRINUSE") {
        console.error(`Sunucu başlatılırken beklenmeyen hata: ${err.message}`);
        throw err;
      }
      console.log(`Port ${p} meşgul, bir sonraki port deneniyor...`);
    }
  }
  throw new Error("Uygun boş port bulunamadı.");
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "filmdownloader.",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Brutalist dil uyumluluğu için menü çubuğunu kaldırıyoruz
  Menu.setApplicationMenu(null);

  // Yerel sunucuyu yükle
  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Electron başlatıldığında önce Express sunucusunu ayağa kaldırıyoruz, ardından pencereyi açıyoruz
app.whenReady().then(async () => {
  try {
    await bootExpressServer();
    await createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    console.error("Uygulama başlatılamadı:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Arka plandaki Express sunucusunu kapatıyoruz
  if (serverInstance) {
    serverInstance.close(() => {
      console.log("Express sunucusu kapatıldı.");
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  } else {
    if (process.platform !== "darwin") {
      app.quit();
    }
  }
});
