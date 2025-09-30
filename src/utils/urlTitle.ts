export function inferTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, '');
    const pathSegments = parsed.pathname
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const lastSegment = pathSegments.length ? pathSegments[pathSegments.length - 1] : '';
    const candidate = decodeURIComponent(lastSegment)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const capitalise = (input: string) =>
      input
        .split(' ')
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
        .join(' ')
        .trim();

    const pretty = candidate ? capitalise(candidate) : capitalise(host.replace(/\./g, ' '));
    return pretty || host || url;
  } catch {
    return url;
  }
}
