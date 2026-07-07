// DOM Elements
const elStreamUrl = document.getElementById("stream-url");
const elBtnAnalyze = document.getElementById("btn-analyze");
const elDecryptMethod = document.getElementById("decrypt-method");
const elDecryptKey = document.getElementById("decrypt-key");
const elDecryptIv = document.getElementById("decrypt-iv");
const elStripBytes = document.getElementById("strip-bytes");
const elConcurrency = document.getElementById("concurrency");
const elConcurrencyVal = document.getElementById("concurrency-val");
const elOutputName = document.getElementById("output-name");
const elOutputFormat = document.getElementById("output-format");
const elCustomReferer = document.getElementById("custom-referer");
const elBtnStart = document.getElementById("btn-start");

const elAnalysisPanel = document.getElementById("analysis-panel");
const elInfoSize = document.getElementById("info-size");
const elInfoHex = document.getElementById("info-hex");
const elSuggestionText = document.getElementById("suggestion-text");
const elBtnApplySuggestion = document.getElementById("btn-apply-suggestion");
const elHexViewerGrid = document.getElementById("hex-viewer-grid");

const elProgressPanel = document.getElementById("progress-panel");
const elBtnCancel = document.getElementById("btn-cancel");
const elProgressCount = document.getElementById("progress-count");
const elProgressStatus = document.getElementById("progress-status");
const elProgressBarFill = document.getElementById("progress-bar-fill");
const elLogTerminal = document.getElementById("log-terminal");
const elDownloadLinkContainer = document.getElementById(
  "download-link-container",
);
const elBtnDownloadFile = document.getElementById("btn-download-file");

// Search tab elements
const elSearchInput = document.getElementById("search-input");
const elBtnSearch = document.getElementById("btn-search");
const elFilmGrid = document.getElementById("film-grid");
const elDownloadQueue = document.getElementById("download-queue");

// Series Modal DOM Elements
const elSeriesModal = document.getElementById("series-modal");
const elModalSeriesTitle = document.getElementById("modal-series-title");
const elBtnCloseModal = document.getElementById("btn-close-modal");
const elModalSeasonsBar = document.getElementById("modal-seasons-bar");
const elModalEpisodesList = document.getElementById("modal-episodes-list");

// Active search type state ('movie' or 'series')
let activeSearchType = "movie";

// App State
let segmentList = [];
let sampleBytes = null;
let activeTaskId = null;
let pollInterval = null;
let lastLogLength = 0;
let detectedSuggestion = null;
// Search state: film başına bağımsız bir indirme kartı tutulur, böylece
// birden fazla film aynı anda indirilebilir ve biri diğerini kesmez.
const downloadTasksByUrl = new Map(); // filmUrl -> { root, pollInterval, ... }
let taskCounter = 0; // Technical process counter for PROC_XXX IDs

// ── Tab System ──────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-panel")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// ── Search Type Selector Logic ──────────────────────────────────────────────
document.querySelectorAll(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".type-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeSearchType = btn.dataset.type;
    
    if (activeSearchType === "series") {
      elSearchInput.placeholder = "aranacak dizi adını girin (Breaking Bad, vb.)...";
    } else {
      elSearchInput.placeholder = "aranacak film adını girin...";
    }
  });
});

// Close Series Modal
elBtnCloseModal.addEventListener("click", () => {
  elSeriesModal.classList.add("hidden");
});

// ── Search Logic ─────────────────────────────────────────────────────────────
// Bir indirme kartı içindeki tek bir adımın (film sayfası, ajax, manifest,
// analiz) görsel durumunu günceller. `root`, o filme ait kart elemandır;
// böylece birden fazla kart aynı anda bağımsız olarak güncellenebilir.
function setExtractStep(root, stepName, state, extraText) {
  const el = root.querySelector(`[data-step="${stepName}"]`);
  if (!el) return;
  el.className = `extract-step ${state}`;
  const icons = {
    done: "fa-square-check",
    active: "fa-spinner fa-spin",
    error: "fa-square-minus",
    "": "fa-square",
  };
  el.querySelector("i").className = `fa-solid ${icons[state] || icons[""]}`;
  const label = el.querySelector("span");
  if (extraText && label && !label.textContent.includes(extraText)) {
    label.textContent += ` ${extraText}`;
  }
}

elBtnSearch.addEventListener("click", doSearch);
elSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

// Otomatik arama: kullanıcı yazmayı bırakınca 600ms sonra otomatik ara
let searchDebounceTimer = null;
elSearchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  const q = elSearchInput.value.trim();
  if (!q) return;
  searchDebounceTimer = setTimeout(() => doSearch(), 600);
});

