/**
 * Manifest extraction test - server.js'teki extractManifestFromHtml ile aynı logic'i test eder
 */
import https from 'https';
import http from 'http';

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

function fetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const isHttps = url.startsWith('https');
      const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        ...headers
      };
      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : new http.Agent();
      const req = client.get(url, { headers: defaultHeaders, agent, timeout: 30000 }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume();
          const redirectUrl = new URL(res.headers.location, url).toString();
          return fetchBuffer(redirectUrl, headers).then(resolve).catch(reject);
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
    } catch (e) { reject(e); }
  });
}

// server.js ile aynı fonksiyon
function extractManifestFromHtml(html, pageUrl = '') {
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
    if (found && found[1]) {
      console.log(`  [Pattern1] Eşleşme: ${found[1].slice(0,100)}`);
      return found[1];
    }
  }

  // --- Pattern 2: setplay.shop / FirePlayer yapısı ---
  try {
    const videoUrlM = html.match(/"videoUrl"\s*:\s*"([^"]+)"/);
    const videoServerM = html.match(/"videoServer"\s*:\s*"(\d+)"/);
    const hostListM = html.match(/"hostList"\s*:\s*(\{[^}]+(?:\{[^}]*\}[^}]*)?\})/);

    console.log(`  [Pattern2] videoUrl: ${videoUrlM?.[1]}, videoServer: ${videoServerM?.[1]}, hostList: ${hostListM?.[1]?.slice(0,80)}`);

    if (videoUrlM && videoServerM && hostListM) {
      const relativePath = videoUrlM[1].replace(/\\\//g, '/');
      const serverId = videoServerM[1];
      const hostList = JSON.parse(hostListM[1]);
      const hosts = hostList[serverId];
      if (hosts && hosts.length > 0) {
        const host = hosts[0];
        const fullUrl = `https://${host}${relativePath.startsWith('/') ? relativePath : '/' + relativePath}`;
        console.log(`  [Pattern2] MANIFEST BULUNDU: ${fullUrl}`);
        return fullUrl;
      }
    }

    // videoSources array içinde de ara
    const sourcesM = html.match(/"videoSources"\s*:\s*\[([^\]]+)\]/);
    if (sourcesM) {
      const fileM = sourcesM[1].match(/"file"\s*:\s*"([^"]+)"/);
      if (fileM) {
        const raw = fileM[1].replace(/\\\//g, '/');
        console.log(`  [Pattern2/sources] file: ${raw}`);
        if (raw.startsWith('http')) return raw;
        if (pageUrl) {
          try { return new URL(raw, pageUrl).toString(); } catch(_) {}
        }
      }
    }
  } catch (e) { console.log(`  [Pattern2] Hata: ${e.message}`); }

  // --- Pattern 3: jwplayer setup içindeki file ---
  try {
    const jwM = html.match(/jwplayer\([^)]+\)\.setup\(\s*(\{[\s\S]+?\})\s*\)/);
    if (jwM) {
      const fileM = jwM[1].match(/"file"\s*:\s*"([^"]+)"/);
      if (fileM) {
        console.log(`  [Pattern3] jwplayer file: ${fileM[1]}`);
        return fileM[1].replace(/\\\//g, '/');
      }
    }
  } catch (_) {}

  return null;
}

async function main() {
  console.log('=== SETPLAY.SHOP MANIFEST EXTRACTION TEST ===\n');
  
  const setplayUrl = 'https://setplay.shop/player/index.php?data=97f8f258315884fb4aa57d182d425163';
  console.log(`Fetching: ${setplayUrl}`);
  
  const buf = await fetchBuffer(setplayUrl, { 'Referer': 'https://www.fullhdfilmizle.mom/' });
  const html = buf.toString('utf-8');
  console.log(`HTML length: ${html.length}\n`);
  
  const result = extractManifestFromHtml(html, setplayUrl);
  console.log(`\n=== SONUÇ: ${result || 'BULUNAMADI'} ===`);
  
  if (result) {
    console.log('\n✅ Manifest URL başarıyla çıkarıldı!');
    // master.txt'i çekmeyi dene
    console.log(`\nmaster.txt çekiliyor: ${result}`);
    try {
      const mBuf = await fetchBuffer(result, { 'Referer': 'https://setplay.shop/' });
      const mText = mBuf.toString('utf-8');
      console.log(`master.txt içeriği (ilk 500):\n${mText.slice(0, 500)}`);
    } catch(e) {
      console.log(`master.txt fetch hatası: ${e.message}`);
    }
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
