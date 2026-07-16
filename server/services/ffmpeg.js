import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { appSettings } from "../utils/settings.js";

export function ensurePlayableCacheDir() {
  const cacheDir = path.join(appSettings.downloadsDir, ".playable-cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

export function ensureThumbnailCacheDir() {
  const cacheDir = path.join(appSettings.downloadsDir, ".thumbnail-cache");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

export function convertTsToPlayableMp4(inputTsPath, outputMp4Path) {
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

export function generateVideoThumbnail(inputVideoPath, outputImagePath) {
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

export function convertToMp4(inputTs, outputMp4, state) {
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
