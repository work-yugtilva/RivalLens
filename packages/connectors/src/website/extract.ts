import { load } from 'cheerio';
import {
  websiteObservationCandidateSchema,
  websiteRawSnapshotSchema,
  type WebsiteObservationCandidate,
  type WebsiteRawSnapshot,
} from '@rivallens/schemas';

const EXTRACTOR_VERSION = 'website-deterministic-v1';

export function extractWebsiteObservations(rawSnapshot: WebsiteRawSnapshot): WebsiteObservationCandidate[] {
  const snapshot = websiteRawSnapshotSchema.parse(rawSnapshot);
  const $ = load(snapshot.content.html);
  const candidates = new Map<string, WebsiteObservationCandidate>();
  const observedAt = snapshot.capturedAt;
  const sourceUrl = snapshot.canonicalUrl;
  const products = jsonLdProducts($);
  const product = products[0];

  if (snapshot.sourceType === 'product') {
    extractProductFacts({ $, product, sourceUrl, observedAt, candidates });
  }
  if (['homepage', 'product', 'pricing_offers'].includes(snapshot.sourceType)) {
    extractOfferFacts({ $, sourceUrl, observedAt, candidates });
  }
  if (['homepage', 'product', 'subscription'].includes(snapshot.sourceType)) {
    extractSubscriptionFacts({ $, sourceUrl, observedAt, candidates });
  }
  if (snapshot.sourceType === 'shipping_returns') {
    extractPolicyFacts({ $, sourceUrl, observedAt, candidates });
  }
  if (snapshot.sourceType === 'homepage') {
    extractHomepagePositioning({ $, sourceUrl, observedAt, candidates });
  }

  return [...candidates.values()];
}

function extractProductFacts(input: ExtractionInput & { product: Record<string, unknown> | undefined }) {
  const { $, product, sourceUrl, observedAt, candidates } = input;
  const offer = objectValues(product?.offers)[0];
  const name = stringValue(product?.name);
  const productUrl = urlValue(product?.url) ?? sourceUrl;
  if (name) {
    addCandidate(candidates, {
      factType: 'product.name',
      observedAt,
      sourceUrl,
      payload: { name, canonicalUrl: productUrl },
      extractionMethod: 'json_ld',
      confidence: 0.95,
      extractorVersion: EXTRACTOR_VERSION,
    });
  } else {
    const metaName = $('meta[property="og:title"]').attr('content')?.trim();
    const domName = $('h1').first().text().trim();
    const fallback = metaName || domName;
    const canonicalUrl = resolvedUrl($('link[rel="canonical"]').attr('href'), sourceUrl) ?? sourceUrl;
    if (fallback) {
      addCandidate(candidates, {
        factType: 'product.name',
        observedAt,
        sourceUrl,
        payload: { name: fallback, canonicalUrl },
        extractionMethod: metaName ? 'meta' : 'dom',
        confidence: metaName ? 0.85 : 0.8,
        extractorVersion: EXTRACTOR_VERSION,
      });
    }
  }

  const price = decimalValue(offer?.price);
  const currency = stringValue(offer?.priceCurrency);
  if (price) {
    addCandidate(candidates, {
      factType: 'product.price',
      observedAt,
      sourceUrl,
      payload: { currentPrice: price, ...(currency ? { currency } : {}) },
      extractionMethod: 'json_ld',
      confidence: currency ? 0.95 : 0.9,
      extractorVersion: EXTRACTOR_VERSION,
    });
  } else {
    const domPrice = explicitPrice($('[itemprop="price"]').first().attr('content') || $('[itemprop="price"]').first().text() || $('.price').first().text());
    const metaPrice = explicitPrice($('meta[property="product:price:amount"]').attr('content'));
    const fallbackPrice = metaPrice ?? domPrice;
    const fallbackCurrency = $('meta[property="product:price:currency"]').attr('content')?.trim() || currencyFromText($('.price').first().text());
    if (fallbackPrice) {
      addCandidate(candidates, {
        factType: 'product.price',
        observedAt,
        sourceUrl,
        payload: { currentPrice: fallbackPrice, ...(fallbackCurrency ? { currency: fallbackCurrency } : {}) },
        extractionMethod: metaPrice ? 'meta' : 'dom',
        confidence: metaPrice ? 0.85 : 0.8,
        extractorVersion: EXTRACTOR_VERSION,
      });
    }
  }

  const compareAt = explicitPrice(
    $('[data-compare-at-price]').first().attr('data-compare-at-price') || $('[data-compare-at-price]').first().text() || $('del, s').first().text(),
  );
  if (compareAt) {
    addCandidate(candidates, {
      factType: 'product.price',
      observedAt,
      sourceUrl,
      payload: { compareAtPrice: compareAt, ...(currency ? { currency } : {}) },
      extractionMethod: 'dom',
      confidence: 0.8,
      extractorVersion: EXTRACTOR_VERSION,
    });
  }

  const availability = availabilityValue(offer?.availability) ?? availabilityValue($('[itemprop="availability"]').attr('content')) ?? availabilityValue($('.availability').text());
  if (availability) {
    addCandidate(candidates, {
      factType: 'product.availability',
      observedAt,
      sourceUrl,
      payload: { availability },
      extractionMethod: offer?.availability ? 'json_ld' : 'dom',
      confidence: offer?.availability ? 0.95 : 0.8,
      extractorVersion: EXTRACTOR_VERSION,
    });
  }
}

