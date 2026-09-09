import { describe, expect, it } from 'vitest';
import {
  normalizeHomepageUrl,
  normalizeDiscoveredPageUrl,
  classifyWebsitePage,
  createPinnedAddressLookup,
  WebsiteConnector,
  WebsiteConnectorError,
  WebsiteUrlSafetyError,
  type ResolvedAddress,
  type WebsiteHttpResponse,
  type WebsiteHttpTransport,
} from '../../packages/connectors/src/website';
import { buildWebsiteArtifactPath } from '../../packages/domain/src';
import { websiteRawSnapshotSchema } from '../../packages/schemas/src';

const publicAddress: ResolvedAddress = { address: '93.184.216.34', family: 4 };
const source = {
  connectorType: 'website',
  sourceType: 'homepage',
  canonicalUrl: 'https://example.com/',
};

function response(statusCode: number, headers: WebsiteHttpResponse['headers'], html: string): WebsiteHttpResponse {
  return { statusCode, headers, body: Buffer.from(html, 'utf8') };
}

function connector(transport: WebsiteHttpTransport, addresses = [publicAddress]) {
  return new WebsiteConnector({
    now: () => new Date('2026-09-01T12:00:00.000Z'),
    resolveHost: async () => addresses,
    transport,
  });
}

describe('website connector URL safety', () => {
  it('normalizes a domain to an HTTPS homepage', () => {
    expect(normalizeHomepageUrl('Example.COM/path?campaign=one#section').href).toBe('https://example.com/');
  });

  it('discovers one canonical homepage source without page discovery', async () => {
    const client = connector({ request: async () => response(200, { 'content-type': 'text/html' }, '<html>ok</html>') });
    await expect(
      client.discoverHomepage({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'Example.COM' }),
    ).resolves.toEqual([source]);
  });

  it.each(['ftp://example.com', 'https://user:password@example.com', 'https://example.com:8443', 'http://127.0.0.1'])
  ('rejects unsafe URL %s', async (url) => {
    const client = connector({ request: async () => response(200, { 'content-type': 'text/html' }, '<html>ok</html>') });
    await expect(client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: url })).rejects.toBeInstanceOf(
      WebsiteUrlSafetyError,
    );
  });

  it('rejects hostnames that resolve to a private address', async () => {
    const client = connector(
      { request: async () => response(200, { 'content-type': 'text/html' }, '<html>ok</html>') },
      [{ address: '10.0.0.1', family: 4 }],
    );

    await expect(
      client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'example.com' }),
    ).rejects.toBeInstanceOf(WebsiteUrlSafetyError);
  });

  it('canonicalizes discovery URLs and rejects off-domain targets', () => {
    expect(normalizeDiscoveredPageUrl('https://shop.example.com/products/shoe/?utm_source=email#details', 'example.com').href).toBe(
      'https://shop.example.com/products/shoe',
    );
    expect(() => normalizeDiscoveredPageUrl('https://other.test/products/shoe', 'example.com')).toThrow(WebsiteUrlSafetyError);
    expect(() => normalizeDiscoveredPageUrl('http://127.0.0.1/products/shoe', 'example.com')).toThrow(WebsiteUrlSafetyError);
  });
});

describe('website connector DNS pinning', () => {
  it('returns an address list when Node 22 requests lookup with all:true', () => {
    const lookup = createPinnedAddressLookup(publicAddress);
    let err: NodeJS.ErrnoException | null | undefined;
    let addresses: unknown;
    lookup('example.com', { all: true }, ((error: NodeJS.ErrnoException | null, value: unknown) => {
      err = error;
      addresses = value;
    }) as never);

    expect(err).toBeNull();
    expect(addresses).toEqual([{ address: publicAddress.address, family: 4 }]);
  });

  it('returns a single address when lookup does not request all results', () => {
    const lookup = createPinnedAddressLookup(publicAddress);
    let err: NodeJS.ErrnoException | null | undefined;
    let address: unknown;
    let family: unknown;
    lookup('example.com', { all: false }, ((error: NodeJS.ErrnoException | null, value: unknown, valueFamily?: number) => {
      err = error;
      address = value;
      family = valueFamily;
    }) as never);

    expect(err).toBeNull();
    expect(address).toBe(publicAddress.address);
    expect(family).toBe(4);
  });
});

