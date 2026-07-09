import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Global tasks map
const tasks = new Map();
const playableConversionTasks = new Map();
const thumbnailGenerationTasks = new Map();

// Global task queue for download tasks (Max 2 concurrent)
const taskQueue = [];
let activeRunningTasks = 0;
const MAX_CONCURRENT_TASKS = 2;

function processTaskQueue() {
  if (taskQueue.length === 0) return;
  if (activeRunningTasks >= MAX_CONCURRENT_TASKS) return;

  const nextTask = taskQueue.shift();
  activeRunningTasks++;

  console.log(`[Task Queue] Görev başlatılıyor: ${nextTask.taskId}. Kalan kuyruk: ${taskQueue.length}`);
  
  // Set task state status to running
  const state = tasks.get(nextTask.taskId);
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

// Keep-alive agents for connection reuse across segments
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, rejectUnauthorized: false });

// Helper to download a file to a buffer with default browser headers
function fetchContentLength(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error("Çok fazla yönlendirme (Redirect loop)"));
    }

    try {
      const parsedUrl = new URL(url);
      const isHttps = url.startsWith("https");
      const defaultHeaders = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer:
          headers.Referer ||
          headers.referer ||
          `${parsedUrl.protocol}//${parsedUrl.host}/`,
        Origin:
          headers.Origin ||
          headers.origin ||
          `${parsedUrl.protocol}//${parsedUrl.host}`,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        Connection: "keep-alive",
        ...headers,
      };

      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : httpAgent;
      const req = client.request(
        url,
        { method: "HEAD", headers: defaultHeaders, agent, timeout: 8000 },
        (res) => {
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume();
            const redirectUrl = new URL(res.headers.location, url).toString();
            return fetchContentLength(redirectUrl, headers, redirectCount + 1)
              .then(resolve)
              .catch(reject);
          }

          res.resume();
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP Status ${res.statusCode}`));
            return;
          }

          const length = Number.parseInt(res.headers["content-length"], 10);
          resolve(Number.isFinite(length) ? length : null);
        },
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Bağlantı zaman aşımı (8s)"));
      });
      req.on("error", (err) => reject(err));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function estimateSegmentsSize(segments, extraHeaders, firstSegmentSize) {
  const maxMeasuredSegments = Math.min(80, segments.length);
  const sampleIndices = Array.from(
    new Set(
      Array.from({ length: maxMeasuredSegments }, (_, i) => {
        if (maxMeasuredSegments === 1) return 0;
        return Math.round(
          (i * (segments.length - 1)) / (maxMeasuredSegments - 1),
        );
      }),
    ),
  ).sort((a, b) => a - b);

  const measuredSizes = [];
  if (sampleIndices.includes(0) && firstSegmentSize) {
    measuredSizes.push(firstSegmentSize);
  }

  let cursor = 0;
  const workerCount = Math.min(8, Math.max(1, sampleIndices.length));

  const worker = async () => {
    while (cursor < sampleIndices.length) {
      const index = sampleIndices[cursor++];
      if (index === 0 && firstSegmentSize) continue;
      try {
        const size = await fetchContentLength(segments[index], extraHeaders);
        if (size !== null) measuredSizes.push(size);
      } catch (_) {}
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));

  if (measuredSizes.length === segments.length) {
    return {
      bytes: measuredSizes.reduce((sum, size) => sum + size, 0),
      exact: true,
      measuredSegments: measuredSizes.length,
      method: "all-segments",
    };
  }

  const measuredAverage =
    measuredSizes.length > 0
      ? measuredSizes.reduce((sum, size) => sum + size, 0) /
        measuredSizes.length
      : firstSegmentSize || 0;

  return {
    bytes: Math.round(measuredAverage * segments.length),
    exact: false,
    measuredSegments: measuredSizes.length,
    method: "even-sample",
  };
}

function scheduleTaskCleanup(taskId, delayMs = 10 * 60 * 1000) {
  setTimeout(() => {
    tasks.delete(taskId);
  }, delayMs).unref?.();
}

function fetchBuffer(url, headers = {}, redirectCount = 0, timeout = 12000) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5)
      return reject(new Error("Çok fazla yönlendirme (Redirect loop)"));

    try {
      const parsedUrl = new URL(url);
      const isHttps = url.startsWith("https");
      const defaultHeaders = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer:
          headers.Referer ||
          headers.referer ||
          `${parsedUrl.protocol}//${parsedUrl.host}/`,
        Origin:
          headers.Origin ||
          headers.origin ||
          `${parsedUrl.protocol}//${parsedUrl.host}`,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        Connection: "keep-alive",
        ...headers,
      };

      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : httpAgent;
      const req = client.get(
        url,
        { headers: defaultHeaders, agent, timeout },
        (res) => {
          // Handle redirects
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume(); // drain to free socket
            const redirectUrl = new URL(res.headers.location, url).toString();
            return fetchBuffer(redirectUrl, headers, redirectCount + 1, timeout)
              .then(resolve)
              .catch(reject);
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            res.resume(); // drain to free socket
            reject(new Error(`HTTP Status ${res.statusCode}`));
            return;
          }

          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", (err) => reject(err));
        },
      );
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Bağlantı zaman aşımı (${Math.round(timeout / 1000)}s)`));
      });
      req.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

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

  if (type === "series") {
    try {
      const searchUrl = `https://www.diziyou.one/?s=${encodeURIComponent(q)}`;
      const buf = await fetchBuffer(searchUrl, {
        Referer: "https://www.diziyou.one/",
      }, 0, 4000);
      const html = buf.toString("utf-8");
      const films = [];
      const blocks = html.split('class="cat-img"').slice(1);
      for (const block of blocks) {
        const hrefM = block.match(/href="([^"]+)"/);
        const posterM =
          block.match(/<img\s+[^>]*src="([^"]+)"/) ||
          block.match(/<img\s+[^>]*data-src="([^"]+)"/);
        const titleM =
          block.match(/id="categorytitle"><a[^>]*>([^<]+)<\/a>/) ||
          block.match(/id="categorytitle">[^<]*<a[^>]*>([^<]+)<\/a>/);
        const ratingM = block.match(/id="imdbp">\s*\(([^)]+)\)/);

        if (hrefM && titleM) {
          const itemUrl = hrefM[1];
          // Sadece diziyou'nun dizi sayfalarını kabul et.
          // Filmlerde URL farklı bir kategoriye gider (ör. /film/... veya /category/film/...).
          const isSeriesUrl =
            itemUrl.includes("/dizi/") ||
            itemUrl.includes("/diziler/") ||
            (itemUrl.includes("diziyou.one") &&
              !itemUrl.includes("/film/") &&
              !itemUrl.includes("/category/film/") &&
              !itemUrl.includes("/kategori/film/") &&
              !itemUrl.includes("/?s="));

          if (!isSeriesUrl) continue;

          const genreM = block.match(/Tür\s*:\s*<\/span>\s*([^<]+)/i) || block.match(/Tür[^:]*:\s*<\/span>\s*([^<]+)/i);
          const genreText = genreM ? genreM[1].toLowerCase() : "";
          // Tür alanında "film" veya "sinema" geçiyorsa atla
          if (genreText.includes("film") || genreText.includes("sinema")) {
            continue;
          }

          films.push({
            url: itemUrl,
            title: titleM[1].trim(),
            poster: posterM ? posterM[1] : null,
            year: null,
            rating: ratingM ? ratingM[1] : null,
            type: "series",
          });
        }
      }
      res.json({ success: true, films });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  } else {
    try {
      const searchUrl = `https://www.fullhdfilmizle.mom/?s=${encodeURIComponent(q)}`;
      const buf = await fetchBuffer(searchUrl, {
        Referer: "https://www.fullhdfilmizle.mom/",
      }, 0, 4000);
      const html = buf.toString("utf-8");
      const films = [];
      const blocks = html.split('<div class="movie-box">').slice(1);
      for (const block of blocks) {
        const hrefM = block.match(
          /href="(https:\/\/www\.fullhdfilmizle\.mom\/[^"]+)"/,
        );
        const titleM = block.match(
          /<div class="film-ismi">\s*<a[^>]*>([^<]+)<\/a>/,
        );
        const posterM = block.match(/data-src="([^"]+)"/);
        const yearM = block.match(/<div class="film-yil">[^0-9]*(\d{4})/);
        const ratingM = block.match(/<div class="bolum-ust">[^0-9]*([0-9.]+)/);
        if (hrefM && titleM) {
          films.push({
            url: hrefM[1],
            title: titleM[1].trim(),
            poster: posterM ? posterM[1] : null,
            year: yearM ? yearM[1] : null,
            rating: ratingM ? ratingM[1] : null,
            type: "movie",
          });
        }
      }
      res.json({ success: true, films });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// 2) Extract player info from film page
