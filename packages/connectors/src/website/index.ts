import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { load } from 'cheerio';
import type { ObservationCandidate, RawSnapshot, WebsiteRawSnapshot } from '@rivallens/schemas';
import {
  connectorHealthSchema,
  discoveredSourceSchema,
  websiteRawSnapshotSchema,
  type ConnectorHealth,
  type DiscoverInput,
  type DiscoveredSource,
} from '@rivallens/schemas';
import type { RivalConnector } from '..';
import {
  assertSafeHostname,
  isLocaleNavigationPath,
  isPublicIpAddress,
  isSameRegistrableDomain,
  normalizeDiscoveredPageUrl,
  normalizeHomepageUrl,
  normalizeHttpUrl,
  WebsiteUrlSafetyError,
} from './url';
import { extractWebsiteObservations } from './extract';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const COLLECTOR_VERSION = 'website-http-v1';
const NORMALIZER_VERSION = 'website-text-v1';
const MAX_DISCOVERED_SOURCES = 40;
const MAX_HOMEPAGE_LINKS = 120;
const MAX_SITEMAP_DOCUMENTS = 5;
const MAX_SITEMAP_URLS = 120;

export {
  isPublicIpAddress,
  isSameRegistrableDomain,
  normalizeDiscoveredPageUrl,
  normalizeHomepageUrl,
  normalizeHttpUrl,
  WebsiteUrlSafetyError,
} from './url';
export { extractWebsiteObservations } from './extract';

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface WebsiteHttpResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

export interface WebsiteHttpTransport {
  request(url: URL, address: ResolvedAddress): Promise<WebsiteHttpResponse>;
}

export interface WebsiteConnectorOptions {
  now?: () => Date;
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
  transport?: WebsiteHttpTransport;
}

export class WebsiteConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebsiteConnectorError';
  }
}

export class WebsiteConnector implements RivalConnector {
  private readonly now: () => Date;
  private readonly resolveHost: (hostname: string) => Promise<ResolvedAddress[]>;
  private readonly transport: WebsiteHttpTransport;

  constructor(options: WebsiteConnectorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.resolveHost = options.resolveHost ?? resolvePublicHostname;
    this.transport = options.transport ?? new NodeWebsiteHttpTransport();
  }

  async discover(input: DiscoverInput): Promise<DiscoveredSource[]> {
    return this.discoverPages(input);
  }

  async discoverHomepage(input: DiscoverInput): Promise<DiscoveredSource[]> {
    const canonicalUrl = normalizeHomepageUrl(input.canonicalUrl);
    await this.resolveAndAssertPublic(canonicalUrl);

    return [
      discoveredSourceSchema.parse({
        connectorType: 'website',
        sourceType: 'homepage',
        canonicalUrl: canonicalUrl.href,
      }),
    ];
  }

  async discoverPages(input: DiscoverInput): Promise<DiscoveredSource[]> {
    const [homepage] = await this.discoverHomepage(input);
    const homepageUrl = new URL(homepage.canonicalUrl);
    const candidates = new Map<string, DiscoveredSource>();
    addDiscoveryCandidate(candidates, homepageUrl, homepageUrl.hostname);

    const homepageDocument = await this.fetchDiscoveryDocument(homepageUrl, homepageUrl.hostname).catch((error) => {
      if (error instanceof WebsiteUrlSafetyError) throw error;
      return null;
    });
    if (homepageDocument) {
      for (const href of extractHomepageLinks(homepageDocument.body)) {
        addDiscoveryCandidate(candidates, new URL(href, homepageDocument.finalUrl), homepageUrl.hostname);
        if (candidates.size >= MAX_DISCOVERED_SOURCES) break;
      }
    }

    for (const route of obviousPublicRoutes(homepageUrl)) {
      addDiscoveryCandidate(candidates, route, homepageUrl.hostname);
      if (candidates.size >= MAX_DISCOVERED_SOURCES) break;
    }

    if (candidates.size < MAX_DISCOVERED_SOURCES) {
      for (const sitemapUrl of await this.discoverSitemapUrls(homepageUrl)) {
        addDiscoveryCandidate(candidates, sitemapUrl, homepageUrl.hostname);
        if (candidates.size >= MAX_DISCOVERED_SOURCES) break;
      }
    }

    return [...candidates.values()];
  }

