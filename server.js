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

// Global tasks map
const tasks = new Map();

// Keep-alive agents for connection reuse across segments
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

// Helper to download a file to a buffer with default browser headers
function fetchBuffer(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5)
      return reject(new Error("Çok fazla yönlendirme (Redirect loop)"));

    try {
      const parsedUrl = new URL(url);
      const isHttps = url.startsWith("https");
      const defaultHeaders = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: headers.Referer || headers.referer || `${parsedUrl.protocol}//${parsedUrl.host}/`,
        Origin: headers.Origin || headers.origin || `${parsedUrl.protocol}//${parsedUrl.host}`,
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
        { headers: defaultHeaders, agent, timeout: 12000 },
        (res) => {
          // Handle redirects
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.resume(); // drain to free socket
            const redirectUrl = new URL(res.headers.location, url).toString();
            return fetchBuffer(redirectUrl, headers, redirectCount + 1)
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
        reject(new Error("Bağlantı zaman aşımı (12s)"));
      });
      req.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// ─── SEARCH & AUTO-EXTRACT ENDPOINTS ─────────────────────────────────────────

// 1) Search: fullhdfilmizle.mom/?s=query
app.get("/api/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Arama terimi gerekli." });
  try {
    const searchUrl = `https://www.fullhdfilmizle.mom/?s=${encodeURIComponent(q)}`;
    const buf = await fetchBuffer(searchUrl, {
      Referer: "https://www.fullhdfilmizle.mom/",
    });
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
        });
      }
    }
    res.json({ success: true, films });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

    // Change_Source('<postId>','<playerName>','<partKey>', this) — partKey belirtir
    // hangi ses/altyazı bölümüne (Türkçe Dublaj / Türkçe Altyazılı vb.) ait olduğunu.
    // Site birden fazla "part" barındırabildiği için, boş part_key ile admin-ajax çoğu
    // zaman "Video not found" döner. Varsayılan (ilk/gösterilen) part'ın key'ini kullanırız.
    const players = [];
    let defaultPartKey = "";
    let sawFirstPart = false;
    const playerRe = /onclick="Change_Source\('\d+','([^']+)','([^']*)'/g;
    let m;
    while ((m = playerRe.exec(html)) !== null) {
      const [, playerName, partKey] = m;
      if (!sawFirstPart) {
        defaultPartKey = partKey;
        sawFirstPart = true;
      }
      if (partKey === defaultPartKey && !players.includes(playerName))
        players.push(playerName);
    }
    if (!nonceM || !postId) {
      return res
        .status(422)
        .json({ success: false, error: "Post ID veya nonce bulunamadi." });
    }
    res.json({
      success: true,
      postId: postId,
      nonce: nonceM[1],
      players,
      partKey: defaultPartKey,
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
      candidateUrls: (extractedResult && extractedResult.candidateUrls) ? extractedResult.candidateUrls : [manifestUrl],
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

// Unified Analyze Endpoint: Auto detects if the URL is a playlist or a direct segment
app.get("/api/analyze", async (req, res) => {
  const { url, referer } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL parametresi gerekli." });
  }

  // Build extra headers from the referer query param (if provided)
  const extraHeaders = referer ? { Referer: referer } : {};

  try {
    const buffer = await fetchBuffer(url, extraHeaders);
    const contentStr = buffer.toString("utf-8").trim();

    if (contentStr.startsWith("#EXTM3U")) {
      // It's a playlist!
      const lines = contentStr.split("\n");
      const segments = [];
      const baseUrl = new URL(url);

      for (let line of lines) {
        line = line.trim();
        if (line && !line.startsWith("#")) {
          const resolvedUrl = new URL(line, baseUrl).toString();
          segments.push(resolvedUrl);
        }
      }

      if (segments.length === 0) {
        return res.json({
          success: true,
          isPlaylist: true,
          totalSegments: 0,
          segments: [],
          error: "M3U8 çalma listesinde segment bulunamadı.",
        });
      }

      // Analyze the first segment of the playlist
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

      res.json({
        success: true,
        isPlaylist: true,
        totalSegments: segments.length,
        segments,
        size: segBuffer.length,
        firstBytesHex,
        rawBytesBase64: segBuffer.slice(0, 512).toString("base64"),
        suggestion,
      });
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
    status: "running",
    logs: [`Görev başlatıldı. Toplam segment: ${urls.length}`],
    outputPath: finalOutputPath,
    outputName: taskOutputName,
  };

  tasks.set(taskId, taskState);
  res.json({ success: true, taskId });

  // Run the download process asynchronously
  runTask(taskId, urls, finalOutputPath, {
    method,
    key,
    iv,
    stripBytes,
    concurrency,
    referer,
    candidateHosts,
  });
});

async function runTask(taskId, urls, outputPath, options) {
  const state = tasks.get(taskId);
  const concurrencyLimit = parseInt(options.concurrency || 5, 10);
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

  if (options.candidateHosts && options.candidateHosts.length > 0 && urls.length > 0) {
    state.logs.push("Ayna sunucular test ediliyor...");
    const testHost = options.candidateHosts[0];
    try {
      const parsed = new URL(urls[0]);
      parsed.host = testHost;
      const testUrl = parsed.toString();
      // Hızlı test isteği
      await fetchBuffer(testUrl, extraHeaders);
      state.logs.push("Ayna sunucular aktif, hızlı dağıtık indirme modu devrede.");
      activeCandidateHosts = options.candidateHosts;
    } catch (_) {
      state.logs.push("Ayna sunucular bu video için pasif. Orijinal sunucudan indiriliyor...");
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
          const targetHost = activeCandidateHosts[item.idx % activeCandidateHosts.length];
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
          const currentUrl = (usingAlternative && (attempt > 2 || lastErrorStatus === 404)) ? item.url : segmentUrl;
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
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
    state.logs.push("Görev iptal edildi.");
    return;
  }

  state.logs.push("Segment indirmeleri tamamlandı. Dosyalar birleştiriliyor...");

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
    try {
      fs.unlinkSync(tsOutputPath);
    } catch (_) {}
    state.logs.push("Görev birleştirme esnasında iptal edildi.");
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
    } catch (err) {
      // FFmpeg bulunamadı veya çökütü — indirme yine de başarılı,
      // sadece MP4'e paketlenemedi. Kullanıcıya TS dosyasını sun.
      const tsBaseName = path.basename(tsOutputPath);
      state.status = "completed";
      state.outputName = tsBaseName;
      state.logs.push(
        `MP4 dönüşüm hatası: ${err.message} - TS dosyası korundu: downloads/${tsBaseName}`,
      );
    }
  } else {
    state.status = "completed";
    state.logs.push(
      `İşlem başarıyla tamamlandı. Video kaydedildi: downloads/${path.basename(outputPath)}`,
    );
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
  res.json({ success: true });
});

// Serve downloaded files
app.use("/downloads", express.static(path.join(process.cwd(), "downloads")));

// Export app and a start function for Electron
export { app };
export function startServer(port = 3000) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
      resolve(server);
    }).on("error", (err) => {
      reject(err);
    });
  });
}

// If run directly via node, start server immediately
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  startServer(PORT).catch((err) => {
    console.error("Server start error:", err);
  });
}
