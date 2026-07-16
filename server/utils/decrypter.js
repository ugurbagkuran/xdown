import crypto from "crypto";

// TS Detection and Auto-Analysis Helpers
export function detectTsOffset(buffer) {
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

export function detectXorKey(buffer) {
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
export function applyDecryption(buffer, method, options = {}) {
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