function extractOfferFacts(input: ExtractionInput) {
  const text = bodyText(input.$);
  for (const match of text.matchAll(/\b(\d{1,2})%\s*(?:off|discount)\b/gi)) {
    addCandidate(input.candidates, candidate(input, 'offer.discount', { type: 'percentage', amount: Number(match[1]), text: match[0] }, 0.8));
  }
  for (const match of text.matchAll(/(?:\$|€|£)\s*(\d+(?:\.\d{1,2})?)\s*(?:off|discount)\b/gi)) {
    addCandidate(input.candidates, candidate(input, 'offer.discount', { type: 'fixed', amount: Number(match[1]), text: match[0] }, 0.8));
  }
  for (const match of text.matchAll(/(?:promo(?:tional)?|coupon)\s*code\s*[:-]?\s*([A-Z0-9-]{3,})|\bcode\s*[:-]\s*([A-Z0-9-]{3,})/gi)) {
    addCandidate(input.candidates, candidate(input, 'offer.promo', { code: (match[1] || match[2]).toUpperCase(), text: match[0] }, 0.8));
  }
  for (const match of text.matchAll(/\b(?:buy\s+\d+\s+(?:and\s+)?get\s+\d+|buy\s+one\s+get\s+one)\b[^.!?]*/gi)) {
    addCandidate(input.candidates, candidate(input, 'offer.buy_x_get_y', { text: match[0].trim() }, 0.75));
  }
  for (const match of text.matchAll(/\b(?:bundle|bundles)\b[^.!?]*/gi)) {
    addCandidate(input.candidates, candidate(input, 'offer.bundle', { text: match[0].trim() }, 0.75));
  }
  for (const match of text.matchAll(/free\s+shipping\s+(?:on|for)\s+(?:orders?\s+)?(?:over|above|of)\s+((?:\$|€|£)\s*\d+(?:\.\d{1,2})?)/gi)) {
    const threshold = explicitPrice(match[1]);
    if (threshold) addCandidate(input.candidates, candidate(input, 'offer.free_shipping', { threshold, text: match[0] }, 0.8));
  }
}

function extractSubscriptionFacts(input: ExtractionInput) {
  const text = bodyText(input.$);
  const discount = text.match(/(?:subscribe\s*(?:&|and)\s*save|subscription)\D{0,40}?(\d{1,2})%\s*(?:off|save)/i);
  const frequency = text.match(/\b(?:every|delivered\s+every)\s+(\d+\s*(?:week|weeks|month|months))\b/i);
  if (discount || frequency || /subscribe\s*(?:&|and)\s*save|subscription/i.test(text)) {
    addCandidate(input.candidates, candidate(input, 'subscription.details', {
      available: true,
      ...(discount ? { discountPercent: Number(discount[1]) } : {}),
      ...(frequency ? { frequency: frequency[1] } : {}),
    }, discount ? 0.8 : 0.75));
  }
}

