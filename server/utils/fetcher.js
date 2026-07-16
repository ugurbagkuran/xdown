import http from "http";
import https from "https";

// Keep-alive agents for connection reuse across segments
export const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
export const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, rejectUnauthorized: false });

// Helper to fetch content length of a URL with default browser headers
export function fetchContentLength(url, headers = {}, redirectCount = 0) {
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

// Helper to fetch content of a URL into a Buffer
export function fetchBuffer(url, headers = {}, redirectCount = 0, timeout = 12000) {
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

// Helper to check if a URL is reachable
export async function checkUrlReachable(url, referer = "") {
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

// Helper to estimate total size of segments in an m3u8 playlist
export async function estimateSegmentsSize(segments, extraHeaders, firstSegmentSize) {
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
