# FilmDownloader Projesi AI Talimatları

## Proje Hakkında
- **Adı:** filmdownloader
- **Amaç:** Şifreli PNG formatındaki video parçalarını (veya segmentleri) yakalayıp, şifrelerini çözerek birleştirilmiş, izlenebilir video dosyası haline getiren Node.js tabanlı bir yazılımdır.
- **Kapsam:** Belirli platformlar (örneğin fullhdfilmizle) üzerinden arama yapma, otomatik extract (çıkarma) işlemleri ve şifreli veri işleme özellikleri içerir.

## Teknolojiler ve Mimari
- **Backend:** Node.js, Express.js.
- **Frontend:** Vanilla JavaScript (app.js), HTML, Vanilla CSS (style.css).
- **Modül Sistemi:** ES Modules (package.json içinde `"type": "module"` olarak ayarlı).
- **Temel Paketler ve Özellikler:** Buffer, `crypto` modülü (muhtemelen AES decryption için), `child_process` (ffmpeg veya benzeri dış bileşen çağrıları) ve http/https (keepAlive ajanları kullanılarak).

## Geliştirme Standartları & Kurallar
- **Dil:** Her zaman **Türkçe** iletişim kur ve implementasyon planlarını Türkçe yaz. (Kullanıcının global kuralı)
- **Frontend Yaklaşımı:** Herhangi bir dış framework (React, Vue, Tailwind vb.) kullanma. Vanilla JS (DOM Manipulation) ile devam et.
- **Backend Yaklaşımı:** Her zaman ES Modules (`import/export`) syntax'ı kullan, `require` kullanmaktan kaçın.
- **Yapı:**
  - `server.js`: Sunucu, API endpoint'leri ve arka plan görevlerinin (indirme/çözme) yönetildiği ana dosyadır.
  - `app.js`: Frontend UI mantığı (sekme sistemleri, log gösterme, arama vs.) burada yer alır.
  - İndirilen ve birleştirilen dosyalar varsayılan olarak projedeki indirme klasörlerinde tutulur.

## Sık Kullanılan Komutlar
- **Projeyi Çalıştırma:** `npm start` veya `npm run dev` (her iki komut da `node server.js` çalıştırır).
