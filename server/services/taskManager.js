import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fetchBuffer } from "../utils/fetcher.js";
import { applyDecryption } from "../utils/decrypter.js";
import { convertToMp4 } from "./ffmpeg.js";

// Global tasks maps
export const tasks = new Map();
export const playableConversionTasks = new Map();
export const thumbnailGenerationTasks = new Map();

// Global task queue for download tasks (Max 2 concurrent)
export const taskQueue = [];
export let activeRunningTasks = 0;
export const MAX_CONCURRENT_TASKS = 2;

export function processTaskQueue() {
  if (taskQueue.length === 0) return;
  if (activeRunningTasks >= MAX_CONCURRENT_TASKS) return;

  const nextTask = taskQueue.shift();
  const state = tasks.get(nextTask.taskId);
  if (state && state.status === "cancelled") {
    console.log(`[Task Queue] Kuyruktaki görev iptal edilmiş, atlanıyor: ${nextTask.taskId}`);
    processTaskQueue();
    return;
  }

  activeRunningTasks++;

  console.log(`[Task Queue] Görev başlatılıyor: ${nextTask.taskId}. Kalan kuyruk: ${taskQueue.length}`);
  
  if (state) {
    state.status = "running";
  }

  runTask(nextTask.taskId, nextTask.urls, nextTask.outputPath, nextTask.options)
    .catch((err) => {
      console.error(`[Task Queue] Görev hatayla sonuçlandı: ${nextTask.taskId}`, err.message);
    })
    .finally(() => {
      activeRunningTasks--;
      processTaskQueue();
    });
}

export function scheduleTaskCleanup(taskId, delayMs = 10 * 60 * 1000) {
  setTimeout(() => {
    tasks.delete(taskId);
  }, delayMs).unref?.();
}

export function cleanupTaskFiles(tempDir, tsOutputPath, outputPath, options) {
  try {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (_) {}
  try {
    if (tsOutputPath && fs.existsSync(tsOutputPath)) {
      fs.unlinkSync(tsOutputPath);
    }
  } catch (_) {}
  if (options && options.subtitles && Array.isArray(options.subtitles)) {
    const baseName = path.basename(outputPath, path.extname(outputPath));
    for (const sub of options.subtitles) {
      try {
        const subFileName = `${baseName}.${sub.lang || "tr"}.vtt`;
        const subPath = path.join(path.dirname(outputPath), subFileName);
        if (fs.existsSync(subPath)) {
          fs.unlinkSync(subPath);
        }
      } catch (_) {}
    }
  }
}

export function stableTempDirForOutput(outputPath) {
  const base = path
    .basename(outputPath)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120);
  const hash = crypto
    .createHash("sha1")
    .update(String(outputPath))
    .digest("hex")
    .slice(0, 10);
  const parentDir = path.dirname(outputPath);
  return path.join(parentDir, `.temp_${base}_${hash}`);
}

