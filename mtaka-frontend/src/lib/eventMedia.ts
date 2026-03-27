import { getApiOrigin } from '@/api';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const isLocalHostname = (hostname: string) => LOCAL_HOSTNAMES.has(hostname.toLowerCase());

const normalizeMediaPath = (path: string) => {
  const normalized = path.replaceAll('\\', '/');
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;

  if (withLeadingSlash.startsWith('/media/')) return withLeadingSlash;
  if (withLeadingSlash.includes('/event_covers/')) return `/media${withLeadingSlash}`;

  return withLeadingSlash;
};

export const resolveEventCoverUrl = (src?: string | null): string | undefined => {
  if (!src) return undefined;

  const raw = String(src).trim().replaceAll('\\', '/');
  if (!raw) return undefined;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const mediaPath = normalizeMediaPath(parsed.pathname);
      const suffix = `${mediaPath}${parsed.search}${parsed.hash}`;

      if (isLocalHostname(parsed.hostname)) {
        return suffix;
      }

      if (
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        parsed.protocol === 'http:'
      ) {
        return `https://${parsed.host}${suffix}`;
      }

      if (mediaPath !== parsed.pathname) {
        return `${parsed.origin}${suffix}`;
      }

      return raw;
    } catch {
      return raw;
    }
  }

  const backendOrigin = getApiOrigin();
  return `${backendOrigin}${normalizeMediaPath(raw)}`;
};
