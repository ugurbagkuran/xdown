import fs from "fs";
import path from "path";
import { fetchBuffer } from "../utils/fetcher.js";

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

// Searches series on diziyou.one
export async function searchSeries(q) {
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
  return films;
}

// Scrapes season and episodes from series page HTML
export async function getSeriesDetail(url) {
  const buf = await fetchBuffer(url, {
    Referer: "https://www.diziyou.one/",
  });
  const html = buf.toString("utf-8");

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

    const hasParentheses = episodeName.startsWith("(") && episodeName.endsWith(")");
    const displayTitle = episodeName ? (hasParentheses ? ` ${episodeName}` : ` (${episodeName})`) : "";

    if (!seasonsMap.has(seasonNum)) {
      seasonsMap.set(seasonNum, []);
    }

    seasonsMap.get(seasonNum).push({
      url: fullUrl,
      season: seasonNum,
      episode: episodeNum,
      name: episodeName || `${episodeNum}. Bölüm`,
      title: `${seasonNum}. Sezon ${episodeNum}. Bölüm${displayTitle}`,
    });
  }

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

  return seasons;
}

// Extracts stream source URLs (m3u8) and subtitles from episode player
export async function extractSeriesVideo(url, logger) {
  const logFile = path.join(process.cwd(), "server_debug.log");
  const log = (msg) => {
    const time = new Date().toISOString();
    fs.appendFileSync(logFile, `[${time}] ${msg}\n`);
    if (logger) logger(msg);
    else console.log(msg);
  };

  log(`Extracting: ${url}`);
  const buf = await fetchBuffer(url, {
    Referer: "https://www.diziyou.one/",
  });
  const html = buf.toString("utf-8");

  const iframeM =
    html.match(/<iframe[^>]*id="diziyouPlayer"[^>]*src="([^"]+)"/) ||
    html.match(/id="diziyouPlayer"\s+src="([^"]+)"/);
  if (!iframeM) {
    log(`Error: diziyouPlayer iframe not found in HTML. HTML length: ${html.length}`);
    throw new Error("Oynatıcı iframe'i bulunamadı.");
  }

  const playerUrlStr = iframeM[1];
  log(`Found player URL: ${playerUrlStr}`);
  const streams = [];
  const variants = getDiziyouVariantsFromHtml(html);
  log(`Available variants on page: ${variants.map((v) => v.name).join(", ")}`);

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
                const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
                let resName = "Bilinmeyen";
                if (resMatch) {
                  resName = `${resMatch[2]}p`;
                } else {
                  const bwMatch = line.match(/BANDWIDTH=(\d+)/i);
                  if (bwMatch) {
                    resName = `${Math.round(parseInt(bwMatch[1], 10) / 1000)}kbps`;
                  }
                }

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
          console.log(`Çözünürlük listesi çekilemedi, varsayılan kullanılacak: ${m3u8Err.message}`);
        }

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
    throw new Error("Oynatıcıda geçerli yayın kaynağı bulunamadı.");
  }

  return streams;
}
