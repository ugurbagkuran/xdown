

async function runTest() {
  console.log("1. Arama yapılıyor...");
  try {
    const searchRes = await fetch("http://localhost:3000/api/search?q=rick+and+morty&type=series");
    const searchData = await searchRes.json();
    if (!searchData.success || searchData.films.length === 0) {
      console.error("Dizi bulunamadı.");
      return;
    }

    const series = searchData.films[0];
    console.log(`Bulunan Dizi: ${series.title} -> ${series.url}`);

    console.log("2. Dizi detayları çekiliyor...");
    const detailRes = await fetch(`http://localhost:3000/api/series-detail?url=${encodeURIComponent(series.url)}`);
    const detailData = await detailRes.json();
    if (!detailData.success || detailData.seasons.length === 0) {
      console.error("Dizi detayları çekilemedi:", detailData.error || "Boş sezon");
      return;
    }

    console.log(`Sezon sayısı: ${detailData.seasons.length}`);
    const firstSeason = detailData.seasons[0];
    console.log(`1. Sezon bölüm sayısı: ${firstSeason.episodes.length}`);

    // İlk 2 bölümü test edelim
    const testEpisodes = firstSeason.episodes.slice(0, 2);

    for (const ep of testEpisodes) {
      console.log(`\nBölüm extracting: ${ep.title} (${ep.url})`);
      const extractRes = await fetch(`http://localhost:3000/api/extract-series-video?url=${encodeURIComponent(ep.url)}`);
      const extractData = await extractRes.json();

      if (!extractData.success) {
        console.error(`Bölüm extract edilemedi:`, extractData.error);
        continue;
      }

      console.log("Bulunan yayınlar:", extractData.streams.map(s => s.name));
      const targetStream = extractData.streams.find(s => s.name === "Türkçe Altyazılı") || extractData.streams[0];
      if (!targetStream) {
        console.error("Yayın bulunamadı.");
        continue;
      }

      console.log(`Seçilen yayın: ${targetStream.name}`);
      const targetQuality = targetStream.qualities[0];
      let m3u8Url = targetQuality.m3u8Url;
      console.log(`Kullanılan m3u8: ${m3u8Url}`);

      // Analyze et
      console.log("Analyze ediliyor...");
      const analyzeRes = await fetch(`http://localhost:3000/api/analyze?url=${encodeURIComponent(m3u8Url)}&referer=https%3A%2F%2Fwww.diziyou.one%2F`);
      const analyzeData = await analyzeRes.json();
      if (!analyzeData.success) {
        console.error("Analyze hatası:", analyzeData.error);
        continue;
      }

      console.log(`Segment sayısı: ${analyzeData.totalSegments}`);
      console.log(`Öneri metodu: ${analyzeData.suggestion?.method}`);

      // İndirme isteği yap
      console.log("İndirme başlatılıyor...");
      const dlRes = await fetch("http://localhost:3000/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: analyzeData.segments,
          method: analyzeData.suggestion?.method || "none",
          key: analyzeData.suggestion?.key || "",
          iv: analyzeData.suggestion?.iv || "",
          stripBytes: analyzeData.suggestion?.stripBytes || 0,
          concurrency: 4,
          outputName: `test_bulk_${ep.season}_${ep.episode}.ts`,
          referer: "https://www.diziyou.one/",
          candidateHosts: [],
          subtitles: targetStream.subtitles || []
        })
      });

      const dlData = await dlRes.json();
      if (dlData.success) {
        console.log(`İndirme görevi başarıyla oluşturuldu. TaskID: ${dlData.taskId}`);
      } else {
        console.error("İndirme başlatılamadı:", dlData.error);
      }
    }
  } catch (err) {
    console.error("Test sırasında hata oluştu:", err);
  }
}

runTest();