function extractPolicyFacts(input: ExtractionInput) {
  const text = bodyText(input.$);
  const guarantee = text.match(/\b(\d+)\s*[- ]?(day|month|year)s?\s+(?:money[- ]back\s+)?guarantee\b/i);
  if (guarantee) addCandidate(input.candidates, candidate(input, 'policy.guarantee', durationPayload(guarantee), 0.8));
  const returns = text.match(/\breturns?\s+(?:within|up\s+to)\s+(\d+)\s*[- ]?(day|month|year)s?\b/i);
  if (returns) addCandidate(input.candidates, candidate(input, 'policy.return_window', durationPayload(returns), 0.8));
}

function extractHomepagePositioning(input: ExtractionInput) {
  const h1 = input.$('h1').first().text().trim();
  if (!h1) return;
  const subheadline = input.$('h1').first().nextAll('h2, p').first().text().trim();
  const cta = input.$('main a, main button, a[role="button"], button')
    .toArray()
    .map((element) => input.$(element).text().trim())
    .find((text) => /\b(shop|buy|get|start|subscribe|discover)\b/i.test(text));
  addCandidate(input.candidates, candidate(input, 'positioning.homepage', {
    headline: h1,
    ...(subheadline ? { subheadline } : {}),
    ...(cta ? { primaryCta: cta } : {}),
  }, subheadline || cta ? 0.8 : 0.75));
}

type ExtractionInput = {
  $: ReturnType<typeof load>;
  sourceUrl: string;
  observedAt: string;
  candidates: Map<string, WebsiteObservationCandidate>;
};

function candidate(input: ExtractionInput, factType: WebsiteObservationCandidate['factType'], payload: Record<string, unknown>, confidence: number): WebsiteObservationCandidate {
  return websiteObservationCandidateSchema.parse({ factType, observedAt: input.observedAt, sourceUrl: input.sourceUrl, payload, extractionMethod: 'dom', confidence, extractorVersion: EXTRACTOR_VERSION });
}

function addCandidate(candidates: Map<string, WebsiteObservationCandidate>, value: WebsiteObservationCandidate) {
  const parsed = websiteObservationCandidateSchema.parse(value);
  const key = `${parsed.factType}:${JSON.stringify(parsed.payload)}`;
  if (!candidates.has(key)) candidates.set(key, parsed);
}

function jsonLdProducts($: ReturnType<typeof load>) {
  const products: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      collectProducts(JSON.parse($(element).text()), products);
    } catch {
      // Invalid third-party JSON-LD is not evidence.
    }
  });
  return products;
}

function collectProducts(value: unknown, products: Record<string, unknown>[]) {
  if (Array.isArray(value)) return value.forEach((item) => collectProducts(item, products));
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  const types = Array.isArray(object['@type']) ? object['@type'] : [object['@type']];
  if (types.includes('Product')) products.push(object);
  if (object['@graph']) collectProducts(object['@graph'], products);
}

function objectValues(value: unknown): Record<string, unknown>[] {
  const values = Array.isArray(value) ? value : [value];
  return values.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function urlValue(value: unknown) {
  const text = stringValue(value);
  if (!text) return undefined;
  try { return new URL(text).href; } catch { return undefined; }
}

function resolvedUrl(value: string | undefined, baseUrl: string) {
  if (!value) return undefined;
  try { return new URL(value, baseUrl).href; } catch { return undefined; }
}

function decimalValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function explicitPrice(value: string | undefined) {
  if (!value) return undefined;
  const match = value.replace(/,/g, '').match(/(?:\$|€|£)?\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : undefined;
}

function currencyFromText(value: string) {
  if (/\$/.test(value)) return 'USD';
  if (/€/.test(value)) return 'EUR';
  if (/£/.test(value)) return 'GBP';
  return undefined;
}

function availabilityValue(value: unknown) {
  const text = stringValue(value)?.toLowerCase();
  if (!text) return undefined;
  if (/instock|in stock/.test(text)) return 'in_stock';
  if (/outofstock|out of stock|sold out/.test(text)) return 'out_of_stock';
  if (/preorder|pre-order/.test(text)) return 'preorder';
  return undefined;
}

function bodyText($: ReturnType<typeof load>) {
  $('script, style, noscript, template').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function durationPayload(match: RegExpMatchArray) {
  return { duration: Number(match[1]), unit: `${match[2].toLowerCase()}s`, text: match[0] };
}