  async collect(source: DiscoveredSource): Promise<WebsiteRawSnapshot> {
    const discovered = discoveredSourceSchema.parse(source);
    if (discovered.connectorType !== 'website' || !isSupportedCollectionType(discovered.sourceType)) {
      throw new WebsiteConnectorError('Website connector only collects supported deterministic website pages.');
    }

    const requestedUrl = normalizeHttpUrl(discovered.canonicalUrl);
    let currentUrl = requestedUrl;
    const redirects = [currentUrl.href];

    for (let redirectsFollowed = 0; redirectsFollowed <= MAX_REDIRECTS; redirectsFollowed += 1) {
      const address = await this.resolveAndAssertPublic(currentUrl);
      const response = await this.transport.request(currentUrl, address);

      if (isRedirect(response.statusCode)) {
        const location = getHeader(response.headers, 'location');
        if (!location) throw new WebsiteConnectorError('Website redirect did not include a Location header.');
        if (redirectsFollowed === MAX_REDIRECTS) throw new WebsiteConnectorError('Website exceeded redirect limit.');

        try {
          currentUrl = normalizeHttpUrl(new URL(location, currentUrl));
        } catch (error) {
          if (error instanceof WebsiteUrlSafetyError) throw error;
          throw new WebsiteConnectorError('Website redirect URL was invalid.');
        }
        redirects.push(currentUrl.href);
        continue;
      }

      return toRawSnapshot({
        requestedUrl,
        finalUrl: currentUrl,
        redirects,
        response,
        capturedAt: this.now(),
        sourceType: discovered.sourceType,
      });
    }

    throw new WebsiteConnectorError('Website collection could not resolve a final response.');
  }

  async normalize(snapshot: RawSnapshot): Promise<ObservationCandidate[]> {
    return extractWebsiteObservations(websiteRawSnapshotSchema.parse(snapshot));
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return connectorHealthSchema.parse({ status: 'healthy', checkedAt: this.now().toISOString() });
  }

  private async resolveAndAssertPublic(url: URL): Promise<ResolvedAddress> {
    assertSafeHostname(url.hostname);
    const addresses = await this.resolveHost(url.hostname);
    if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address.address))) {
      throw new WebsiteUrlSafetyError('Website target did not resolve to a public address.');
    }
    return addresses[0];
  }

  private async fetchDiscoveryDocument(startUrl: URL, expectedHostname: string): Promise<{ finalUrl: URL; body: string }> {
    let currentUrl = startUrl;

    for (let redirectsFollowed = 0; redirectsFollowed <= MAX_REDIRECTS; redirectsFollowed += 1) {
      if (!isSameRegistrableDomain(currentUrl.hostname, expectedHostname)) {
        throw new WebsiteUrlSafetyError('Website discovery redirect left the registrable domain.');
      }
      const address = await this.resolveAndAssertPublic(currentUrl);
      const response = await this.transport.request(currentUrl, address);
      if (isRedirect(response.statusCode)) {
        const location = getHeader(response.headers, 'location');
        if (!location) throw new WebsiteConnectorError('Website redirect did not include a Location header.');
        if (redirectsFollowed === MAX_REDIRECTS) throw new WebsiteConnectorError('Website exceeded redirect limit.');
        currentUrl = normalizeHttpUrl(new URL(location, currentUrl));
        continue;
      }

      const contentType = parseDiscoveryContentType(getHeader(response.headers, 'content-type'));
      if (!contentType) throw new WebsiteConnectorError('Website discovery response was not HTML or XML.');
      if (response.body.length > MAX_RESPONSE_BYTES) throw new WebsiteConnectorError('Website response exceeded the maximum size.');
      return { finalUrl: currentUrl, body: decodeHtml(response.body, 'utf-8') };
    }

    throw new WebsiteConnectorError('Website discovery could not resolve a final response.');
  }

  private async discoverSitemapUrls(homepageUrl: URL): Promise<URL[]> {
    const pending = [new URL('/sitemap.xml', homepageUrl), new URL('/sitemap_index.xml', homepageUrl)];
    const visited = new Set<string>();
    const pages: URL[] = [];

    while (pending.length > 0 && visited.size < MAX_SITEMAP_DOCUMENTS && pages.length < MAX_SITEMAP_URLS) {
      const sitemapUrl = pending.shift()!;
      if (visited.has(sitemapUrl.href)) continue;
      visited.add(sitemapUrl.href);

      const document = await this.fetchDiscoveryDocument(sitemapUrl, homepageUrl.hostname).catch((error) => {
        if (error instanceof WebsiteUrlSafetyError) throw error;
        return null;
      });
      if (!document) continue;
      const parsed = parseSitemap(document.body, document.finalUrl, homepageUrl.hostname);
      for (const indexUrl of parsed.indexes) {
        if (pending.length + visited.size < MAX_SITEMAP_DOCUMENTS) pending.push(indexUrl);
      }
      pages.push(...parsed.pages.slice(0, MAX_SITEMAP_URLS - pages.length));
    }

    return pages;
  }
}