describe('website connector collection', () => {
  it('collects a selected product source without changing its canonical path', async () => {
    const client = connector({ request: async () => response(200, { 'content-type': 'text/html' }, '<h1>Product</h1>') });
    const snapshot = await client.collect({ connectorType: 'website', sourceType: 'product', canonicalUrl: 'https://example.com/products/widget' });

    expect(snapshot.sourceType).toBe('product');
    expect(snapshot.metadata.requestedUrl).toBe('https://example.com/products/widget');
  });

  it('follows validated redirects and produces a validated raw snapshot', async () => {
    const requests: string[] = [];
    const client = connector({
      request: async (url) => {
        requests.push(url.href);
        if (url.hostname === 'example.com') return response(302, { location: 'https://www.example.com/' }, '');
        return response(200, { 'content-type': 'text/html; charset=utf-8' }, '<html><body><h1>Store</h1></body></html>');
      },
    });

    const snapshot = websiteRawSnapshotSchema.parse(await client.collect(source));

    expect(requests).toEqual(['https://example.com/', 'https://www.example.com/']);
    expect(snapshot.canonicalUrl).toBe('https://www.example.com/');
    expect(snapshot.metadata.redirects).toEqual(['https://example.com/', 'https://www.example.com/']);
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot.content.rawBodyBase64).toBeTruthy();
    expect(() =>
      websiteRawSnapshotSchema.parse({ ...snapshot, content: { ...snapshot.content, rawBodyBase64: 'not-base64' } }),
    ).toThrow();
  });

  it('rejects a redirect to a private destination', async () => {
    const client = connector({
      request: async () => response(302, { location: 'http://127.0.0.1/' }, ''),
    });

    await expect(client.collect(source)).rejects.toBeInstanceOf(WebsiteUrlSafetyError);
  });

  it('rejects non-HTML responses', async () => {
    const client = connector({ request: async () => response(200, { 'content-type': 'application/json' }, '{}') });
    await expect(client.collect(source)).rejects.toBeInstanceOf(WebsiteConnectorError);
  });

  it('rejects oversized responses before creating a snapshot', async () => {
    const client = connector({
      request: async () => response(200, { 'content-type': 'text/html' }, 'x'.repeat(2 * 1024 * 1024 + 1)),
    });
    await expect(client.collect(source)).rejects.toBeInstanceOf(WebsiteConnectorError);
  });

  it('keeps raw hashes forensic while stabilizing normalized content hashes', async () => {
    const noisyFirst = '<html><body><header>Navigation</header><h1>Store</h1><script>one()</script></body></html>';
    const noisySecond = '<html><body><header>Changed nav</header><h1>Store</h1><script>two()</script></body></html>';
    const first = await connector({ request: async () => response(200, { 'content-type': 'text/html' }, noisyFirst) }).collect(source);
    const second = await connector({ request: async () => response(200, { 'content-type': 'text/html' }, noisySecond) }).collect(source);

    expect(first.rawContentHash).not.toBe(second.rawContentHash);
    expect(first.contentHash).toBe(second.contentHash);
  });

  it('returns no observation candidates in the raw-snapshot slice', async () => {
    const client = connector({ request: async () => response(200, { 'content-type': 'text/html' }, '<html>ok</html>') });
    expect(await client.normalize(await client.collect(source))).toEqual([]);
  });
});

