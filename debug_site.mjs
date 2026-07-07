/**
 * Debug script - Sitenin gerçekte nasıl çalıştığını inceler
 * 1. "ob" araması yapar, ilk filmi alır
 * 2. Film sayfasından postId, nonce, player listesini çeker
 * 3. Her oynatıcı için admin-ajax çağrısı yapar ve cevabı gösterir
 * 4. iframe sayfasını çeker ve ham HTML'i gösterir
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
        console.log(`  → HTTP ${res.statusCode} | Content-Type: ${res.headers['content-type']}`);
        // Follow redirects
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume();
          const redirectUrl = new URL(res.headers.location, url).toString();
          console.log(`  ↪ Redirect to: ${redirectUrl}`);
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

async function postAjax(postId, nonce, playerName, filmUrl) {
  const ajaxUrl = 'https://www.fullhdfilmizle.mom/wp-admin/admin-ajax.php';
  const postData = `action=get_video_url&nonce=${nonce}&post_id=${postId}&player_name=${encodeURIComponent(playerName)}&part_key=`;
  const parsedAjax = new URL(ajaxUrl);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsedAjax.hostname,
      path: parsedAjax.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Referer': filmUrl || 'https://www.fullhdfilmizle.mom/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.fullhdfilmizle.mom',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      agent: httpsAgent,
    };
    const req2 = https.request(options, (resp) => {
      console.log(`  → AJAX HTTP ${resp.statusCode}`);
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req2.on('error', reject);
    req2.write(postData);
    req2.end();
  });
}

async function main() {
  // --- ADIM 1: Arama ---
  console.log('\n========= ADIM 1: "ob" araması =========');
  const searchUrl = 'https://www.fullhdfilmizle.mom/?s=ob';
  console.log('GET', searchUrl);
  const searchBuf = await fetchBuffer(searchUrl, { 'Referer': 'https://www.fullhdfilmizle.mom/' });
  const searchHtml = searchBuf.toString('utf-8');
  
  // film-box'ları bul
  const blocks = searchHtml.split('<div class="movie-box">').slice(1);
  console.log(`  → ${blocks.length} film bulundu`);
  
  if (blocks.length === 0) {
    console.log('\n!!! Film bulunamadı, sayfa yapısını kontrol edin !!!');
    // Sayfanın başını göster
    console.log('\nSayfa başı (2000 karakter):');
    console.log(searchHtml.slice(0, 2000));
    return;
  }
  
  const firstBlock = blocks[0];
  const hrefM = firstBlock.match(/href="(https:\/\/www\.fullhdfilmizle\.mom\/[^"]+)"/);
  const titleM = firstBlock.match(/<div class="film-ismi">\s*<a[^>]*>([^<]+)<\/a>/);
  
  if (!hrefM) {
    console.log('Film URL bulunamadı. İlk blok:');
    console.log(firstBlock.slice(0, 500));
    return;
  }
  
  const filmUrl = hrefM[1];
  const filmTitle = titleM ? titleM[1].trim() : '?';
  console.log(`  → Film: "${filmTitle}" | URL: ${filmUrl}`);

  // --- ADIM 2: Film sayfası ---
  console.log('\n========= ADIM 2: Film sayfası =========');
  console.log('GET', filmUrl);
  const filmBuf = await fetchBuffer(filmUrl, { 'Referer': 'https://www.fullhdfilmizle.mom/' });
  const filmHtml = filmBuf.toString('utf-8');
  
  const nonceM = filmHtml.match(/nonce:\s*'([a-f0-9]+)'/);
  const postIdM = filmHtml.match(/data-part="(\d+)"/);
  
  console.log(`  → nonce: ${nonceM ? nonceM[1] : 'BULUNAMADI'}`);
  console.log(`  → postId: ${postIdM ? postIdM[1] : 'BULUNAMADI'}`);
  
  // Tüm player isimlerini çek
  const players = [];
  const playerRe = /onclick="Change_Source\('(\d+)','([^']+)'/g;
  let pm;
  while ((pm = playerRe.exec(filmHtml)) !== null) {
    players.push({ id: pm[1], name: pm[2] });
  }
  console.log(`  → Bulunan oynatıcılar: ${players.length > 0 ? JSON.stringify(players) : 'HİÇ BULUNAMADI'}`);
  
  // Alternatif player regex dene
  if (players.length === 0) {
    console.log('\n  Alternatif player regex deneniyor...');
    const alt1 = filmHtml.match(/player[_-]?name['":\s]+['"]([^'"]+)['"]/gi);
    const alt2 = filmHtml.match(/Change_Source[^)]+/g);
    const alt3 = filmHtml.match(/data-player[^=]*=['"]([^'"]+)['"]/gi);
    console.log('  alt1:', alt1);
    console.log('  alt2:', alt2);
    console.log('  alt3:', alt3);
    
    // player butonlarının olduğu bölgeyi göster
    const playerSection = filmHtml.match(/player[\s\S]{0,3000}Change_Source/i);
    if (playerSection) {
      console.log('\n  Player bölgesi:');
      console.log(playerSection[0].slice(0, 1500));
    } else {
      // Film sayfasından 5000 karakter göster
      console.log('\n  Film HTML (5000 karakter):');
      console.log(filmHtml.slice(0, 5000));
    }
  }
  
  if (!nonceM || !postIdM) {
    console.log('\n!!! nonce veya postId bulunamadı !!!');
    // Alternatif nonce regex'leri dene
    const n2 = filmHtml.match(/["']nonce["']:\s*["']([a-f0-9]+)["']/i);
    const n3 = filmHtml.match(/nonce['":\s]+=\s*['"]([a-f0-9]+)['"]/i);
    const n4 = filmHtml.match(/wp_nonce[=:\s'"]+([a-f0-9]+)/i);
    console.log('  nonce alt1:', n2?.[1]);
    console.log('  nonce alt2:', n3?.[1]);
    console.log('  nonce alt3:', n4?.[1]);
    
    const p2 = filmHtml.match(/post[_-]?id['":\s]+=?\s*['"]?(\d+)['"]?/i);
    const p3 = filmHtml.match(/data-id="(\d+)"/);
    const p4 = filmHtml.match(/"postid":(\d+)/i);
    console.log('  postId alt1:', p2?.[1]);
    console.log('  postId alt2:', p3?.[1]);
    console.log('  postId alt3:', p4?.[1]);
    
    if (!nonceM && !postIdM) {
      console.log('\n  Film HTML (8000 karakter):');
      console.log(filmHtml.slice(0, 8000));
      return;
    }
  }
  
  const nonce = nonceM?.[1];
  const postId = postIdM?.[1];
  
  if (!nonce || !postId) {
    console.log('Nonce veya postId eksik, çıkılıyor.');
    return;
  }
  
  // --- ADIM 3: Her oynatıcı için AJAX çağrısı ---
  const testPlayers = players.length > 0 
    ? players.map(p => p.name)
    : ['FastPlay', 'Türkçe', 'HD', 'TR', 'EN', '1'];
  
  console.log('\n========= ADIM 3: AJAX çağrıları =========');
  for (const pName of testPlayers) {
    console.log(`\n--- Oynatıcı: "${pName}" ---`);
    try {
      const ajaxBuf = await postAjax(postId, nonce, pName, filmUrl);
      const raw = ajaxBuf.toString('utf-8');
      console.log(`  Ham cevap: ${raw.slice(0, 300)}`);
      
      let ajaxJson;
      try { ajaxJson = JSON.parse(raw); } catch(e) { 
        console.log('  JSON parse hatası:', e.message);
        continue;
      }
      
      console.log(`  success: ${ajaxJson.success}, data:`, JSON.stringify(ajaxJson.data)?.slice(0, 200));
      
      if (ajaxJson.success && ajaxJson.data?.url) {
        const iframeUrl = ajaxJson.data.url;
        console.log(`  iframeUrl: ${iframeUrl}`);
        
        // iframe'i çek
        console.log(`  iframe sayfası çekiliyor...`);
        try {
          const iframeBuf = await fetchBuffer(iframeUrl, { 'Referer': 'https://www.fullhdfilmizle.mom/' });
          const iframeHtml = iframeBuf.toString('utf-8');
          
          console.log(`  iframe HTML uzunluğu: ${iframeHtml.length}`);
          
          // m3u8 / master.txt ara
          const m3u8M = iframeHtml.match(/(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)/i);
          const masterM = iframeHtml.match(/(https?:\/\/[^\s'"<>]+master\.txt[^\s'"<>]*)/i);
          const fileM = iframeHtml.match(/file:\s*['"]([^'"]+)['"]/i);
          const srcM = iframeHtml.match(/src:\s*['"]([^'"]+)['"]/i);
          const nestedIframe = iframeHtml.match(/<iframe[^>]+src=['"]([^'"]+)['"]/i);
          
          console.log(`  m3u8: ${m3u8M?.[1] || 'YOK'}`);
          console.log(`  master.txt: ${masterM?.[1] || 'YOK'}`);
          console.log(`  file: ${fileM?.[1] || 'YOK'}`);
          console.log(`  src: ${srcM?.[1] || 'YOK'}`);
          console.log(`  nested iframe: ${nestedIframe?.[1] || 'YOK'}`);
          
          if (m3u8M || masterM || fileM) {
            console.log(`\n  ✅ MANIFEST BULUNDU! Oynatıcı: "${pName}"`);
            break;
          }
          
          // nested iframe varsa onu da kontrol et
          if (nestedIframe) {
            const nestedUrl = nestedIframe[1].startsWith('http') ? nestedIframe[1] : new URL(nestedIframe[1], iframeUrl).toString();
            console.log(`  Nested iframe çekiliyor: ${nestedUrl}`);
            try {
              const nestedBuf = await fetchBuffer(nestedUrl, { 'Referer': iframeUrl });
              const nestedHtml = nestedBuf.toString('utf-8');
              const nm = nestedHtml.match(/(https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*)/i);
              const nm2 = nestedHtml.match(/file:\s*['"]([^'"]+)['"]/i);
              console.log(`  Nested m3u8: ${nm?.[1] || 'YOK'}`);
              console.log(`  Nested file: ${nm2?.[1] || 'YOK'}`);
              if (nm || nm2) {
                console.log(`\n  ✅ NESTED MANIFEST BULUNDU!`);
                break;
              }
              // Ham nested HTML'in ilk 2000 karakterini göster
              console.log(`  Nested HTML (2000):\n${nestedHtml.slice(0, 2000)}`);
            } catch(ne) { console.log('  Nested fetch hatası:', ne.message); }
          }
          
          // Ham iframe HTML'in ilgili kısımlarını göster
          console.log(`\n  iframe HTML (ilk 3000 karakter):\n${iframeHtml.slice(0, 3000)}`);
          
        } catch(e) {
          console.log(`  iframe fetch hatası: ${e.message}`);
        }
      }
    } catch(e) {
      console.log(`  AJAX hatası: ${e.message}`);
    }
  }
  
  console.log('\n========= DEBUG TAMAMLANDI =========');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