async function doSearch() {
  const q = elSearchInput.value.trim();
  if (!q) return;
  elBtnSearch.disabled = true;
  elBtnSearch.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> aranıyor...';
  elFilmGrid.innerHTML =
    '<div class="search-empty"><i class="fa-solid fa-spinner fa-spin" style="font-size:30px;margin-bottom:12px;display:block;"></i>aranıyor...</div>';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${activeSearchType}`);
    const data = await res.json();
    if (!data.success || data.films.length === 0) {
      elFilmGrid.innerHTML =
        `<div class="search-empty"><i class="fa-solid fa-terminal" style="font-size:40px;margin-bottom:12px;display:block;opacity:.3;"></i>${activeSearchType === "series" ? "dizi" : "film"} bulunamadı.</div>`;
      return;
    }
    renderFilmGrid(data.films);
  } catch (err) {
    elFilmGrid.innerHTML = `<div class="search-empty" style="color:#ff5c5c;">Hata: ${err.message}</div>`;
  } finally {
    elBtnSearch.disabled = false;
    elBtnSearch.innerHTML = '<i class="fa-solid fa-search"></i> ara.';
  }
}

function renderFilmGrid(films) {
  elFilmGrid.innerHTML = films
    .map(
      (f) => `
    <div class="film-card" data-url="${f.url}" data-title="${f.title}">
      <img src="${f.poster || ""}" alt="${f.title}" onerror="this.src='https://via.placeholder.com/160x240/111/555?text=?'">
      <div class="film-card-overlay"><span><i class="fa-solid fa-download"></i> ${activeSearchType === "series" ? "bölümler." : "indir."}</span></div>
      <div class="film-card-body">
        <div class="film-card-title">${f.title}</div>
        <div class="film-card-meta">
          ${f.year ? `<span>${f.year}</span>` : ""}
          ${f.rating ? `<span class="film-card-rating">★ ${f.rating}</span>` : ""}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  document.querySelectorAll(".film-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (activeSearchType === "series") {
        showSeriesDetails(card.dataset.url, card.dataset.title);
      } else {
        autoDownloadFilm(card.dataset.url, card.dataset.title);
      }
    });
  });
}

// HTML olarak güvenli hale getirmek için basit bir escape yardımcısı.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Her film için bağımsız bir indirme kartı oluşturur ve kuyruğun en üstüne
// ekler. Bu sayede bir film indirilirken başka bir filme tıklamak, öncekini
// iptal etmez / gizlemez — her ikisi de kendi kartında paralel ilerler.
function createDownloadCard(filmTitle) {
  taskCounter++;
  const procId = `PROC_${String(taskCounter).padStart(3, "0")}`;
  const root = document.createElement("div");
  root.className = "card glass";
  root.innerHTML = `
    <div class="card-header">
      <span style="color:var(--primary); font-size:1.1rem; font-weight:800; margin-right:10px; font-family:'Anybody',sans-serif;">${procId}</span>
      <i class="fa-solid fa-rotate fa-spin" style="margin-right:10px;"></i>
      <h2 style="flex:1; text-transform:none;">${escapeHtml(filmTitle)}</h2>
      <span class="status-badge status-running" data-role="status-badge">hazirlaniyor...</span>
      <button class="btn btn-danger btn-small" data-role="cancel-btn">
        <i class="fa-solid fa-xmark"></i> iptal_et.
      </button>
    </div>
    <div class="card-body">
      <div class="extract-status dl-task-steps" data-role="steps">
        <div class="extract-step" data-step="film"><i class="fa-solid fa-square"></i> <span>film_sayfasi_okunuyor...</span></div>
        <div class="extract-step" data-step="ajax"><i class="fa-solid fa-square"></i> <span>oynatici_url_alinyor...</span></div>
        <div class="extract-step" data-step="manifest"><i class="fa-solid fa-square"></i> <span>manifest_url_cikariliyor...</span></div>
        <div class="extract-step" data-step="analyze"><i class="fa-solid fa-square"></i> <span>akis_analiz_ediliyor...</span></div>
      </div>
      <div class="progress-details hidden" data-role="progress-details">
        <div class="progress-info-row">
          <span>tamamlanan_segmentler:</span>
          <strong data-role="progress-count">0 / 0</strong>
        </div>
      </div>
      <div class="progress-bar-bg hidden" data-role="progress-bar-bg">
        <div class="progress-bar-fill" data-role="progress-bar-fill" style="width:0%"></div>
      </div>
      <div class="log-title hidden" data-role="log-title">islem_gunlukleri.</div>
      <div class="log-terminal font-code hidden" data-role="log-terminal"></div>
      <div class="alert alert-warning dl-task-warning hidden" data-role="warning-box">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span data-role="warning-text"></span>
      </div>
      <div class="download-link-container hidden" data-role="download-link">
        <div class="alert alert-success">
          <i class="fa-solid fa-circle-check"></i> Video başarıyla oluşturuldu!
        </div>
        <a href="#" download class="btn btn-success btn-block" data-role="download-btn">
          <i class="fa-solid fa-file-arrow-down"></i> videoyu_kaydet.
        </a>
      </div>
    </div>
  `;
  elDownloadQueue.prepend(root);
  return root;
}