class NodeWebsiteHttpTransport implements WebsiteHttpTransport {
  request(url: URL, address: ResolvedAddress): Promise<WebsiteHttpResponse> {
    const requestOptions: RequestOptions = {
      hostname: url.hostname,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'RivalLens/0.1 website snapshot collector',
      },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    };
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      let settled = false;
      const request = requestFn(requestOptions, (response) => {
        const chunks: Buffer[] = [];
        let byteLength = 0;

        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += buffer.length;
          if (byteLength > MAX_RESPONSE_BYTES) {
            request.destroy(new WebsiteConnectorError('Website response exceeded the maximum size.'));
            return;
          }
          chunks.push(buffer);
        });
        response.on('error', reject);
        response.on('end', () => {
          if (!settled) {
            settled = true;
            resolve({ statusCode: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) });
          }
        });
      });

      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new WebsiteConnectorError('Website request timed out.'));
      });
      request.on('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      request.end();
    });
  }
}

function addDiscoveryCandidate(candidates: Map<string, DiscoveredSource>, value: URL, expectedHostname: string) {
  try {
    const url = normalizeDiscoveredPageUrl(value, expectedHostname);
    if (isLocaleNavigationPath(url.pathname)) return;
    if (!candidates.has(url.href) && candidates.size >= MAX_DISCOVERED_SOURCES) return;
    candidates.set(
      url.href,
      discoveredSourceSchema.parse({
        connectorType: 'website',
        sourceType: classifyWebsitePage(url),
        canonicalUrl: url.href,
      }),
    );
  } catch (error) {
    if (!(error instanceof WebsiteUrlSafetyError)) throw error;
  }
}

function extractHomepageLinks(html: string): string[] {
  const $ = load(html);
  return $('a[href]')
    .toArray()
    .slice(0, MAX_HOMEPAGE_LINKS)
    .map((element) => $(element).attr('href'))
    .filter((href): href is string => Boolean(href));
}

function obviousPublicRoutes(homepageUrl: URL): URL[] {
  return [
    '/products',
    '/collections',
    '/pages/about',
    '/about',
    '/pages/reviews',
    '/pages/shipping-returns',
    '/pages/subscriptions',
    '/pages/offers',
  ].map((path) => new URL(path, homepageUrl));
}

function parseSitemap(xml: string, baseUrl: URL, expectedHostname: string): { indexes: URL[]; pages: URL[] } {
  const $ = load(xml, { xmlMode: true });
  const toSafeUrl = (value: string | undefined) => {
    if (!value) return null;
    try {
      return normalizeDiscoveredPageUrl(new URL(value.trim(), baseUrl), expectedHostname);
    } catch {
      return null;
    }
  };

  return {
    indexes: $('sitemap > loc')
      .toArray()
      .map((element) => toSafeUrl($(element).text()))
      .filter((url): url is URL => url !== null),
    pages: $('url > loc')
      .toArray()
      .map((element) => toSafeUrl($(element).text()))
      .filter((url): url is URL => url !== null),
  };
}

