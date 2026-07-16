import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import custom modules
import { 
  fetchBuffer, 
  checkUrlReachable, 
  estimateSegmentsSize 
} from "./server/utils/fetcher.js";

import { 
  detectTsOffset, 
  detectXorKey 
} from "./server/utils/decrypter.js";

import { 
  ensurePlayableCacheDir, 
  ensureThumbnailCacheDir 
} from "./server/services/ffmpeg.js";

import { 
  tasks, 
  playableConversionTasks, 
  thumbnailGenerationTasks, 
  taskQueue, 
  processTaskQueue, 
  scheduleTaskCleanup 
} from "./server/services/taskManager.js";

import { 
  searchSeries, 
  getSeriesDetail, 
  extractSeriesVideo 
} from "./server/scrapers/diziyou.js";

import { 
  searchMovies, 
  extractMoviePlayer, 
  fetchPlayerIframeUrl, 
  extractManifestFromHtml 
} from "./server/scrapers/fullhdfilmizle.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Disable caching for all API responses
app.use("/api", (req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Client Logging Endpoint
app.post("/api/log", (req, res) => {
  const { type, message } = req.body;
  console.log(`[CLIENT ${type || 'ERROR'}]`, message);
  res.sendStatus(200);
});

// ─── SEARCH & AUTO-EXTRACT ENDPOINTS ─────────────────────────────────────────

// 1) Search: fullhdfilmizle.mom/?s=query (movie) or diziyou.one/?s=query (series)
app.get("/api/search", async (req, res) => {
  const { q, type } = req.query;
  if (!q) return res.status(400).json({ error: "Arama terimi gerekli." });

  try {
    if (type === "series") {
      const films = await searchSeries(q);
      res.json({ success: true, films });
    } else {
      const films = await searchMovies(q);
      res.json({ success: true, films });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2) Extract player info from film page
app.get("/api/extract-player", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL gerekli." });
  try {
    const data = await extractMoviePlayer(url);
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3) Extract stream URL: admin-ajax → iframe → manifest
app.get("/api/extract-stream", async (req, res) => {
  const { postId, nonce, player, filmUrl, partKey } = req.query;
  if (!postId || !nonce)
    return res.status(400).json({ error: "postId ve nonce gerekli." });

  const requestedPlayer = player || "FastPlay";
  const allPlayers = [
    requestedPlayer,
    "FastPlay",
    "SetPlay",
    "Türkçe",
    "Türkçe Altyazılı",
    "HD",
    "TR",
    "EN",
    "Vidmoly",
    "Vudeo",
    "Doodstream",
  ];
  const uniquePlayers = [...new Set(allPlayers)];

  try {
    let manifestUrl = null;
    let iframeUrl = null;
    let usedPlayer = null;
    let extractedResult = null;

    for (const playerName of uniquePlayers) {
      try {
        const iframe = await fetchPlayerIframeUrl(
          postId,
          nonce,
          playerName,
          filmUrl,
          partKey || "",
        );
        if (!iframe) continue;

        const playerBuf = await fetchBuffer(iframe, {
          Referer: "https://www.fullhdfilmizle.mom/",
        });
        const playerHtml = playerBuf.toString("utf-8");
        const extracted = extractManifestFromHtml(playerHtml, iframe);

        if (extracted) {
          let workingUrl = null;
          if (extracted.candidateUrls.length > 1) {
            for (const candidate of extracted.candidateUrls) {
              const ok = await checkUrlReachable(candidate, iframe);
              if (ok) {
                workingUrl = candidate;
                break;
              }
            }
          }
          manifestUrl = workingUrl || extracted.manifestUrl;
          iframeUrl = iframe;
          usedPlayer = playerName;
          extractedResult = extracted;
          break;
        }

        const nestedIframeM = playerHtml.match(
          /<iframe[^>]+src=["']([^"']+)["']/i,
        );
        if (nestedIframeM) {
          try {
            const nestedUrl = nestedIframeM[1].startsWith("http")
              ? nestedIframeM[1]
              : new URL(nestedIframeM[1], iframe).toString();
            const nestedBuf = await fetchBuffer(nestedUrl, { Referer: iframe });
            const nestedHtml = nestedBuf.toString("utf-8");
            const nestedExtracted = extractManifestFromHtml(
              nestedHtml,
              nestedUrl,
            );
            if (nestedExtracted) {
              let workingUrl = null;
              if (nestedExtracted.candidateUrls.length > 1) {
                for (const candidate of nestedExtracted.candidateUrls) {
                  const ok = await checkUrlReachable(candidate, nestedUrl);
                  if (ok) {
                    workingUrl = candidate;
                    break;
                  }
                }
              }
              manifestUrl = workingUrl || nestedExtracted.manifestUrl;
              iframeUrl = nestedUrl;
              usedPlayer = playerName;
              extractedResult = nestedExtracted;
              break;
            }
          } catch (_) {}
        }
      } catch (_) {
        continue;
      }
    }

    if (!manifestUrl || !iframeUrl) {
      return res.status(422).json({
        success: false,
        error:
          "Hiçbir oynatıcıdan Manifest URL alınamadı. Site yapısı değişmiş olabilir.",
      });
    }

    const parsedIframe = new URL(iframeUrl);
    const streamReferer = `${parsedIframe.protocol}//${parsedIframe.host}/`;
    res.json({
      success: true,
      manifestUrl,
      iframeUrl,
      streamReferer,
      usedPlayer,
      candidateUrls:
        extractedResult && extractedResult.candidateUrls
          ? extractedResult.candidateUrls
          : [manifestUrl],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: parse media/segment playlist and return analysis data
async function analyzePlaylistData(contentStr, playlistUrl, extraHeaders) {
  const lines = contentStr.split("\n");
  const segments = [];
  const baseUrl = new URL(playlistUrl);

  for (let line of lines) {
    line = line.trim();
    if (line && !line.startsWith("#")) {
      const resolvedUrl = new URL(line, baseUrl).toString();
      segments.push(resolvedUrl);
    }
  }

  if (segments.length === 0) {
    return {
      success: true,
      isPlaylist: true,
      totalSegments: 0,
      segments: [],
      error: "M3U8 çalma listesinde segment bulunamadı.",
    };
  }

  const firstSegUrl = segments[0];
  const segBuffer = await fetchBuffer(firstSegUrl, extraHeaders);
  const firstBytesHex = segBuffer
    .slice(0, 16)
    .toString("hex")
    .match(/../g)
    .join(" ");

  let suggestion = {
    method: "none",
    confidence: "low",
    details: "Bilinmeyen format",
  };
  const cleanTsOffset = detectTsOffset(segBuffer);
  if (cleanTsOffset === 0) {
    suggestion = {
      method: "none",
      confidence: "high",
      details: "Doğrudan geçerli TS formatı.",
    };
  } else if (cleanTsOffset > 0) {
    suggestion = {
      method: "strip",
      stripBytes: cleanTsOffset,
      confidence: "high",
      details: `İlk ${cleanTsOffset} byte sahte PNG/meta verisi içeriyor, sonrasında TS formatı başlıyor.`,
    };
  } else {
    const xorKey = detectXorKey(segBuffer);
    if (xorKey !== -1) {
      suggestion = {
        method: "xor",
        key: `0x${xorKey.toString(16).padStart(2, "0")}`,
        confidence: "high",
        details: `Tek byte XOR şifreleme tespit edildi. Anahtar: 0x${xorKey.toString(16).toUpperCase()}`,
      };
    }
  }

  const estimatedSize = await estimateSegmentsSize(
    segments,
    extraHeaders,
    segBuffer.length,
  );

  return {
    success: true,
    isPlaylist: true,
    totalSegments: segments.length,
    segments,
    size: segBuffer.length,
    estimatedSize,
    firstBytesHex,
    rawBytesBase64: segBuffer.slice(0, 512).toString("base64"),
    suggestion,
  };
}

async function parseMediaPlaylist(contentStr, playlistUrl, res, extraHeaders) {
  try {
    const data = await analyzePlaylistData(contentStr, playlistUrl, extraHeaders);
    res.json(data);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `Segment analizi hatası: ${err.message}`,
    });
  }
}

// Unified Analyze Endpoint: Auto detects if the URL is a playlist or a direct segment
app.get("/api/analyze", async (req, res) => {
  const { url, referer, quality } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL parametresi gerekli." });
  }

  const extraHeaders = referer ? { Referer: referer } : {};

  try {
    const buffer = await fetchBuffer(url, extraHeaders);
    const contentStr = buffer.toString("utf-8").trim();

    if (contentStr.startsWith("#EXTM3U")) {
      const isMasterPlaylist = contentStr.includes("#EXT-X-STREAM-INF");

      if (isMasterPlaylist) {
        const lines = contentStr.split("\n");
        const baseUrl = new URL(url);
        let bestPlaylistUrl = null;
        let maxResolution = 0;
        let matchedQualityUrl = null;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith("#EXT-X-STREAM-INF")) {
            const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            let width = 0;
            let height = 0;
            if (resMatch) {
              width = parseInt(resMatch[1], 10);
              height = parseInt(resMatch[2], 10);
            }

            const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
            let bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;

            let nextLineUrl = null;
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j].trim();
              if (nextLine && !nextLine.startsWith("#")) {
                nextLineUrl = nextLine;
                break;
              }
            }

            if (nextLineUrl) {
              const score = width > 0 ? width : bw;
              const currentUrl = new URL(nextLineUrl, baseUrl).toString();

              if (quality && height > 0 && `${height}p` === quality) {
                matchedQualityUrl = currentUrl;
              }

              if (score > maxResolution || !bestPlaylistUrl) {
                maxResolution = score;
                bestPlaylistUrl = currentUrl;
              }
            }
          }
        }

        const finalPlaylistUrl = matchedQualityUrl || bestPlaylistUrl;

        if (finalPlaylistUrl) {
          console.log(
            `Master playlist algılandı. Seçilen kalite playlist: ${finalPlaylistUrl}`
          );
          const subBuffer = await fetchBuffer(finalPlaylistUrl, extraHeaders);
          const subContentStr = subBuffer.toString("utf-8").trim();
          return parseMediaPlaylist(
            subContentStr,
            bestPlaylistUrl,
            res,
            extraHeaders,
          );
        }
      }

      return parseMediaPlaylist(contentStr, url, res, extraHeaders);
    } else {
      // It's a direct segment!
      const firstBytesHex = buffer
        .slice(0, 16)
        .toString("hex")
        .match(/../g)
        .join(" ");

      let suggestion = {
        method: "none",
        confidence: "low",
        details: "Bilinmeyen format",
      };
      const cleanTsOffset = detectTsOffset(buffer);
      if (cleanTsOffset === 0) {
        suggestion = {
          method: "none",
          confidence: "high",
          details: "Doğrudan geçerli TS formatı.",
        };
      } else if (cleanTsOffset > 0) {
        suggestion = {
          method: "strip",
          stripBytes: cleanTsOffset,
          confidence: "high",
          details: `İlk ${cleanTsOffset} byte sahte PNG/meta verisi içeriyor, sonrasında TS formatı başlıyor.`,
        };
      } else {
        const xorKey = detectXorKey(buffer);
        if (xorKey !== -1) {
          suggestion = {
            method: "xor",
            key: `0x${xorKey.toString(16).padStart(2, "0")}`,
            confidence: "high",
            details: `Tek byte XOR şifreleme tespit edildi. Anahtar: 0x${xorKey.toString(16).toUpperCase()}`,
          };
        }
      }

      res.json({
        success: true,
        isPlaylist: false,
        totalSegments: 1,
        segments: [url],
        size: buffer.length,
        estimatedSize: {
          bytes: buffer.length,
          exact: true,
          measuredSegments: 1,
        },
        firstBytesHex,
        rawBytesBase64: buffer.slice(0, 512).toString("base64"),
        suggestion,
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download coordinator endpoint
app.post("/api/download", (req, res) => {
  const {
    urls,
    method,
    key,
    iv,
    stripBytes,
    concurrency,
    outputName,
    referer,
    candidateHosts,
    subtitles,
  } = req.body;
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "İndirilecek URL listesi geçersiz." });
  }

  const taskId = crypto.randomUUID();
  const taskOutputName = outputName || `video_${Date.now()}.ts`;

  const downloadsDir = path.join(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const finalOutputPath = path.join(downloadsDir, taskOutputName);

  const taskState = {
    id: taskId,
    total: urls.length,
    completed: 0,
    failed: 0,
    status: "waiting",
    logs: [`Görev kuyruğa eklendi. Sırasını bekliyor...`],
    outputPath: finalOutputPath,
    outputName: taskOutputName,
    subtitles: subtitles || [],
  };

  tasks.set(taskId, taskState);
  res.json({ success: true, taskId });

  // Queue the task
  taskQueue.push({
    taskId,
    urls,
    outputPath: finalOutputPath,
    options: {
      method,
      key,
      iv,
      stripBytes,
      concurrency,
      referer,
      candidateHosts,
      subtitles,
    }
  });

  processTaskQueue();
});

// ─── DIZIYOU SERIES DETAILS & VIDEO EXTRACTION ENDPOINTS ───────────────────

app.get("/api/series-detail", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Dizi URL'si gerekli." });
  try {
    const seasons = await getSeriesDetail(url);
    res.json({ success: true, seasons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/extract-series-video", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Bölüm URL'si gerekli." });

  try {
    const streams = await extractSeriesVideo(url);
    res.json({ success: true, streams });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Progress endpoint (Polling style)
app.get("/api/task-status/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: "Görev bulunamadı." });
  }
  res.json(task);
});

// Cancel task
app.post("/api/task-cancel/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: "Görev bulunamadı." });
  }
  task.status = "cancelled";
  scheduleTaskCleanup(taskId);
  res.json({ success: true });
});

function resolveDownloadFilePath(fileParam) {
  const downloadsDir = path.join(process.cwd(), "downloads");
  const decoded = decodeURIComponent(String(fileParam || ""));
  const fileName = path.basename(decoded);
  const filePath = path.join(downloadsDir, fileName);
  const relative = path.relative(downloadsDir, filePath);
  const isSafe = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!isSafe) return null;
  return { downloadsDir, fileName, filePath };
}

function subtitleLangLabel(lang) {
  const normalized = String(lang || "").toLowerCase();
  if (normalized === "tr") return "Turkce";
  if (normalized === "en") return "English";
  if (normalized === "de") return "Deutsch";
  if (normalized === "es") return "Espanol";
  if (normalized === "fr") return "Francais";
  return normalized ? normalized.toUpperCase() : "Bilinmeyen";
}

app.get("/api/video-subtitles", (req, res) => {
  const resolved = resolveDownloadFilePath(req.query.file);
  if (!resolved) {
    return res.status(400).json({ success: false, error: "Gecersiz dosya." });
  }

  const { downloadsDir, fileName, filePath } = resolved;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, error: "Video dosyasi bulunamadi." });
  }

  const baseName = path.basename(fileName, path.extname(fileName));
  const prefix = `${baseName}.`;

  let subtitles = [];
  try {
    subtitles = fs
      .readdirSync(downloadsDir)
      .filter((name) => name.startsWith(prefix) && name.toLowerCase().endsWith(".vtt"))
      .map((name, index) => {
        const langPart = name.slice(prefix.length, -4).trim().toLowerCase();
        const safeLang = langPart || `sub${index + 1}`;
        return {
          lang: safeLang,
          label: subtitleLangLabel(safeLang),
          file: name,
          src: `/downloads/${encodeURIComponent(name)}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }

  res.json({ success: true, subtitles });
});

app.get("/api/video-thumbnail", async (req, res) => {
  const resolved = resolveDownloadFilePath(req.query.file);
  if (!resolved) {
    return res.status(400).json({ success: false, error: "Gecersiz dosya." });
  }

  const { fileName, filePath } = resolved;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, error: "Video dosyasi bulunamadi." });
  }

  const ext = path.extname(fileName).toLowerCase();
  if (ext !== ".ts" && ext !== ".mp4") {
    return res.status(400).json({ success: false, error: "Desteklenmeyen video uzantisi." });
  }

  const sourceStat = fs.statSync(filePath);
  const cacheDir = ensureThumbnailCacheDir();
  const thumbFileName = `${path.basename(fileName, ext)}.jpg`;
  const thumbPath = path.join(cacheDir, thumbFileName);

  const existingAndFresh =
    fs.existsSync(thumbPath) &&
    fs.statSync(thumbPath).isFile() &&
    fs.statSync(thumbPath).mtimeMs >= sourceStat.mtimeMs;

  if (!existingAndFresh) {
    const running = thumbnailGenerationTasks.get(filePath);
    if (running) {
      try {
        await running;
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      const { generateVideoThumbnail } = await import("./server/services/ffmpeg.js");
      const thumbnailPromise = generateVideoThumbnail(filePath, thumbPath)
        .finally(() => {
          thumbnailGenerationTasks.delete(filePath);
        });
      thumbnailGenerationTasks.set(filePath, thumbnailPromise);
      try {
        await thumbnailPromise;
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  if (!fs.existsSync(thumbPath)) {
    return res.status(500).json({ success: false, error: "Kucuk gorsel olusturulamadi." });
  }

  res.type("image/jpeg");
  res.sendFile(thumbPath);
});

app.get("/api/prepare-video", async (req, res) => {
  const resolved = resolveDownloadFilePath(req.query.file);
  if (!resolved) {
    return res.status(400).json({ success: false, error: "Gecersiz dosya." });
  }

  const { fileName, filePath } = resolved;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ success: false, error: "Video dosyasi bulunamadi." });
  }

  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".mp4") {
    return res.json({
      success: true,
      url: `/downloads/${encodeURIComponent(fileName)}`,
      prepared: false,
      type: "mp4",
    });
  }

  if (ext !== ".ts") {
    return res.status(400).json({ success: false, error: "Desteklenmeyen video uzantisi." });
  }

  const sourceStat = fs.statSync(filePath);
  const cacheDir = ensurePlayableCacheDir();
  const baseName = path.basename(fileName, ".ts");
  const playableFileName = `${baseName}.playable.mp4`;
  const playablePath = path.join(cacheDir, playableFileName);

  const existingAndFresh =
    fs.existsSync(playablePath) &&
    fs.statSync(playablePath).isFile() &&
    fs.statSync(playablePath).mtimeMs >= sourceStat.mtimeMs;

  if (!existingAndFresh) {
    const running = playableConversionTasks.get(filePath);
    if (running) {
      try {
        await running;
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    } else {
      const { convertTsToPlayableMp4 } = await import("./server/services/ffmpeg.js");
      const conversionPromise = convertTsToPlayableMp4(filePath, playablePath)
        .finally(() => {
          playableConversionTasks.delete(filePath);
        });
      playableConversionTasks.set(filePath, conversionPromise);
      try {
        await conversionPromise;
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }
  }

  if (!fs.existsSync(playablePath)) {
    return res.status(500).json({ success: false, error: "Oynatilabilir video olusturulamadi." });
  }

  res.json({
    success: true,
    url: `/playable-cache/${encodeURIComponent(playableFileName)}`,
    prepared: true,
    type: "mp4",
  });
});

// List downloaded files (.mp4 and .ts)
app.get("/api/downloads-list", (req, res) => {
  const downloadsDir = path.join(process.cwd(), "downloads");
  if (!fs.existsSync(downloadsDir)) {
    return res.json({ success: true, files: [] });
  }

  try {
    const files = fs.readdirSync(downloadsDir);
    const videoFiles = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".mp4" || ext === ".ts") {
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          videoFiles.push({
            name: file,
            size: stats.size,
            createdAt: stats.birthtime,
            path: `/downloads/${file}`
          });
        }
      }
    }

    videoFiles.sort((a, b) => b.createdAt - a.createdAt);
    res.json({ success: true, files: videoFiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stream TS files on-the-fly converting to MP4 format dynamically using FFmpeg
app.get("/api/stream-ts", async (req, res) => {
  const { file } = req.query;
  if (!file) {
    return res.status(400).send("Dosya belirtilmedi.");
  }

  const downloadsDir = path.join(process.cwd(), "downloads");
  const filePath = path.join(downloadsDir, file);

  const relative = path.relative(downloadsDir, filePath);
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!isSafe || !fs.existsSync(filePath)) {
    return res.status(404).send("Dosya bulunamadı veya geçersiz yol.");
  }

  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Transfer-Encoding": "chunked"
  });

  const { spawn } = await import("child_process");
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-fflags", "+genpts",
    "-i", filePath,
    "-c", "copy",
    "-f", "mp4",
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "pipe:1"
  ]);

  ffmpeg.stdout.pipe(res);

  res.on("close", () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[FFmpeg Stream] Process exited with code ${code}`);
    }
    if (!res.writableEnded) {
      res.end();
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("[FFmpeg Stream] Error spawning FFmpeg:", err);
    if (!res.headersSent) {
      res.status(500).send(`FFmpeg stream hatası: ${err.message}. Lütfen FFmpeg yüklü olduğundan emin olun.`);
    }
  });
});

app.use("/downloads", express.static(path.join(process.cwd(), "downloads")));
app.use("/playable-cache", express.static(path.join(process.cwd(), "downloads", ".playable-cache")));

export { app };
export function startServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app
      .listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
        resolve(server);
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  startServer(PORT).catch((err) => {
    console.error("Server start error:", err);
  });
}
