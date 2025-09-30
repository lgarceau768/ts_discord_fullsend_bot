const TWEMOJI_PNG_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72";
const GOOGLE_FAVICON_ENDPOINT = "https://www.google.com/s2/favicons";

function toCodePoint(emoji: string): string {
  return Array.from(emoji)
    .map((char) => char.codePointAt(0)?.toString(16))
    .filter(Boolean)
    .join("-")
    .toLowerCase();
}

export function emojiToIconUrl(emoji: string): string {
  const codePoint = toCodePoint(emoji);
  if (!codePoint) return "";
  return `${TWEMOJI_PNG_BASE}/${codePoint}.png`;
}

export function getWatchIconUrl(): string {
  return emojiToIconUrl("🔔");
}

export function getSnapshotIconUrl(): string {
  return emojiToIconUrl("📈");
}

export function getSiteIconUrl(url: string, size = 128): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host) return "";
    return `${GOOGLE_FAVICON_ENDPOINT}?sz=${size}&domain=${encodeURIComponent(host)}`;
  } catch {
    return "";
  }
}