export function classifyWebsitePage(url: URL): string {
  const path = url.pathname.toLowerCase();
  if (path === '/') return 'homepage';
  if (/\/(products?|shop)\//.test(path) || /\/(products?)$/.test(path)) return 'product';
  if (/\/(collections?|categories?)\b/.test(path)) return 'collection';
  if (/\/(pricing|plans?|offers?|sale|deals?|bundles?)\b/.test(path)) return 'pricing_offers';
  if (/^\/(?:pages\/)?(about|our-story|story)(?:\/|$)/.test(path)) return 'about';
  if (/\/(reviews?|testimonials?)\b/.test(path)) return 'reviews_testimonials';
  if (/\/(shipping|returns?|refunds?)\b/.test(path)) return 'shipping_returns';
  if (/\/(subscriptions?|subscribe|membership)\b/.test(path)) return 'subscription';
  return 'unknown';
}

async function resolvePublicHostname(hostname: string): Promise<ResolvedAddress[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
}

function toRawSnapshot(input: {
  requestedUrl: URL;
  finalUrl: URL;
  redirects: string[];
  response: WebsiteHttpResponse;
  capturedAt: Date;
  sourceType: string;
}): WebsiteRawSnapshot {
  if (input.response.body.length > MAX_RESPONSE_BYTES) {
    throw new WebsiteConnectorError('Website response exceeded the maximum size.');
  }
  const contentTypeHeader = getHeader(input.response.headers, 'content-type');
  const { contentType, charset } = parseHtmlContentType(contentTypeHeader);
  const html = decodeHtml(input.response.body, charset);

  return websiteRawSnapshotSchema.parse({
    connectorType: 'website',
    sourceType: input.sourceType,
    canonicalUrl: input.finalUrl.href,
    capturedAt: input.capturedAt.toISOString(),
    rawContentHash: sha256(input.response.body),
    contentHash: sha256(Buffer.from(normalizeHtmlForHash(html), 'utf8')),
    content: { html, rawBodyBase64: input.response.body.toString('base64') },
    metadata: {
      requestedUrl: input.requestedUrl.href,
      finalUrl: input.finalUrl.href,
      redirects: input.redirects,
      httpStatus: input.response.statusCode,
      contentType,
      charset,
      byteLength: input.response.body.length,
      collectorVersion: COLLECTOR_VERSION,
      normalizerVersion: NORMALIZER_VERSION,
    },
  });
}

function isSupportedCollectionType(sourceType: string) {
  return ['homepage', 'product', 'pricing_offers', 'shipping_returns', 'subscription'].includes(sourceType);
}

function parseHtmlContentType(value: string | undefined) {
  if (!value) throw new WebsiteConnectorError('Website response did not include a Content-Type header.');
  const contentType = value.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'text/html' && contentType !== 'application/xhtml+xml') {
    throw new WebsiteConnectorError('Website response was not HTML.');
  }
  const charsetMatch = value.match(/charset\s*=\s*"?([^;"\s]+)/i);
  return { contentType, charset: charsetMatch?.[1]?.toLowerCase() ?? 'utf-8' };
}

function parseDiscoveryContentType(value: string | undefined) {
  if (!value) return null;
  const contentType = value.split(';', 1)[0].trim().toLowerCase();
  return ['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml'].includes(contentType) ? contentType : null;
}

function decodeHtml(body: Buffer, charset: string) {
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    throw new WebsiteConnectorError(`Website response used an unsupported charset: ${charset}.`);
  }
}

function normalizeHtmlForHash(html: string) {
  const $ = load(html);
  $('script, style, noscript, template, iframe, svg, nav, header, footer').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function sha256(value: Buffer) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function getHeader(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isRedirect(statusCode: number) {
  return [301, 302, 303, 307, 308].includes(statusCode);
}