async function autoDownloadFilm(filmUrl, filmTitle) {
  if (downloadTasksByUrl.has(filmUrl)) {
    downloadTasksByUrl
      .get(filmUrl)
      .root.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const root = createDownloadCard(filmTitle);
  root.scrollIntoView({ behavior: "smooth", block: "center" });
  const task = {
    root,
    taskId: null,
    interval: null,
    lastLogLength: 0,
  };
  downloadTasksByUrl.set(filmUrl, task);

  const badge = root.querySelector('[data-role="status-badge"]');
  const cancelBtn = root.querySelector('[data-role="cancel-btn"]');
  const stepsBox = root.querySelector('[data-role="steps"]');
  const progressDetails = root.querySelector('[data-role="progress-details"]');
  const progressBarBg = root.querySelector('[data-role="progress-bar-bg"]');
  const progressBarFill = root.querySelector('[data-role="progress-bar-fill"]');
  const progressCount = root.querySelector('[data-role="progress-count"]');
  const logTitle = root.querySelector('[data-role="log-title"]');
  const logTerminal = root.querySelector('[data-role="log-terminal"]');
  const warningBox = root.querySelector('[data-role="warning-box"]');
  const warningText = root.querySelector('[data-role="warning-text"]');
  const downloadLink = root.querySelector('[data-role="download-link"]');
  const downloadBtn = root.querySelector('[data-role="download-btn"]');
  const headerIcon = root.querySelector(".card-header > i");

  const finishTask = () => {
    if (task.interval) clearInterval(task.interval);
    downloadTasksByUrl.delete(filmUrl);
  };

  cancelBtn.addEventListener("click", async () => {
    if (task.taskId) {
      await fetch(`/api/task-cancel/${task.taskId}`, { method: "POST" });
    } else {
      // Henuz indirme baslamadan (cikarim asamasinda) iptal edildi.
      finishTask();
      root.remove();
    }
  });

  try {
    let streamData = null;
    const isDirectM3u8 = filmUrl.includes(".m3u8");

    if (isDirectM3u8) {
      // Diziyou or direct m3u8 stream - skip extraction steps
      setExtractStep(root, "film", "done", "(doğrudan)");
      setExtractStep(root, "ajax", "done", "(doğrudan)");
      setExtractStep(root, "manifest", "done", "(doğrudan)");
      
      streamData = {
        success: true,
        manifestUrl: filmUrl,
        streamReferer: "https://www.diziyou.one/",
        candidateUrls: [filmUrl]
      };
    } else {
      // Normal film page - extract player and stream info
      setExtractStep(root, "film", "active");
      const playerRes = await fetch(
        `/api/extract-player?url=${encodeURIComponent(filmUrl)}`,
      );
      const playerData = await playerRes.json();
      if (!playerData.success) throw new Error(playerData.error);
      setExtractStep(root, "film", "done");

      setExtractStep(root, "ajax", "active");
      const partKeyParam = playerData.partKey
        ? `&partKey=${encodeURIComponent(playerData.partKey)}`
        : "";
      const streamRes = await fetch(
        `/api/extract-stream?postId=${playerData.postId}&nonce=${playerData.nonce}&player=FastPlay&filmUrl=${encodeURIComponent(filmUrl)}${partKeyParam}`,
      );
      if (!streamRes.ok) {
        const text = await streamRes.text();
        throw new Error(`API Hatası (extract-stream): ${text.substring(0, 150)}`);
      }
      const sData = await streamRes.json();
      if (!sData.success) throw new Error(sData.error);
      setExtractStep(root, "ajax", "done");
      setExtractStep(
        root,
        "manifest",
        "done",
        sData.usedPlayer ? `(${sData.usedPlayer})` : "",
      );
      
      streamData = sData;
    }

    // Adim 3: Manifesti analiz ederek segment listesini cikar
    setExtractStep(root, "analyze", "active");
    const analyzeRes = await fetch(
      `/api/analyze?url=${encodeURIComponent(streamData.manifestUrl)}&referer=${encodeURIComponent(streamData.streamReferer)}`,
    );
    if (!analyzeRes.ok) {
      const text = await analyzeRes.text();
      throw new Error(`API Hatası (analyze): ${text.substring(0, 150)}`);
    }
    const analyzeData = await analyzeRes.json();
    if (!analyzeData.success) throw new Error(analyzeData.error);
    setExtractStep(root, "analyze", "done");

    // Adim 4: Indirmeyi otomatik baslat. Cikti MP4 olarak istenir; sunucu
    // segmentleri once .ts olarak birlestirir, sonra FFmpeg "-c copy" ile
    // (yeniden kodlamadan, kalite kaybi olmadan) MP4'e donusturur.
    const safeTitle = filmTitle
      .replace(/[^a-z0-9ığüşöçİĞÜŞÖÇ\s]/gi, "")
      .trim()
      .replace(/\s+/g, "_");
    const outputName = `${safeTitle}.mp4`;

    const candidateHosts = (streamData.candidateUrls || []).map(u => {
      try { return new URL(u).host; } catch(_) { return null; }
    }).filter(Boolean);

    // Alternatif sunucular varsa, hızdan maksimum faydalanmak için eşzamanlılığı 12'ye çıkarıyoruz, yoksa güvenli sınır olan 4'te tutuyoruz.
    const concurrency = candidateHosts.length > 1 ? 12 : 4;

    const dlRes = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: analyzeData.segments,
        method: "none",
        concurrency,
        outputName,
        referer: streamData.streamReferer,
        candidateHosts,
      }),
    });
    if (!dlRes.ok) {
      const text = await dlRes.text();
      throw new Error(`API Hatası (download): ${text.substring(0, 150)}`);
    }
    const dlData = await dlRes.json();
    if (!dlData.success) throw new Error(dlData.error);

    task.taskId = dlData.taskId;
    task.total = analyzeData.segments.length;

    headerIcon.className = "fa-solid fa-rotate fa-spin";
    stepsBox.classList.add("hidden");
    progressDetails.classList.remove("hidden");
    progressBarBg.classList.remove("hidden");
    logTitle.classList.remove("hidden");
    logTerminal.classList.remove("hidden");
    progressCount.textContent = `0 / ${task.total}`;
    badge.textContent = "Indiriliyor...";
    badge.className = "status-badge status-running";

    task.interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/task-status/${task.taskId}`);
        const data = await res.json();

        progressCount.textContent = `${data.completed} / ${data.total || task.total}`;
        const pct = data.total
          ? Math.round((data.completed / data.total) * 100)
          : 0;
        progressBarFill.style.width = `${pct}%`;

        if (data.logs && data.logs.length > task.lastLogLength) {
          const newLogs = data.logs.slice(task.lastLogLength);
          task.lastLogLength = data.logs.length;
          newLogs.forEach((log) => {
            const line = document.createElement("div");
            line.textContent = `[${new Date().toLocaleTimeString("tr-TR")}] ${log}`;
            logTerminal.appendChild(line);
            logTerminal.scrollTop = logTerminal.scrollHeight;
          });
        }

        if (data.status === "completed") {
          headerIcon.className = "fa-solid fa-circle-check";
          badge.textContent = "Tamamlandi";
          badge.className = "status-badge status-completed";
          progressBarFill.style.width = "100%";
          downloadLink.classList.remove("hidden");
          downloadBtn.href = `/downloads/${data.outputName}`;
          downloadBtn.setAttribute("download", data.outputName);
          cancelBtn.remove();
          // Birlestirme/donusum biter bitmez indirmeyi otomatik baslat.
          // Buton yine de kaliyor, boylece kullanici isterse tekrar indirebilir.
          downloadBtn.click();
          if (data.failed > 0) {
            warningBox.classList.remove("hidden");
            warningText.textContent = `${data.failed} segment indirilemedi. Video oynatilirken kisa bir kesinti/bozulma gorulebilir.`;
          }
          finishTask();
        } else if (data.status === "error") {
          headerIcon.className = "fa-solid fa-triangle-exclamation";
          badge.textContent = "Hata";
          badge.className = "status-badge status-error";
          cancelBtn.remove();
          finishTask();
        } else if (data.status === "cancelled") {
          headerIcon.className = "fa-solid fa-ban";
          badge.textContent = "Iptal edildi";
          badge.className = "status-badge status-cancelled";
          cancelBtn.remove();
          finishTask();
        }
      } catch (_) {}
    }, 1000);
  } catch (err) {
    headerIcon.className = "fa-solid fa-triangle-exclamation";
    badge.textContent = "Hata";
    badge.className = "status-badge status-error";
    warningBox.classList.remove("hidden");
    warningText.textContent = `Hata: ${err.message}`;
    finishTask();
  }
}

// Concurrency range updates
elConcurrency.addEventListener("input", () => {
  elConcurrencyVal.textContent = elConcurrency.value;
});

// Output format change: auto-update filename extension
elOutputFormat.addEventListener("change", () => {
  const fmt = elOutputFormat.value;
  const current = elOutputName.value.trim();
  if (fmt === "mp4") {
    elOutputName.value =
      current.replace(/\.ts$/i, ".mp4") || "downloaded_video.mp4";
  } else {
    elOutputName.value =
      current.replace(/\.mp4$/i, ".ts") || "downloaded_video.ts";
  }
});

// Decrypt Method Changes
elDecryptMethod.addEventListener("change", () => {
  const method = elDecryptMethod.value;
  updateMethodInputFields(method);
  triggerHexUpdate();
});

// Settings Input Changes (Triggers live Hex Decryption Preview)
elDecryptKey.addEventListener("input", triggerHexUpdate);
elStripBytes.addEventListener("input", triggerHexUpdate);

function updateMethodInputFields(method) {
  const keyGroup = document.querySelector(".val-key");
  const ivGroup = document.querySelector(".val-iv");
  const stripGroup = document.querySelector(".val-strip");

  keyGroup.classList.add("hidden");
  ivGroup.classList.add("hidden");
  stripGroup.classList.add("hidden");

  if (method === "xor") {
    keyGroup.classList.remove("hidden");
    document.querySelector(".val-key label").innerHTML =
      'XOR Anahtarı <span class="help-text">(Hex: 0x55 veya 55aa, Sayı: 85, Metin: abc)</span>';
  } else if (method === "aes-128") {
    keyGroup.classList.remove("hidden");
    document.querySelector(".val-key label").innerHTML =
      "AES Key (Hex 16 byte / 32 karakter)";
    elDecryptKey.placeholder = "Örn: 4a2f8b...";
    ivGroup.classList.remove("hidden");
  } else if (method === "strip") {
    stripGroup.classList.remove("hidden");
  }
}

function triggerHexUpdate() {
  if (!sampleBytes) return;
  const method = elDecryptMethod.value;
  const key = elDecryptKey.value;
  const stripBytes = elStripBytes.value;

  // If method is auto, we preview raw bytes until applied
  const previewMethod = method === "auto" ? "none" : method;
  const decrypted = decryptBytesFrontend(sampleBytes, previewMethod, {
    key,
    stripBytes,
  });
  renderHex(decrypted);
}

// Frontend Decryption Preview Logic
function decryptBytesFrontend(bytes, method, options = {}) {
  if (method === "none") {
    return bytes;
  }
  if (method === "strip") {
    const num = parseInt(options.stripBytes || 0, 10);
    if (num >= bytes.length) return new Uint8Array(0);
    return bytes.slice(num);
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
      keyBytes = Array.from(keyString).map((c) => c.charCodeAt(0));
    }

    if (keyBytes.length === 0 || isNaN(keyBytes[0])) return bytes;

    const decrypted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decrypted[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return decrypted;
  }
  return bytes;
}

// Render Hex Viewer Grid
function renderHex(bytes) {
  let html = "";
  const escapeHtml = (text) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(8, "0").toUpperCase();

    let hexParts = [];
    let asciiParts = [];
    for (let j = 0; j < 16; j++) {
      if (j < chunk.length) {
        const b = chunk[j];
        hexParts.push(b.toString(16).padStart(2, "0").toUpperCase());
        if (b >= 32 && b <= 126) {
          asciiParts.push(String.fromCharCode(b));
        } else {
          asciiParts.push(".");
        }
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
    }

    html +=
      `<div class="hex-offset">${offset}</div>` +
      `<div class="hex-bytes">${hexParts.join(" ")}</div>` +
      `<div class="hex-ascii">${escapeHtml(asciiParts.join(""))}</div>`;
  }
  elHexViewerGrid.innerHTML = html;
}

// Analyze Stream URL
elBtnAnalyze.addEventListener("click", async () => {
  const url = elStreamUrl.value.trim();
  if (!url) {
    alert("Lütfen geçerli bir URL girin.");
    return;
  }

  elBtnAnalyze.disabled = true;
  elBtnAnalyze.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Analiz Ediliyor';
  elAnalysisPanel.classList.add("hidden");
  elBtnStart.disabled = true;

  try {
    let referer = elCustomReferer.value.trim();

    // Set a smart default referer if not set BEFORE the API call
    if (!referer) {
      try {
        const parsed = new URL(url);
        referer = `${parsed.protocol}//${parsed.host}/`;
        elCustomReferer.value = referer;
      } catch (e) {}
    }

    const apiUrl =
      `/api/analyze?url=${encodeURIComponent(url)}` +
      (referer ? `&referer=${encodeURIComponent(referer)}` : "");

    const response = await fetch(apiUrl);
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Analiz başarısız.");
    }

    segmentList = data.segments;
    if (!segmentList || segmentList.length === 0) {
      throw new Error("Geçerli video segmenti bulunamadı.");
    }

    // Set UI with analysis results
    elInfoSize.textContent = `${(data.size / 1024).toFixed(2)} KB (${data.size.toLocaleString()} byte)`;
    elInfoHex.textContent = data.firstBytesHex;

    // Parse sample bytes for hex viewer
    const binaryString = atob(data.rawBytesBase64);
    sampleBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      sampleBytes[i] = binaryString.charCodeAt(i);
    }

    // Render hex
    renderHex(sampleBytes);
    elAnalysisPanel.classList.remove("hidden");

    // Handle suggestion
    detectedSuggestion = data.suggestion;
    if (detectedSuggestion && detectedSuggestion.confidence === "high") {
      elSuggestionText.textContent = detectedSuggestion.details;
      elBtnApplySuggestion.classList.remove("hidden");
    } else {
      elSuggestionText.textContent =
        "Otomatik şifreleme tespit edilemedi. Lütfen manuel ayarları deneyin.";
      elBtnApplySuggestion.classList.add("hidden");
    }

    elBtnStart.disabled = false;
  } catch (error) {
    alert(`Analiz hatası: ${error.message}`);
  } finally {
    elBtnAnalyze.disabled = false;
    elBtnAnalyze.innerHTML =
      '<i class="fa-solid fa-magnifying-glass"></i> Analiz Et';
  }
});

