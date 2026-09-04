import { isIP } from 'node:net';
import { getDomain } from 'tldts';

export class WebsiteUrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebsiteUrlSafetyError';
  }
}

export function normalizeHomepageUrl(value: string): URL {
  const input = value.includes('://') ? value : `https://${value}`;
  const url = normalizeHttpUrl(input);
  url.pathname = '/';
  url.search = '';
  return url;
}

export function normalizeHttpUrl(value: string | URL): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebsiteUrlSafetyError('Enter a valid public HTTP(S) URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebsiteUrlSafetyError('Only HTTP(S) website URLs are allowed.');
  }
  if (!url.hostname || url.username || url.password || url.port) {
    throw new WebsiteUrlSafetyError('Website URLs cannot include credentials or non-default ports.');
  }

  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  url.hash = '';
  return url;
}

export function normalizeDiscoveredPageUrl(value: string | URL, expectedDomain: string): URL {
  const url = normalizeHttpUrl(value);
  if (!isSameRegistrableDomain(url.hostname, expectedDomain)) {
    throw new WebsiteUrlSafetyError('Website discovery only accepts URLs on the same registrable domain.');
  }

  for (const key of [...url.searchParams.keys()]) {
    if (isTrackingParameter(key)) url.searchParams.delete(key);
  }
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url;
}

export function isSameRegistrableDomain(hostname: string, expectedDomain: string): boolean {
  const left = getDomain(hostname, { allowPrivateDomains: false });
  const right = getDomain(expectedDomain, { allowPrivateDomains: false });
  return Boolean(left && right && left === right);
}

export function isLocaleNavigationPath(pathname: string): boolean {
  return /^\/[a-z]{2}(?:-[a-z]{2})?\/?$/i.test(pathname);
}

function isTrackingParameter(name: string) {
  return /^(utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|mc_[a-z0-9_]+|_ga)$/i.test(name);
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export function assertSafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isIP(normalized) !== 0
  ) {
    throw new WebsiteUrlSafetyError('Website targets must use a public hostname.');
  }
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  const [first, second] = octets;

  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && (second === 0 || second === 2 || second === 168)) ||
    (first === 198 && (second === 18 || second === 19 || second === 51)) ||
    (first === 203 && second === 0)
  ) {
    return false;
  }

  return true;
}

function isPublicIpv6(address: string): boolean {
  const bytes = ipv6ToBytes(address);
  if (!bytes) return false;

  const allZero = bytes.every((byte) => byte === 0);
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  const ipv4Mapped = bytes.slice(0, 10).every((byte) => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;

  if (allZero || loopback || bytes[0] === 0xff || (bytes[0] & 0xfe) === 0xfc) return false;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false;
  if (ipv4Mapped) return isPublicIpv4(bytes.slice(12).join('.'));

  return true;
}

function ipv6ToBytes(address: string): number[] | null {
  const normalized = address.toLowerCase();
  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  if (left.some((part) => !isHexGroup(part)) || right.some((part) => !isHexGroup(part))) return null;

  const missing = 8 - left.length - right.length;
  const groups = halves.length === 2 ? [...left, ...Array(missing).fill('0'), ...right] : left;
  if (groups.length !== 8) return null;

  return groups.flatMap((group) => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function isHexGroup(value: string) {
  return /^[0-9a-f]{1,4}$/.test(value);
}
