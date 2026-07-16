import https from "https";
import { fetchBuffer, checkUrlReachable, httpsAgent } from "../utils/fetcher.js";

// Helper: admin-ajax POST to get iframe URL for a given player name
export async function fetchPlayerIframeUrl(
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
    const req = https.request(options, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
  
  const ajaxJson = JSON.parse(ajaxBuf.toString("utf-8"));
  if (!ajaxJson.success || !ajaxJson.data || !ajaxJson.data.url) return null;
  return ajaxJson.data.url;
}

// Helper: extract manifest URL from player page HTML
export function extractManifestFromHtml(html, pageUrl = "") {
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

// Searches movie details on fullhdfilmizle.mom
export async function searchMovies(q) {
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
  return films;
}

// Extracts player configuration data (postId, nonce, languages, sources)
export async function extractMoviePlayer(url) {
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
    throw new Error("Post ID veya nonce bulunamadı.");
  }

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

  // Fallback: copy players if no sources parsed for keys
  languages.forEach(l => {
    if (!sources[l.key] || sources[l.key].length === 0) {
      const allPlayers = [];
      Object.values(sources).forEach(arr => {
        arr.forEach(p => { if (!allPlayers.includes(p)) allPlayers.push(p); });
      });
      sources[l.key] = allPlayers.length > 0 ? allPlayers : ["FastPlay"];
    }
  });

  return {
    postId,
    nonce: nonceM[1],
    languages,
    sources,
  };
}