// Apply Suggestion Button Click
elBtnApplySuggestion.addEventListener("click", () => {
  if (!detectedSuggestion) return;

  elDecryptMethod.value = detectedSuggestion.method;
  updateMethodInputFields(detectedSuggestion.method);

  if (detectedSuggestion.method === "xor") {
    elDecryptKey.value = detectedSuggestion.key;
  } else if (detectedSuggestion.method === "strip") {
    elStripBytes.value = detectedSuggestion.stripBytes;
  }

  triggerHexUpdate();
  elBtnApplySuggestion.classList.add("hidden");
  elSuggestionText.textContent = `Uygulandı: ${detectedSuggestion.details}`;
});

// Start Download and Decrypt
elBtnStart.addEventListener("click", async () => {
  if (segmentList.length === 0) return;

  const method = elDecryptMethod.value;
  const key = elDecryptKey.value.trim();
  const iv = elDecryptIv.value.trim();
  const stripBytes = parseInt(elStripBytes.value || 0, 10);
  const concurrency = parseInt(elConcurrency.value || 5, 10);
  const outputName = elOutputName.value.trim() || "video.ts";

  elBtnStart.disabled = true;
  elProgressPanel.classList.remove("hidden");
  elDownloadLinkContainer.classList.add("hidden");

  // Clear logs
  elLogTerminal.innerHTML = "";
  lastLogLength = 0;
  elProgressBarFill.style.width = "0%";
  elProgressCount.textContent = `0 / ${segmentList.length}`;
  elProgressStatus.textContent = "Başlatılıyor...";
  elProgressStatus.className = "status-badge status-running";

  try {
    const referer = elCustomReferer.value.trim();
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: segmentList,
        method,
        key,
        iv,
        stripBytes,
        concurrency,
        outputName,
        referer,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "İndirme görevi başlatılamadı.");
    }

    activeTaskId = data.taskId;

    // Start status polling
    pollInterval = setInterval(pollTaskStatus, 1000);
  } catch (error) {
    appendLog(`HATA: ${error.message}`);
    elProgressStatus.textContent = "HATA";
    elProgressStatus.className = "status-badge status-error";
    elBtnStart.disabled = false;
  }
});