export async function runTask(taskId, urls, outputPath, options) {
  const state = tasks.get(taskId);
  if (!state) return;
  
  const concurrencyLimit = parseInt(options.concurrency || 5, 10);

  // Download subtitles if provided
  if (options.subtitles && Array.isArray(options.subtitles)) {
    for (const sub of options.subtitles) {
      if (sub.src) {
        try {
          state.logs.push(`Altyazı indiriliyor: ${sub.label || sub.lang}...`);
          const subBuf = await fetchBuffer(sub.src, {
            Referer: "https://www.diziyou.one/",
          });
          const baseName = path.basename(outputPath, path.extname(outputPath));
          const subFileName = `${baseName}.${sub.lang || "tr"}.vtt`;
          const subPath = path.join(path.dirname(outputPath), subFileName);
          fs.writeFileSync(subPath, subBuf);
          state.logs.push(`Altyazı başarıyla kaydedildi: ${subFileName}`);
        } catch (subErr) {
          state.logs.push(
            `Altyazı indirme hatası (${sub.label}): ${subErr.message}`,
          );
        }
      }
    }
  }
  const extraHeaders = options.referer ? { Referer: options.referer } : {};

  const isMp4 = outputPath.toLowerCase().endsWith(".mp4");
  const tsOutputPath = isMp4
    ? outputPath.replace(/\.mp4$/i, ".ts")
    : outputPath;

  // Create temporary directory for segment files
  const tempDir = stableTempDirForOutput(outputPath);
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (err) {
    state.logs.push(`Geçici klasör oluşturma hatası: ${err.message}`);
    state.status = "error";
    return;
  }

  // Count already downloaded segments
  let resumedCount = 0;
  try {
    for (let i = 0; i < urls.length; i++) {
      const segmentPath = path.join(tempDir, `segment_${i}.ts`);
      if (fs.existsSync(segmentPath)) {
        const st = fs.statSync(segmentPath);
        if (st.isFile() && st.size > 0) {
          resumedCount++;
        }
      }
    }
    if (resumedCount > 0) {
      state.completed = resumedCount;
      state.logs.push(
        `Kaldığı yerden devam: ${resumedCount}/${urls.length} segment zaten indirilmiş, atlanıyor.`,
      );
    }
  } catch (_) {}

  // Mirror host validation
  let activeCandidateHosts = [];
  let effectiveConcurrencyLimit = concurrencyLimit;

  if (
    options.candidateHosts &&
    options.candidateHosts.length > 0 &&
    urls.length > 0
  ) {
    state.logs.push("Ayna sunucular test ediliyor...");
    const testHost = options.candidateHosts[0];
    try {
      const parsed = new URL(urls[0]);
      parsed.host = testHost;
      const testUrl = parsed.toString();
      await fetchBuffer(testUrl, extraHeaders);
      state.logs.push(
        "Ayna sunucular aktif, hızlı dağıtık indirme modu devrede.",
      );
      activeCandidateHosts = options.candidateHosts;
    } catch (_) {
      state.logs.push(
        "Ayna sunucular bu video için pasif. Orijinal sunucudan indiriliyor...",
      );
      activeCandidateHosts = [];
      effectiveConcurrencyLimit = Math.min(concurrencyLimit, 4);
    }
  } else {
    effectiveConcurrencyLimit = Math.min(concurrencyLimit, 4);
  }

  const queue = urls.map((url, idx) => ({ url, idx }));
  let currentIndex = 0;

  const runWorker = async () => {
    while (currentIndex < queue.length) {
      if (state.status === "cancelled") break;
      const item = queue[currentIndex++];

      const segmentPath = path.join(tempDir, `segment_${item.idx}.ts`);
      try {
        if (fs.existsSync(segmentPath)) {
          const st = fs.statSync(segmentPath);
          if (st.isFile() && st.size > 0) {
            continue;
          }
        }
      } catch (_) {}

      const staggerDelay = Math.floor(Math.random() * 150);
      await new Promise((resolve) => setTimeout(resolve, staggerDelay));

      let segmentUrl = item.url;
      let usingAlternative = false;
      if (activeCandidateHosts.length > 0) {
        try {
          const parsed = new URL(item.url);
          const targetHost =
            activeCandidateHosts[item.idx % activeCandidateHosts.length];
          parsed.host = targetHost;
          segmentUrl = parsed.toString();
          usingAlternative = true;
        } catch (_) {}
      }

      let attempt = 0;
      let success = false;
      let buffer = null;
      let lastErrorStatus = null;

      while (attempt < 5 && !success) {
        if (state.status === "cancelled") break;
        try {
          attempt++;
          const currentUrl =
            usingAlternative && (attempt > 2 || lastErrorStatus === 404)
              ? item.url
              : segmentUrl;
          buffer = await fetchBuffer(currentUrl, extraHeaders);
          success = true;
        } catch (err) {
          const errStr = err.message || err.toString();
          state.logs.push(
            `Segment #${item.idx} indirme hatası (Deneme ${attempt}/5): ${errStr}`,
          );

          if (errStr.includes("HTTP Status 404")) {
            lastErrorStatus = 404;
          }

          if (attempt < 5) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
      }

      if (state.status === "cancelled") break;

      if (success && buffer) {
        try {
          const decrypted = applyDecryption(buffer, options.method, options);
          await fs.promises.writeFile(segmentPath, decrypted);
          state.completed++;
        } catch (err) {
          state.failed++;
          state.logs.push(
            `Segment #${item.idx} deşifre/yazma hatası: ${err.message || err}`,
          );
        }
      } else {
        state.failed++;
        state.logs.push(
          `Segment #${item.idx} 5 deneme sonrasında indirilemedi.`,
        );
      }
    }
  };

  const workers = [];
  for (let i = 0; i < Math.min(effectiveConcurrencyLimit, queue.length); i++) {
    workers.push(runWorker());
  }

  await Promise.all(workers);

  if (state.status === "cancelled") {
    cleanupTaskFiles(tempDir, tsOutputPath, outputPath, options);
    state.logs.push("Görev iptal edildi. Geçici dosyalar temizlendi.");
    scheduleTaskCleanup(taskId);
    return;
  }

  state.logs.push(
    "Segment indirmeleri tamamlandı. Dosyalar birleştiriliyor...",
  );

  const writeStream = fs.createWriteStream(tsOutputPath);

  try {
    for (let i = 0; i < urls.length; i++) {
      if (state.status === "cancelled") {
        break;
      }
      const segmentPath = path.join(tempDir, `segment_${i}.ts`);
      if (fs.existsSync(segmentPath)) {
        const readStream = fs.createReadStream(segmentPath);
        await new Promise((resolve, reject) => {
          readStream.pipe(writeStream, { end: false });
          readStream.on("end", resolve);
          readStream.on("error", reject);
        });
      }
    }

    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  } catch (err) {
    writeStream.destroy();
    state.logs.push(`Birleştirme sırasında hata oluştu: ${err.message}`);
    state.status = "error";
    return;
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  if (state.status === "cancelled") {
    cleanupTaskFiles(tempDir, tsOutputPath, outputPath, options);
    state.logs.push(
      "Görev birleştirme esnasında iptal edildi. Geçici çıktı temizlendi.",
    );
    scheduleTaskCleanup(taskId);
    return;
  }

  if (state.failed > 0) {
    state.logs.push(
      `⚠ ${state.failed} segment indirilemedi. Video eksik veya bozuk olabilir.`,
    );
  }

  if (isMp4) {
    state.logs.push(
      "TS birleştirme tamamlandı. MP4 dönüşümü başlatılıyor (FFmpeg, kalite kaybı olmadan)...",
    );
    try {
      await convertToMp4(tsOutputPath, outputPath, state);
      try {
        fs.unlinkSync(tsOutputPath);
      } catch (_) {}
      state.status = "completed";
      state.logs.push(
        `MP4 dönüşümü tamamlandı. Video kaydedildi: downloads/${path.basename(outputPath)}`,
      );
      scheduleTaskCleanup(taskId);
    } catch (err) {
      const tsBaseName = path.basename(tsOutputPath);
      state.status = "completed";
      state.outputName = tsBaseName;
      state.logs.push(
        `MP4 dönüşüm hatası: ${err.message} - TS dosyası korundu: downloads/${tsBaseName}`,
      );
      scheduleTaskCleanup(taskId);
    }
  } else {
    state.status = "completed";
    state.logs.push(
      `İşlem başarıyla tamamlandı. Video kaydedildi: downloads/${path.basename(outputPath)}`,
    );
    scheduleTaskCleanup(taskId);
  }
}
