import { describe, expect, it } from 'vitest';
import { extractWebsiteObservations } from '../../packages/connectors/src/website';
import { websiteObservationCandidateSchema, websiteRawSnapshotSchema } from '../../packages/schemas/src';

const timestamp = '2026-09-01T12:00:00.000Z';
const hash = `sha256:${'a'.repeat(64)}`;

function snapshot(sourceType: 'homepage' | 'product' | 'pricing_offers' | 'shipping_returns' | 'subscription', html: string) {
  return websiteRawSnapshotSchema.parse({
    connectorType: 'website',
    sourceType,
    canonicalUrl: `https://example.com/${sourceType === 'homepage' ? '' : sourceType}`,
    capturedAt: timestamp,
    rawContentHash: hash,
    contentHash: hash,
    content: { html, rawBodyBase64: Buffer.from(html).toString('base64') },
    metadata: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      redirects: ['https://example.com/'],
      httpStatus: 200,
      contentType: 'text/html',
      charset: 'utf-8',
      byteLength: html.length,
      collectorVersion: 'test',
      normalizerVersion: 'test',
    },
  });
}

function fact(candidates: ReturnType<typeof extractWebsiteObservations>, factType: string) {
  return candidates.filter((candidate) => candidate.factType === factType);
}

describe('deterministic website extraction', () => {
  it('prefers JSON-LD Product facts over conflicting DOM values', () => {
    const candidates = extractWebsiteObservations(snapshot('product', `
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"JSON-LD Serum","url":"https://example.com/products/serum","offers":{"@type":"Offer","price":"48.00","priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>
      <h1>Wrong DOM name</h1><span class="price">$99.00</span><del>$120.00</del>`));

    expect(fact(candidates, 'product.name')).toContainEqual(expect.objectContaining({ payload: { name: 'JSON-LD Serum', canonicalUrl: 'https://example.com/products/serum' }, extractionMethod: 'json_ld' }));
    expect(fact(candidates, 'product.price')).toContainEqual(expect.objectContaining({ payload: { currentPrice: 48, currency: 'USD' }, extractionMethod: 'json_ld' }));
    expect(fact(candidates, 'product.price')).toContainEqual(expect.objectContaining({ payload: { compareAtPrice: 120, currency: 'USD' } }));
    expect(fact(candidates, 'product.availability')).toContainEqual(expect.objectContaining({ payload: { availability: 'in_stock' }, extractionMethod: 'json_ld' }));
  });

  it('uses explicit semantic DOM and meta values when JSON-LD is absent', () => {
    const candidates = extractWebsiteObservations(snapshot('product', `
      <meta property="og:title" content="Cloud Pillow">
      <meta property="product:price:amount" content="79.00"><meta property="product:price:currency" content="USD">
      <div itemprop="availability" content="OutOfStock"></div><span data-compare-at-price="$99.00">$99.00</span>`));

    expect(fact(candidates, 'product.name')[0]).toMatchObject({ extractionMethod: 'meta', payload: { name: 'Cloud Pillow' } });
    expect(fact(candidates, 'product.price')[0]).toMatchObject({ extractionMethod: 'meta', payload: { currentPrice: 79, currency: 'USD' } });
    expect(fact(candidates, 'product.availability')[0]).toMatchObject({ payload: { availability: 'out_of_stock' } });
  });

  it('extracts explicit discounts, promotions, bundles, buy-X-get-Y, and shipping thresholds', () => {
    const candidates = extractWebsiteObservations(snapshot('pricing_offers', `
      <main>Save 20% off with promo code: GLOW20. Get $10 off today. Try our starter bundle. Buy 2 get 1 free. Free shipping on orders over $75.</main>`));

    expect(fact(candidates, 'offer.discount')).toHaveLength(2);
    expect(fact(candidates, 'offer.promo')[0]?.payload).toMatchObject({ code: 'GLOW20' });
    expect(fact(candidates, 'offer.bundle')).toHaveLength(1);
    expect(fact(candidates, 'offer.buy_x_get_y')).toHaveLength(1);
    expect(fact(candidates, 'offer.free_shipping')[0]?.payload).toMatchObject({ threshold: 75 });
  });

  it('extracts explicit subscription and policy facts without inference', () => {
    const subscription = extractWebsiteObservations(snapshot('subscription', '<main>Subscribe & save 15% off. Delivered every 2 months.</main>'));
    const policy = extractWebsiteObservations(snapshot('shipping_returns', '<main>Our 60-day money-back guarantee. Returns within 30 days.</main>'));

    expect(fact(subscription, 'subscription.details')[0]?.payload).toMatchObject({ available: true, discountPercent: 15, frequency: '2 months' });
    expect(fact(policy, 'policy.guarantee')[0]?.payload).toMatchObject({ duration: 60, unit: 'days' });
    expect(fact(policy, 'policy.return_window')[0]?.payload).toMatchObject({ duration: 30, unit: 'days' });
  });

  it('extracts homepage positioning from semantic elements', () => {
    const candidates = extractWebsiteObservations(snapshot('homepage', '<main><h1>Better sleep, naturally.</h1><p>Plant-powered nightly support.</p><a href="/products">Shop now</a></main>'));
    expect(fact(candidates, 'positioning.homepage')[0]).toMatchObject({ payload: { headline: 'Better sleep, naturally.', subheadline: 'Plant-powered nightly support.', primaryCta: 'Shop now' } });
  });

  it('skips malformed structured data and unsupported missing facts', () => {
    const candidates = extractWebsiteObservations(snapshot('product', '<script type="application/ld+json">{broken</script><main>No price or product details.</main>'));
    expect(candidates).toEqual([]);
  });

  it('validates candidates and keeps them free of persistence IDs', () => {
    const candidate = fact(extractWebsiteObservations(snapshot('homepage', '<h1>Headline</h1>')), 'positioning.homepage')[0]!;
    expect(websiteObservationCandidateSchema.parse(candidate)).not.toHaveProperty('snapshotId');
    expect(() => websiteObservationCandidateSchema.parse({ ...candidate, extractionMethod: 'ai' })).toThrow();
  });

  it('never extracts positive subscription availability from negated subscription language', () => {
    const cases = [
      '<main>No subscription, ever</main>',
      '<main>Without a subscription, our tracker works anywhere.</main>',
      '<main>Subscription not required for any smart features.</main>',
      '<main>Never requires a subscription to locate your wallet.</main>',
      '<main>Zero subscriptions needed. 100% free tracking app.</main>',
    ];

    for (const html of cases) {
      const candidates = extractWebsiteObservations(snapshot('product', html));
      const subs = fact(candidates, 'subscription.details');
      expect(subs.filter((candidate) => candidate.payload.available === true)).toHaveLength(0);
    }
  });

  it('does not fabricate promo codes from nearby headings or arbitrary copy', () => {
    const cases = [
      '<main><h3>Promo Codes</h3><p>Everything you love about smart wallets.</p></main>',
      '<main><span>Promo Codes</span><span>Everything on sale</span></main>',
      '<main><p>Enter coupon codes at checkout for discounts.</p></main>',
      '<main><p>Check our promo codes before checkout.</p></main>',
    ];

    for (const html of cases) {
      const candidates = extractWebsiteObservations(snapshot('pricing_offers', html));
      const promos = fact(candidates, 'offer.promo');
      expect(promos).toHaveLength(0);
    }
  });
});