// Cancel Download
elBtnCancel.addEventListener("click", async () => {
  if (!activeTaskId) return;

  try {
    await fetch(`/api/task-cancel/${activeTaskId}`, { method: "POST" });
    appendLog("Kullanıcı tarafından iptal isteği gönderildi.");
  } catch (error) {
    appendLog(`İptal etme hatası: ${error.message}`);
  }
});

// Poll Task Status
async function pollTaskStatus() {
  if (!activeTaskId) return;

  try {
    const response = await fetch(`/api/task-status/${activeTaskId}`);
    const task = await response.json();

    if (task.error) {
      throw new Error(task.error);
    }

    // Update Progress
    const percent = task.total > 0 ? (task.completed / task.total) * 100 : 0;
    elProgressBarFill.style.width = `${percent}%`;
    elProgressCount.textContent = `${task.completed} / ${task.total}`;

    // Render Logs
    if (task.logs && task.logs.length > lastLogLength) {
      for (let i = lastLogLength; i < task.logs.length; i++) {
        appendLog(task.logs[i]);
      }
      lastLogLength = task.logs.length;
    }

    // Status classes and text
    if (task.status === "completed") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "TAMAMLANDI";
      elProgressStatus.className = "status-badge status-completed";
      elBtnStart.disabled = false;

      // Show Download File Button ve otomatik indirmeyi baslat
      elBtnDownloadFile.href = `/downloads/${task.outputName}`;
      elBtnDownloadFile.setAttribute("download", task.outputName);
      elDownloadLinkContainer.classList.remove("hidden");
      elBtnDownloadFile.click();
    } else if (task.status === "cancelled") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "İPTAL EDİLDİ";
      elProgressStatus.className = "status-badge status-cancelled";
      elBtnStart.disabled = false;
    } else if (task.status === "error") {
      clearInterval(pollInterval);
      pollInterval = null;
      activeTaskId = null;
      elProgressStatus.textContent = "HATA";
      elProgressStatus.className = "status-badge status-error";
      elBtnStart.disabled = false;
    } else {
      elProgressStatus.textContent = "İNDİRİLİYOR...";
      elProgressStatus.className = "status-badge status-running";
    }
  } catch (error) {
    appendLog(`Sorgulama Hatası: ${error.message}`);
    clearInterval(pollInterval);
    pollInterval = null;
    activeTaskId = null;
    elProgressStatus.textContent = "HATA";
    elProgressStatus.className = "status-badge status-error";
    elBtnStart.disabled = false;
  }
}