app.get("/api/extract-player", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "URL gerekli." });
  try {
    const buf = await fetchBuffer(url, {
      Referer: "https://www.fullhdfilmizle.mom/",
    });
    const html = buf.toString("utf-8");
    const nonceM = html.match(/nonce:\s*['"]([a-f0-9]+)['"]/i);
    let postId = null;
    const postIdM =
      html.match(/data-part="(\d+)"/) ||
      html.match(/data-post-id="(\d+)"/i) ||
      html.match(/Change_Source\('(\d+)'/);
    if (postIdM) postId = postIdM[1];

    if (!nonceM || !postId) {
      return res
        .status(422)
        .json({ success: false, error: "Post ID veya nonce bulunamadi." });
    }

    // Extract languages/sources
    const languages = [];
    const langRe = /switchLanguage\('([^']+)'\)/g;
    let lm;
    const seenLangs = new Set();
    while ((lm = langRe.exec(html)) !== null) {
      const langKey = lm[1];
      if (!seenLangs.has(langKey)) {
        seenLangs.add(langKey);
        let label = "Türkçe Seçenek";
        if (langKey.includes("dublaj")) label = "Türkçe Dublaj";
        else if (langKey.includes("altyazi")) label = "Türkçe Altyazılı";
        else if (langKey.includes("orjinal")) label = "Orijinal Dil";
        languages.push({ key: langKey, label });
      }
    }

    if (languages.length === 0) {
      languages.push({ key: "", label: "Türkçe Dublaj" });
    }

    const sources = {};
    const playerRe = /Change_Source\('\d+','([^']+)','?([^')]*?)'?\s*(?:,|\))/g;
    let pm;
    while ((pm = playerRe.exec(html)) !== null) {
      const playerName = pm[1];
      let partKey = pm[2].trim();
      if (partKey === "this") partKey = "";

      if (!sources[partKey]) {
        sources[partKey] = [];
      }
      if (!sources[partKey].includes(playerName)) {
        sources[partKey].push(playerName);
      }
    }

    // Fallback: If no sources parsed for the keys, copy players
    languages.forEach(l => {
      if (!sources[l.key] || sources[l.key].length === 0) {
        // Find any players from the whole page as fallback
        const allPlayers = [];
        Object.values(sources).forEach(arr => {
          arr.forEach(p => { if (!allPlayers.includes(p)) allPlayers.push(p); });
        });
        sources[l.key] = allPlayers.length > 0 ? allPlayers : ["FastPlay"];
      }
    });

    res.json({
      success: true,
      postId: postId,
      nonce: nonceM[1],
      languages,
      sources,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: admin-ajax POST to get iframe URL for a given player name
async function fetchPlayerIframeUrl(
  postId,
  nonce,
  playerName,
  filmUrl,
  partKey = "",
) {
  const ajaxUrl = "https://www.fullhdfilmizle.mom/wp-admin/admin-ajax.php";
  const postData = `action=get_video_url&nonce=${nonce}&post_id=${postId}&player_name=${encodeURIComponent(playerName)}&part_key=${encodeURIComponent(partKey)}`;
  const parsedAjax = new URL(ajaxUrl);
  const ajaxBuf = await new Promise((resolve, reject) => {
    const options = {
      hostname: parsedAjax.hostname,
      path: parsedAjax.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Referer: filmUrl || "https://www.fullhdfilmizle.mom/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
      agent: httpsAgent,
    };
    const req2 = https.request(options, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req2.on("error", reject);
    req2.write(postData);
    req2.end();
  });
  const ajaxJson = JSON.parse(ajaxBuf.toString("utf-8"));
  if (!ajaxJson.success || !ajaxJson.data || !ajaxJson.data.url) return null;
  return ajaxJson.data.url;
}

// Helper: extract manifest URL from player page HTML
// Returns { manifestUrl, candidateUrls } — candidateUrls: tüm host alternatifleri
// Supports: direct m3u8/master.txt links, setplay.shop dynamic host+path, fastplay.mom jwplayer config
function extractManifestFromHtml(html, pageUrl = "") {
  // --- Pattern 1: Doğrudan tam URL ile master.txt veya m3u8 ---
  const directPatterns = [
    /["']?(https?:\/\/[^\s'"<>]+\/cdn\/hls\/[^\s'"<>]+master\.txt[^\s'"<>]*)["']?/i,
    /file:\s*["']?(https?:\/\/[^\s'"<>]+master\.txt[^\s'"<>]*)["']?/i,
    /file:\s*["']?(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)["']?/i,
    /["'](https?:\/\/[^'"]+\/manifests\/[^'"]+\/master\.txt)["']/i,
    /["'](https?:\/\/[^'"<\s]+\.m3u8(?:[^'"<\s]*)?)["']/i,
    /source:\s*["']?(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)["']?/i,
  ];
  for (const pat of directPatterns) {
    const found = html.match(pat);
    if (found && found[1])
      return { manifestUrl: found[1], candidateUrls: [found[1]] };
  }

  // --- Pattern 1b: FastPlay jwplayer sayfası — göreceli streamUrl değişkeni ---
  // const streamUrl = "/manifests/<id>/master.txt"; (http olmadan, sayfa host'una göre çözülür)
  try {
    const streamUrlM = html.match(/\bstreamUrl\s*=\s*["']([^"']+)["']/);
    if (streamUrlM) {
      const raw = streamUrlM[1].replace(/\\\//g, "/");
      if (raw.startsWith("http"))
        return { manifestUrl: raw, candidateUrls: [raw] };
      if (pageUrl) {
        const full = new URL(raw, pageUrl).toString();
        return { manifestUrl: full, candidateUrls: [full] };
      }
    }
  } catch (_) {}

  // --- Pattern 2: setplay.shop / FirePlayer yapısı ---
  // videoUrl: "/cdn/hls/<hash>/master.txt", videoServer: "7", hostList: {"7": ["s7.host.shop", ...]}
  try {
    const videoUrlM = html.match(/"videoUrl"\s*:\s*"([^"]+)"/);
    const videoServerM = html.match(/"videoServer"\s*:\s*"(\d+)"/);
    const hostListM = html.match(/"hostList"\s*:\s*(\{[\s\S]+?\})\s*,/);

    if (videoUrlM && videoServerM && hostListM) {
      const relativePath = videoUrlM[1].replace(/\\\//g, "/");
      const serverId = videoServerM[1];
      let hostList;
      try {
        hostList = JSON.parse(hostListM[1]);
      } catch (_) {}
      if (hostList) {
        const hosts = hostList[serverId] || [];
        // Tüm server ID'lerinden host listesi oluştur (fallback)
        const allHosts = Object.values(hostList).flat();
        const primaryHosts = [...new Set([...hosts, ...allHosts])];
        if (primaryHosts.length > 0) {
          const candidateUrls = primaryHosts.map(
            (h) =>
              `https://${h}${relativePath.startsWith("/") ? relativePath : "/" + relativePath}`,
          );
          return { manifestUrl: candidateUrls[0], candidateUrls };
        }
      }
    }

    // videoSources array içinde de ara
    const sourcesM = html.match(/"videoSources"\s*:\s*\[([^\]]+)\]/);
    if (sourcesM) {
      const fileM = sourcesM[1].match(/"file"\s*:\s*"([^"]+)"/);
      if (fileM) {
        const raw = fileM[1].replace(/\\\//g, "/");
        if (raw.startsWith("http"))
          return { manifestUrl: raw, candidateUrls: [raw] };
        if (pageUrl) {
          try {
            const full = new URL(raw, pageUrl).toString();
            return { manifestUrl: full, candidateUrls: [full] };
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  // --- Pattern 3: jwplayer setup içindeki file ---
  try {
    const jwM = html.match(/jwplayer\([^)]+\)\.setup\(\s*(\{[\s\S]+?\})\s*\)/);
    if (jwM) {
      const fileM = jwM[1].match(/"file"\s*:\s*"([^"]+)"/);
      if (fileM) {
        const url = fileM[1].replace(/\\\//g, "/");
        return { manifestUrl: url, candidateUrls: [url] };
      }
    }
  } catch (_) {}

  // --- Pattern 4: Genel relative path ile master.txt ---
  try {
    const relM = html.match(
      /"videoUrl"\s*:\s*"(\/cdn\/hls\/[^"]+master\.txt)"/,
    );
    if (relM && pageUrl) {
      const full = new URL(relM[1].replace(/\\\//g, "/"), pageUrl).toString();
      return { manifestUrl: full, candidateUrls: [full] };
    }
  } catch (_) {}

  return null;
}

// HTTP HEAD ile URL'nin erişilebilir olup olmadığını kontrol et
async function checkUrlReachable(url, referer = "") {
  try {
    const parsedUrl = new URL(url);
    const isHttps = url.startsWith("https");
    const client = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;
    return await new Promise((resolve) => {
      const req = client.request(
        url,
        {
          method: "HEAD",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Referer: referer || `${parsedUrl.protocol}//${parsedUrl.host}/`,
          },
          agent,
          timeout: 8000,
        },
        (res) => {
          res.resume();
          resolve(
            res.statusCode === 200 ||
              res.statusCode === 206 ||
              res.statusCode === 302,
          );
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  } catch (_) {
    return false;
  }
}

// 3) Extract stream URL: admin-ajax → iframe → manifest
// Tries multiple players in order until manifest is found
app.get("/api/extract-stream", async (req, res) => {
  const { postId, nonce, player, filmUrl, partKey } = req.query;
  if (!postId || !nonce)
    return res.status(400).json({ error: "postId ve nonce gerekli." });

  // Player order: requested player first, then common fallbacks
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
          // Eğer birden fazla host varsa çalışanı bul
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

        // nested iframe'i takip et
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

// Helper to parse media/segment playlist and return analysis JSON
// Helper: parse media/segment playlist and return analysis data (no res used).
// Returns { success, isPlaylist, totalSegments, segments, size, estimatedSize, firstBytesHex, rawBytesBase64, suggestion }
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

// ─────────────────────────────────────────────────────────────────────────────

// Unified Analyze Endpoint: Auto detects if the URL is a playlist or a direct segment
app.get("/api/analyze", async (req, res) => {
  const { url, referer, quality } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL parametresi gerekli." });
  }

  // Build extra headers from the referer query param (if provided)
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

// TS Detection and Auto-Analysis Helpers
function detectTsOffset(buffer) {
  for (
    let offset = 0;
    offset < Math.min(buffer.length - 188 * 3, 20000);
    offset++
  ) {
    if (buffer[offset] === 0x47) {
      let isTs = true;
      for (let j = 1; j <= 3; j++) {
        const nextSync = offset + j * 188;
        if (nextSync >= buffer.length || buffer[nextSync] !== 0x47) {
          isTs = false;
          break;
        }
      }
      if (isTs) {
        return offset;
      }
    }
  }
  return -1;
}

function detectXorKey(buffer) {
  for (let key = 0; key <= 255; key++) {
    let isMatch = true;
    const syncByte = 0x47 ^ key;
    for (let i = 0; i < 4; i++) {
      const pos = i * 188;
      if (pos >= buffer.length || buffer[pos] !== syncByte) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      return key;
    }
  }
  return -1;
}

// Decryption Helper Functions
function applyDecryption(buffer, method, options = {}) {
  if (method === "none") {
    return buffer;
  }
  if (method === "strip") {
    const stripBytes = parseInt(options.stripBytes || 0, 10);
    if (stripBytes >= buffer.length) return Buffer.alloc(0);
    return buffer.slice(stripBytes);
  }
  if (method === "xor") {
    let keyString = options.key || "0";
    let keyBytes = [];
    if (keyString.startsWith("0x")) {
      const hex = keyString.slice(2);
      keyBytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) || [
        parseInt(hex, 16),
      ];
    } else if (/^\d+$/.test(keyString)) {
      keyBytes = [parseInt(keyString, 10)];
    } else {
      keyBytes = Buffer.from(keyString, "utf-8");
    }

    if (keyBytes.length === 0) return buffer;

    const decrypted = Buffer.alloc(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      decrypted[i] = buffer[i] ^ keyBytes[i % keyBytes.length];
    }
    return decrypted;
  }
  if (method === "aes-128") {
    let keyString = options.key || "";
    let ivString = options.iv || "";

    let keyBuffer = Buffer.from(keyString, "hex");
    let ivBuffer = ivString ? Buffer.from(ivString, "hex") : Buffer.alloc(16); // Fallback to zeroes

    const decipher = crypto.createDecipheriv(
      "aes-128-cbc",
      keyBuffer,
      ivBuffer,
    );
    decipher.setAutoPadding(true);
    return Buffer.concat([decipher.update(buffer), decipher.final()]);
  }
  return buffer;
}

// Download coordinator
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

function cleanupTaskFiles(tempDir, tsOutputPath, outputPath, options) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
  try {
    if (fs.existsSync(tsOutputPath)) {
      fs.unlinkSync(tsOutputPath);
    }
  } catch (_) {}
  if (options.subtitles && Array.isArray(options.subtitles)) {
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

function ensurePlayableCacheDir() {
  const cacheDir = path.join(process.cwd(), "downloads", ".playable-cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function convertTsToPlayableMp4(inputTsPath, outputMp4Path) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-fflags", "+genpts",
        "-i", inputTsPath,
        "-c", "copy",
        "-movflags", "+faststart",
        outputMp4Path,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg çıkış kodu: ${code}`));
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg çalıştırılamadı: ${err.message}`));
    });
  });
}

function ensureThumbnailCacheDir() {
  const cacheDir = path.join(process.cwd(), "downloads", ".thumbnail-cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function generateVideoThumbnail(inputVideoPath, outputImagePath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-ss", "00:00:03",
        "-i", inputVideoPath,
        "-frames:v", "1",
        "-q:v", "4",
        "-vf", "scale=640:-1",
        outputImagePath,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `FFmpeg çıkış kodu: ${code}`));
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`FFmpeg çalıştırılamadı: ${err.message}`));
    });
  });
}

async function runTask(taskId, urls, outputPath, options) {
  const state = tasks.get(taskId);
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
  const tempDir = path.join(process.cwd(), "downloads", `temp_${taskId}`);
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (err) {
    state.logs.push(`Geçici klasör oluşturma hatası: ${err.message}`);
    state.status = "error";
    return;
  }

  // Ayna sunucu doğrulama testi (Ayna sunucular gerçekten aktif mi?)
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
      // Hızlı test isteği
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
      effectiveConcurrencyLimit = Math.min(concurrencyLimit, 4); // Tek sunucuya düşüldüğü için concurrency 4'e çekilir
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

      // Sunucu bot algılamasını engellemek için isteklerin stagger gecikmesi
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
          // Ayna sunucu 404 verdiğinde veya 2 denemeden fazla hata aldığında orijinal URL'e geri dön
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
          const segmentPath = path.join(tempDir, `segment_${item.idx}.ts`);
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

  // Open the write stream once to write all downloaded segments
  const writeStream = fs.createWriteStream(tsOutputPath);

  try {
    // Pipe all temp files in order to the writeStream
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

    // Close the write stream
    writeStream.end();

    // Wait for the write stream to finish flushing to disk
    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });
  } catch (err) {
    writeStream.destroy();
    state.logs.push(`Birleştirme sırasında hata oluştu: ${err.message}`);
    state.status = "error";
    // Cleanup temp dir
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
    return;
  }

  // Cleanup temporary directory
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

  // Bazı segmentler indirilemediyse, kullanıcıyı açıkça uyar.
  if (state.failed > 0) {
    state.logs.push(
      `⚠ ${state.failed} segment indirilemedi. Video eksik veya bozuk olabilir.`,
    );
  }

  // If mp4 output requested, convert with ffmpeg -c copy (no re-encode)
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
      // FFmpeg bulunamadı veya çökütü — indirme yine de başarılı,
      // sadece MP4'e paketlenemedi. Kullanıcıya TS dosyasını sun.
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

function convertToMp4(inputTs, outputMp4, state) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(
      "ffmpeg",
      ["-y", "-i", inputTs, "-c", "copy", "-movflags", "+faststart", outputMp4],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line.includes("time=") || line.includes("bitrate=")) {
        state.logs.push(`FFmpeg: ${line.split("\n").pop()}`);
      }
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg çıkış kodu: ${code}`));
    });
    ffmpeg.on("error", (err) =>
      reject(
        new Error(`FFmpeg bulunamadı: ${err.message}. Önce FFmpeg kurun.`),
      ),
    );
  });
}

// ─── DIZIYOU SERIES DETAILS & VIDEO EXTRACTION ENDPOINTS ───────────────────

// 1) Get season and episodes from series URL
app.get("/api/series-detail", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Dizi URL'si gerekli." });
  try {
    const buf = await fetchBuffer(url, {
      Referer: "https://www.diziyou.one/",
    });
    const html = buf.toString("utf-8");

    // Find all episodes
    // Structure: <a href="https://www.diziyou.one/breaking-bad-1-sezon-1-bolum/"><div class="bolumust">...
    const episodeRe =
      /<a\s+href="(https:\/\/www\.diziyou\.one\/([^"]+?)-([0-9]+)-sezon-([0-9]+)-bolum\/)"[^>]*>\s*<div class="bolumust">[\s\S]*?<div class="baslik">\s*([0-9]+)\.\s*Sezon\s*([0-9]+)\.\s*Bölüm\s*(?:<div[^>]*class="bolumismi"[^>]*>\s*([^<]*?)\s*<\/div>)?/gi;

    const seasonsMap = new Map();
    let m;
    while ((m = episodeRe.exec(html)) !== null) {
      const fullUrl = m[1];
      const slug = m[2];
      const seasonNum = parseInt(m[3], 10);
      const episodeNum = parseInt(m[4], 10);
      const episodeName = m[7] ? m[7].trim() : "";

      if (!seasonsMap.has(seasonNum)) {
        seasonsMap.set(seasonNum, []);
      }

      seasonsMap.get(seasonNum).push({
        url: fullUrl,
        season: seasonNum,
        episode: episodeNum,
        name: episodeName || `${episodeNum}. Bölüm`,
        title: `${seasonNum}. Sezon ${episodeNum}. Bölüm ${episodeName ? `(${episodeName})` : ""}`,
      });
    }

    // Sort seasons and episodes
    const seasons = [];
    const sortedSeasonKeys = Array.from(seasonsMap.keys()).sort(
      (a, b) => a - b,
    );
    for (const sKey of sortedSeasonKeys) {
      const eps = seasonsMap.get(sKey).sort((a, b) => a.episode - b.episode);
      seasons.push({
        season: sKey,
        episodes: eps,
      });
    }

    res.json({ success: true, seasons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const diziyouVariantDefinitions = [
  { id: "turkceAltyazili", name: "Türkçe Altyazılı", suffix: "" },
  { id: "turkceDublaj", name: "Türkçe Dublaj", suffix: "_tr" },
  { id: "ingilizceAltyazili", name: "İngilizce Altyazılı", suffix: "_enSub" },
];

function getDiziyouVariantsFromHtml(html) {
  const availableVariants = diziyouVariantDefinitions.filter((variant) =>
    new RegExp(`id=["']${variant.id}["']`, "i").test(html),
  );

  return availableVariants.length > 0
    ? availableVariants
    : diziyouVariantDefinitions;
}

function buildDiziyouVariantUrl(playerUrl, suffix) {
  const parsed = new URL(playerUrl.replace(/&amp;/g, "&"));
  parsed.pathname = parsed.pathname.replace(
    /(?:_tr|_enSub)?\.html$/i,
    `${suffix}.html`,
  );
  parsed.search = "";
  return parsed.toString();
}

function getHtmlAttr(tag, attrName) {
  const match = tag.match(new RegExp(`${attrName}=["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

// 2) Extract m3u8 stream and subtitle links from episode URL
app.get("/api/extract-series-video", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Bölüm URL'si gerekli." });

  const logFile = path.join(process.cwd(), "server_debug.log");
  const log = (msg) => {
    const time = new Date().toISOString();
    fs.appendFileSync(logFile, `[${time}] ${msg}\n`);
    console.log(msg);
  };

  log(`Extracting: ${url}`);
  try {
    const buf = await fetchBuffer(url, {
      Referer: "https://www.diziyou.one/",
    });
    const html = buf.toString("utf-8");

    // Find diziyouPlayer iframe
    const iframeM =
      html.match(/<iframe[^>]*id="diziyouPlayer"[^>]*src="([^"]+)"/) ||
      html.match(/id="diziyouPlayer"\s+src="([^"]+)"/);
    if (!iframeM) {
      log(
        `Error: diziyouPlayer iframe not found in HTML. HTML length: ${html.length}`,
      );
      return res
        .status(422)
        .json({ success: false, error: "Oynatıcı iframe'i bulunamadı." });
    }

    const playerUrlStr = iframeM[1];
    log(`Found player URL: ${playerUrlStr}`);
    const streams = [];
    const variants = getDiziyouVariantsFromHtml(html);
    log(
      `Available variants on page: ${variants.map((v) => v.name).join(", ")}`,
    );

    for (const variant of variants) {
      const variantUrl = buildDiziyouVariantUrl(playerUrlStr, variant.suffix);

      try {
        log(`Fetching variant: ${variant.name} -> ${variantUrl}`);
        const pBuf = await fetchBuffer(variantUrl, {
          Referer: url,
        });
        const pHtml = pBuf.toString("utf-8");
        const m3u8M =
          pHtml.match(/<source\b[^>]*\bsrc=["']([^"']*\.m3u8[^"']*)["']/i) ||
          pHtml.match(/id=["']diziyouSource["'][^>]*\bsrc=["']([^"']+)["']/i) ||
          pHtml.match(/file:\s*["']([^"']*\.m3u8[^"']*)["']/i);

        // Find subtitles
        const subtitles = [];
        const subtitleRe = /<track\b[^>]*>/gi;
        let subM;
        while ((subM = subtitleRe.exec(pHtml)) !== null) {
          const trackTag = subM[0];
          const src = getHtmlAttr(trackTag, "src");
          if (!src || !src.includes(".vtt")) continue;
          subtitles.push({
            src: new URL(src, variantUrl).toString(),
            lang: getHtmlAttr(trackTag, "srclang"),
            label: getHtmlAttr(trackTag, "label"),
          });
        }
        log(`Found ${subtitles.length} subtitles for ${variant.name}`);

        if (m3u8M) {
          const rawM3u8Url = new URL(m3u8M[1], variantUrl).toString();
          log(`Found m3u8 for ${variant.name}: ${rawM3u8Url}`);
          const qualities = [];

          try {
            // Fetch the main m3u8 to extract resolution list
            const m3u8Buf = await fetchBuffer(rawM3u8Url, {
              Referer: variantUrl,
            });
            const m3u8Content = m3u8Buf.toString("utf-8").trim();

            if (m3u8Content.includes("#EXT-X-STREAM-INF")) {
              const mLines = m3u8Content.split("\n");
              const mBaseUrl = new URL(rawM3u8Url);

              for (let i = 0; i < mLines.length; i++) {
                const line = mLines[i].trim();
                if (line.startsWith("#EXT-X-STREAM-INF")) {
                  // Extract resolution (e.g. 1920x1080 -> 1080p)
                  const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                  let resName = "Bilinmeyen";
                  if (resMatch) {
                    resName = `${resMatch[2]}p`; // e.g. "1080p"
                  } else {
                    const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
                    if (bwMatch) {
                      resName = `${Math.round(parseInt(bwMatch[1], 10) / 1000)}kbps`;
                    }
                  }

                  // Next non-empty line is url
                  let qUrl = null;
                  for (let j = i + 1; j < mLines.length; j++) {
                    const nextLine = mLines[j].trim();
                    if (nextLine && !nextLine.startsWith("#")) {
                      qUrl = new URL(nextLine, mBaseUrl).toString();
                      break;
                    }
                  }

                  if (qUrl) {
                    let targetUrl = qUrl;
                    if (resName !== "Bilinmeyen" && !qUrl.includes(`/${resName}.m3u8`)) {
                      const testUrl = qUrl.replace(/\/\d+p\.m3u8/i, `/${resName}.m3u8`);
                      try {
                        const checkRes = await fetch(testUrl, { method: "HEAD", headers: { Referer: variantUrl } });
                        if (checkRes.status === 200) {
                          targetUrl = testUrl;
                        }
                      } catch (_) {}
                    }
                    qualities.push({
                      resolution: resName,
                      m3u8Url: targetUrl,
                    });
                  }
                }
              }
            }
          } catch (m3u8Err) {
            console.log(
              `Çözünürlük listesi çekilemedi, varsayılan kullanılacak: ${m3u8Err.message}`,
            );
          }

          // Fallback to rawUrl if no qualities extracted
          if (qualities.length === 0) {
            qualities.push({
              resolution: "En Yüksek (Oto)",
              m3u8Url: rawM3u8Url,
            });
          }

          streams.push({
            name: variant.name,
            qualities,
            subtitles: subtitles,
          });
        } else {
          log(`No m3u8 found for ${variant.name}`);
        }
      } catch (e) {
        log(`Failed to fetch/parse variant ${variant.name}: ${e.message}`);
      }
    }

    log(`Extraction complete. Total streams found: ${streams.length}`);
    if (streams.length === 0) {
      log(`Error: No streams found at all!`);
      return res.status(422).json({
        success: false,
        error: "Oynatıcıda geçerli yayın kaynağı bulunamadı.",
      });
    }

    res.json({ success: true, streams });
  } catch (err) {
    log(`Fatal extraction error: ${err.message}`);
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

// 1) List downloaded files (.mp4 and .ts)
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
        // exclude temp directories or active chunk files
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

    // Sort by creation date descending
    videoFiles.sort((a, b) => b.createdAt - a.createdAt);

    res.json({ success: true, files: videoFiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2) Stream TS files on-the-fly converting to MP4 format using FFmpeg
app.get("/api/stream-ts", (req, res) => {
  const { file } = req.query;
  if (!file) {
    return res.status(400).send("Dosya belirtilmedi.");
  }

  const downloadsDir = path.join(process.cwd(), "downloads");
  const filePath = path.join(downloadsDir, file);

  // Safety check to prevent directory traversal
  const relative = path.relative(downloadsDir, filePath);
  const isSafe = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  if (!isSafe || !fs.existsSync(filePath)) {
    return res.status(404).send("Dosya bulunamadı veya geçersiz yol.");
  }

  // Set HTTP headers for MP4 streaming
  res.writeHead(200, {
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Transfer-Encoding": "chunked"
  });

  // Spawn ffmpeg to copy ts container into mp4 dynamically
  // -movflags frag_keyframe+empty_moov ensures fragmenting so it can stream without writing full headers at start
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

  // Log ffmpeg errors
  ffmpeg.stderr.on("data", (data) => {
    // console.log(`[FFmpeg Stream] ${data.toString()}`);
  });

  // İstemci bağlantısı erken kapanırsa ffmpeg'i sonlandır.
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

// Serve downloaded files
app.use("/downloads", express.static(path.join(process.cwd(), "downloads")));
app.use("/playable-cache", express.static(path.join(process.cwd(), "downloads", ".playable-cache")));

// Export app and a start function for Electron
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

// If run directly via node, start server immediately
const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  startServer(PORT).catch((err) => {
    console.error("Server start error:", err);
  });
}