describe('website page discovery', () => {
  it('discovers, classifies, and deduplicates safe homepage links', async () => {
    const client = connector({
      request: async () =>
        response(
          200,
          { 'content-type': 'text/html' },
          `<a href="/products/widget/?utm_source=email">Widget</a>
           <a href="/products/widget#reviews">Widget duplicate</a>
           <a href="/collections/summer/">Summer</a>
           <a href="/en/">English</a>
           <a href="https://other.test/about">Off domain</a>`,
        ),
    });

    const sources = await client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'example.com' });
    expect(sources).toEqual(
      expect.arrayContaining([
        source,
        { connectorType: 'website', sourceType: 'product', canonicalUrl: 'https://example.com/products/widget' },
        { connectorType: 'website', sourceType: 'collection', canonicalUrl: 'https://example.com/collections/summer' },
      ]),
    );
    expect(sources.some((item) => item.canonicalUrl.includes('other.test') || item.canonicalUrl === 'https://example.com/en')).toBe(false);
  });

  it('reads a sitemap index without recursively crawling page links', async () => {
    const requests: string[] = [];
    const client = connector({
      request: async (url) => {
        requests.push(url.pathname);
        if (url.pathname === '/sitemap.xml') {
          return response(200, { 'content-type': 'application/xml' }, '<sitemapindex><sitemap><loc>/products.xml</loc></sitemap></sitemapindex>');
        }
        if (url.pathname === '/products.xml') {
          return response(
            200,
            { 'content-type': 'application/xml' },
            '<urlset><url><loc>/products/one/</loc></url><url><loc>https://evil.test/product</loc></url></urlset>',
          );
        }
        return response(200, { 'content-type': 'text/html' }, '<html><body>Home</body></html>');
      },
    });

    const sources = await client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'example.com' });
    expect(requests).toEqual(expect.arrayContaining(['/', '/sitemap.xml', '/products.xml']));
    expect(sources).toContainEqual({ connectorType: 'website', sourceType: 'product', canonicalUrl: 'https://example.com/products/one' });
    expect(sources.some((item) => item.canonicalUrl.includes('evil.test'))).toBe(false);
  });

  it('rejects an unsafe homepage redirect before discovery persists candidates', async () => {
    const client = connector({
      request: async () => response(302, { location: 'http://127.0.0.1/internal' }, ''),
    });

    await expect(
      client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'example.com' }),
    ).rejects.toBeInstanceOf(WebsiteUrlSafetyError);
  });

  it('keeps discovery bounded when the homepage contains many links', async () => {
    const links = Array.from({ length: 200 }, (_, index) => `<a href="/products/${index}">Product</a>`).join('');
    const client = connector({ request: async () => response(200, { 'content-type': 'text/html' }, links) });

    const sources = await client.discover({ subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170', canonicalUrl: 'example.com' });
    expect(sources.length).toBeLessThanOrEqual(40);
  });

  it('traverses bounded collection hubs to discover product PDP candidates', async () => {
    const client = connector({
      request: async (url) => {
        if (url.pathname === '/') {
          return response(
            200,
            { 'content-type': 'text/html' },
            `<html><body>
               <a href="/collections/wallets">Wallets Collection</a>
               <a href="/collections/straps">Straps Collection</a>
             </body></html>`,
          );
        }
        if (url.pathname === '/collections/wallets') {
          return response(
            200,
            { 'content-type': 'text/html' },
            `<html><body>
               <a href="/products/elastic-wallet">Elastic Wallet</a>
               <a href="/products/bifold-wallet">Bifold Wallet</a>
             </body></html>`,
          );
        }
        if (url.pathname === '/collections/straps') {
          return response(
            200,
            { 'content-type': 'text/html' },
            `<html><body>
               <a href="/products/wrist-lanyard">Wrist Lanyard</a>
             </body></html>`,
          );
        }
        return response(404, { 'content-type': 'text/html' }, 'Not Found');
      },
    });

    const sources = await client.discover({
      subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170',
      canonicalUrl: 'example.com',
    });

    expect(sources).toContainEqual({
      connectorType: 'website',
      sourceType: 'product',
      canonicalUrl: 'https://example.com/products/elastic-wallet',
    });
    expect(sources).toContainEqual({
      connectorType: 'website',
      sourceType: 'product',
      canonicalUrl: 'https://example.com/products/bifold-wallet',
    });
    expect(sources).toContainEqual({
      connectorType: 'website',
      sourceType: 'product',
      canonicalUrl: 'https://example.com/products/wrist-lanyard',
    });
  });

  it('prevents discovery starvation on navigation-heavy sites and discovers products from collection hubs', async () => {
    const collectionLinks = Array.from({ length: 50 }, (_, i) => `<a href="/collections/cat-${i}">Category ${i}</a>`).join('');
    const journalLinks = Array.from({ length: 20 }, (_, i) => `<a href="/journal/story-${i}">Story ${i}</a>`).join('');

    const client = connector({
      request: async (url) => {
        if (url.pathname === '/') {
          return response(200, { 'content-type': 'text/html' }, `<html><body>${collectionLinks}${journalLinks}</body></html>`);
        }
        if (url.pathname.startsWith('/collections/cat-')) {
          const catNum = url.pathname.split('/collections/cat-')[1];
          return response(
            200,
            { 'content-type': 'text/html' },
            `<html><body>
               <a href="/products/product-${catNum}-a">Product A</a>
               <a href="/products/product-${catNum}-b">Product B</a>
             </body></html>`,
          );
        }
        return response(404, { 'content-type': 'text/html' }, 'Not Found');
      },
    });

    const sources = await client.discover({
      subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170',
      canonicalUrl: 'example.com',
    });

    expect(sources.length).toBeLessThanOrEqual(40);
    const productSources = sources.filter((s) => s.sourceType === 'product');
    const collectionSources = sources.filter((s) => s.sourceType === 'collection');

    expect(productSources.length).toBeGreaterThanOrEqual(2);
    expect(collectionSources.length).toBeLessThanOrEqual(8);
  });

  it('bounds collection hubs fetched during traversal to at most 3', async () => {
    const fetchedHubs: string[] = [];
    const collectionLinks = Array.from({ length: 15 }, (_, i) => `<a href="/collections/hub-${i}">Hub ${i}</a>`).join('');

    const client = connector({
      request: async (url) => {
        if (url.pathname === '/') {
          return response(200, { 'content-type': 'text/html' }, `<html><body>${collectionLinks}</body></html>`);
        }
        if (url.pathname.startsWith('/collections/hub-')) {
          fetchedHubs.push(url.pathname);
          return response(
            200,
            { 'content-type': 'text/html' },
            `<html><body><a href="/products/item-${fetchedHubs.length}">Item</a></body></html>`,
          );
        }
        return response(404, { 'content-type': 'text/html' }, 'Not Found');
      },
    });

    const sources = await client.discover({
      subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170',
      canonicalUrl: 'example.com',
    });

    expect(fetchedHubs.length).toBeLessThanOrEqual(3);
    expect(sources.length).toBeLessThanOrEqual(40);
  });

  it('does not restrict direct product discovery on sites with many direct homepage PDP links', async () => {
    const productLinks = Array.from({ length: 35 }, (_, i) => `<a href="/products/direct-${i}">Product ${i}</a>`).join('');

    const client = connector({
      request: async (url) => {
        if (url.pathname === '/') {
          return response(200, { 'content-type': 'text/html' }, `<html><body>${productLinks}</body></html>`);
        }
        return response(404, { 'content-type': 'text/html' }, 'Not Found');
      },
    });

    const sources = await client.discover({
      subjectId: '5a7b618a-fd34-4d62-a3d2-d2bf6f867170',
      canonicalUrl: 'example.com',
    });

    const productSources = sources.filter((s) => s.sourceType === 'product');
    expect(productSources.length).toBe(35);
    expect(sources.length).toBeLessThanOrEqual(40);
  });


  it.each([
    ['/products/widget', 'product'],
    ['/collections/summer', 'collection'],
    ['/products/category/wallets', 'collection'],
    ['/products/category/travel', 'collection'],
    ['/products/categories/bags', 'collection'],
    ['/products/collections/wallets', 'collection'],
    ['/products', 'collection'],
    ['/products/', 'collection'],
    ['/shop', 'collection'],
    ['/collections/wallets/products/slim-sleeve', 'product'],
    ['/products/hide-and-seek-wallet', 'product'],
    ['/pages/offers', 'pricing_offers'],
    ['/about', 'about'],
    ['/reviews', 'reviews_testimonials'],
    ['/policies/shipping', 'shipping_returns'],
    ['/subscriptions', 'subscription'],
    ['/journal/story', 'unknown'],
  ])('classifies %s as %s', (path, pageType) => {
    expect(classifyWebsitePage(new URL(path, 'https://example.com'))).toBe(pageType);
  });
});

describe('website snapshot persistence inputs', () => {
  it('builds an organization-scoped immutable artifact path', () => {
    expect(
      buildWebsiteArtifactPath({
        organizationId: '11111111-1111-1111-1111-111111111111',
        subjectId: '22222222-2222-2222-2222-222222222222',
        sourceId: '33333333-3333-3333-3333-333333333333',
        snapshotId: '44444444-4444-4444-4444-444444444444',
      }),
    ).toBe('11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/web/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444.html.gz');
  });
});