function appendLog(message) {
  const div = document.createElement("div");
  div.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  elLogTerminal.appendChild(div);
  elLogTerminal.scrollTop = elLogTerminal.scrollHeight;
}

// ─── DIZIYOU SERIES MANAGEMENT & UI RENDERING ─────────────────────────────

// Dynamic cache of extracted episode details to avoid refetching on toggle
const episodeDetailsCache = new Map(); // episodeUrl -> streams data

// Show series detail modal
async function showSeriesDetails(url, title) {
  elModalSeriesTitle.textContent = title;
  elModalSeasonsBar.innerHTML = "";
  elModalEpisodesList.innerHTML = '<div class="options-loading"><i class="fa-solid fa-spinner fa-spin"></i> sezonlar yükleniyor...</div>';
  elSeriesModal.classList.remove("hidden");

  try {
    const response = await fetch(`/api/series-detail?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (!data.success || data.seasons.length === 0) {
      elModalEpisodesList.innerHTML = '<div class="search-empty" style="color: var(--accent-red);">Bölüm bilgisi alınamadı.</div>';
      return;
    }

    renderSeasonsAndEpisodes(data.seasons, title);
  } catch (err) {
    elModalEpisodesList.innerHTML = `<div class="search-empty" style="color: var(--accent-red);">Hata: ${err.message}</div>`;
  }
}

// Render seasons bar and episodes
function renderSeasonsAndEpisodes(seasons, seriesTitle) {
  elModalSeasonsBar.innerHTML = "";
  
  // Render season buttons
  seasons.forEach((s, index) => {
    const btn = document.createElement("button");
    btn.className = `season-btn ${index === 0 ? "active" : ""}`;
    btn.textContent = `${s.season}. Sezon`;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".season-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderEpisodes(s.episodes, seriesTitle);
    });
    elModalSeasonsBar.appendChild(btn);
  });

  // Render first season by default
  renderEpisodes(seasons[0].episodes, seriesTitle);
}

// Render episodes of selected season
function renderEpisodes(episodes, seriesTitle) {
  elModalEpisodesList.innerHTML = "";
  
  episodes.forEach(ep => {
    const item = document.createElement("div");
    item.className = "episode-item";
    item.dataset.url = ep.url;
    item.dataset.title = ep.title;
    
    // Episode main bar (header)
    const mainBar = document.createElement("div");
    mainBar.className = "episode-main";
    mainBar.innerHTML = `
      <div class="episode-title">
        <span>${ep.season}. Sezon ${ep.episode}. Bölüm</span>
        <span class="episode-name">${ep.name}</span>
      </div>
      <button class="episode-action-btn">seçenekler.</button>
    `;
    
    // Details panel containing download and subtitles options
    const detailsPanel = document.createElement("div");
    detailsPanel.className = "episode-details-panel";
    detailsPanel.innerHTML = '<div class="options-loading"><i class="fa-solid fa-spinner fa-spin"></i> yayın kaynakları yükleniyor...</div>';
    
    item.appendChild(mainBar);
    item.appendChild(detailsPanel);
    elModalEpisodesList.appendChild(item);
    
    // Click behavior to slide-down / load options
    mainBar.addEventListener("click", () => {
      const isActive = item.classList.contains("active");
      
      // Close other active episode items in this modal view
      document.querySelectorAll(".episode-item").forEach(el => el.classList.remove("active"));
      
      if (!isActive) {
        item.classList.add("active");
        loadEpisodeOptions(ep.url, detailsPanel, seriesTitle, ep.season, ep.episode);
      }
    });
  });
}

// Load player / stream options dynamically
async function loadEpisodeOptions(episodeUrl, container, seriesTitle, seasonNum, episodeNum) {
  // Check cache first
  if (episodeDetailsCache.has(episodeUrl)) {
    renderEpisodeOptions(episodeDetailsCache.get(episodeUrl), container, seriesTitle, seasonNum, episodeNum);
    return;
  }

  try {
    const response = await fetch(`/api/extract-series-video?url=${encodeURIComponent(episodeUrl)}`);
    const data = await response.json();
    if (!data.success || data.streams.length === 0) {
      container.innerHTML = '<div class="options-loading" style="color: var(--accent-red);"><i class="fa-solid fa-triangle-exclamation"></i> Yayın kaynağı çıkarılamadı.</div>';
      return;
    }
    
    // Cache the data
    episodeDetailsCache.set(episodeUrl, data.streams);
    renderEpisodeOptions(data.streams, container, seriesTitle, seasonNum, episodeNum);
  } catch (err) {
    container.innerHTML = `<div class="options-loading" style="color: var(--accent-red);">Hata: ${err.message}</div>`;
  }
}

// Render option rows inside selected episode panel
function renderEpisodeOptions(streams, container, seriesTitle, seasonNum, episodeNum) {
  container.innerHTML = "";
  
  const optionsWrapper = document.createElement("div");
  optionsWrapper.className = "stream-options-container";
  
  streams.forEach(stream => {
    const row = document.createElement("div");
    row.className = "stream-option-row";
    
    // Create slug-like safe output name
    const cleanSeriesName = seriesTitle.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
    const pad = (num) => String(num).padStart(2, "0");
    const cleanStreamName = stream.name.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
    const outputName = `${cleanSeriesName}_S${pad(seasonNum)}E${pad(episodeNum)}_${cleanStreamName}.ts`;
    
    // Check if subtitles exist
    let subButtonsHtml = "";
    if (stream.subtitles && stream.subtitles.length > 0) {
      stream.subtitles.forEach(sub => {
        subButtonsHtml += `
          <button class="opt-sub-btn" data-sub-url="${sub.src}" data-sub-name="${cleanSeriesName}_S${pad(seasonNum)}E${pad(episodeNum)}_${sub.label}.vtt">
            <i class="fa-solid fa-closed-captioning"></i> altyazı_${sub.label.toLowerCase()}.
          </button>
        `;
      });
    }

    row.innerHTML = `
      <span class="stream-option-title">${stream.name}</span>
      <div class="stream-option-actions">
        ${subButtonsHtml}
        <button class="opt-dl-btn" data-m3u8-url="${stream.m3u8Url}" data-output="${outputName}">
          <i class="fa-solid fa-download"></i> indir.
        </button>
      </div>
    `;
    
    // Add event listeners to buttons
    row.querySelector(".opt-dl-btn").addEventListener("click", () => {
      // Start task download process in parallel
      autoDownloadFilm(stream.m3u8Url, outputName);
      // Close modal on action
      elSeriesModal.classList.add("hidden");
    });
    
    row.querySelectorAll(".opt-sub-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent panel click propagation
        const subUrl = btn.dataset.subUrl;
        const subName = btn.dataset.subName;
        downloadSubtitleInBrowser(subUrl, subName);
      });
    });

    optionsWrapper.appendChild(row);
  });
  
  container.appendChild(optionsWrapper);
}

// Download subtitle file directly in the browser
function downloadSubtitleInBrowser(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.setAttribute("download", filename);
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
