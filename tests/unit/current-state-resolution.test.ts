import { describe, expect, it } from "vitest";
import {
  mergeSubjectCurrentState,
  resolveSourceCurrentState,
  type EvidenceObservation,
  type SourceEvidence,
} from "../../packages/domain/src/current-state";

const SOURCE_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_URL = "https://example.com/";

let observationCounter = 0;

function observation(
  factType: string,
  payload: Record<string, unknown>,
  observedAt: string,
  snapshotId: string,
): EvidenceObservation {
  observationCounter += 1;
  return {
    id: `aaaaaaaa-bbbb-4ccc-8ddd-${String(observationCounter).padStart(12, "0")}`,
    factType,
    sourceUrl: SOURCE_URL,
    payload,
    observedAt,
    confidence: 0.9,
    snapshotId,
  };
}

function sourceEvidence(
  sourceType: string,
  snapshots: Array<{ id: string; capturedAt: string; observations: EvidenceObservation[] }>,
): SourceEvidence {
  return { sourceId: SOURCE_ID, sourceType, snapshots };
}

describe("resolveSourceCurrentState", () => {
  it("uses the latest observation across snapshots", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("homepage", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "Older headline" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T11:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "Latest headline" }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
      },
    ]));

    const headline = resolved.get("positioning:homepage:headline");
    expect(headline?.status).toBe("present");
    expect(headline?.normalizedValue.headline).toBe("Latest headline");
  });
  it("ignores older snapshot values once a newer present value exists", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("homepage", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "Stale headline" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T12:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "Current headline" }, "2026-09-01T12:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
      },
    ]));

    expect(resolved.get("positioning:homepage:headline")?.normalizedValue.headline).toBe("Current headline");
  });

  it("marks explicitly removed facts as explicitly_absent", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("product", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
        ],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T11:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
        ],
      },
    ]));

    expect(resolved.get("offer:promo:SAVE10")?.status).toBe("explicitly_absent");
  });

  it("drops uncovered facts to unknown during partial extraction", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("product", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("product.price", { currentPrice: 29, currency: "USD" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("product.availability", { availability: "in_stock" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
        ],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T11:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
          observation("product.price", { currentPrice: 39, currency: "USD" }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
        ],
      },
    ]));

    expect(resolved.has("product:https://example.com/:availability")).toBe(false);
  });

  it("returns present again after re-adding a removed fact", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("product", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
        ],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T11:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222"),
        ],
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        capturedAt: "2026-09-01T12:00:00.000Z",
        observations: [
          observation("product.name", { name: "Widget", canonicalUrl: SOURCE_URL }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
          observation("offer.promo", { code: "SAVE10" }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
        ],
      },
    ]));

    expect(resolved.get("offer:promo:SAVE10")?.status).toBe("present");
  });

  it("skips empty snapshots without mutating state", () => {
    const resolved = resolveSourceCurrentState(sourceEvidence("homepage", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "First headline" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
      },
      { id: "22222222-2222-4222-8222-222222222222", capturedAt: "2026-09-01T11:00:00.000Z", observations: [] },
      {
        id: "33333333-3333-4333-8333-333333333333",
        capturedAt: "2026-09-01T12:00:00.000Z",
        observations: [observation("positioning.homepage", { headline: "Final headline" }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333")],
      },
    ]));

    expect(resolved.get("positioning:homepage:headline")?.normalizedValue.headline).toBe("Final headline");
  });
});

describe("mergeSubjectCurrentState", () => {
  it("prefers authoritative pricing_offers for offer facts", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("homepage", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("positioning.homepage", { headline: "Homepage headline" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("pricing_offers", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T11:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 50 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("offer:free_shipping")?.normalizedValue.threshold).toBe(50);
  });
});


describe("mergeSubjectCurrentState authority", () => {
  it("marks offer absent when newer pricing_offers explicitly removes it", () => {
    const homepageObs = observation("offer.promo", { code: "SAVE10" }, "2026-09-01T09:00:00.000Z", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const merged = mergeSubjectCurrentState([
      sourceEvidence("homepage", [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          capturedAt: "2026-09-01T09:00:00.000Z",
          observations: [homepageObs],
        },
      ]),
      sourceEvidence("pricing_offers", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [
            observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
            observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          ],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T11:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("offer:promo:SAVE10")?.status).toBe("explicitly_absent");
  });
  it("keeps older homepage offer when newer pricing partial extraction is unknown", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("homepage", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("pricing_offers", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T11:00:00.000Z",
          observations: [observation("offer.discount", { label: "10% off", discountPercent: 10 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("offer:free_shipping")?.status).toBe("present");
    expect(merged.get("offer:free_shipping")?.normalizedValue.threshold).toBe(75);
  });
  it("returns present after re-adding within authoritative pricing_offers source", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("pricing_offers", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [
            observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
            observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          ],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T11:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [
            observation("offer.promo", { code: "SAVE10" }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
            observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
          ],
        },
      ]),
    ]);

    expect(merged.get("offer:promo:SAVE10")?.status).toBe("present");
  });
  it("does not let newer homepage override authoritative pricing_offers present", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("pricing_offers", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 50 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("homepage", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 100 }, "2026-09-01T12:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("offer:free_shipping")?.normalizedValue.threshold).toBe(50);
  });
  it("uses homepage authority for positioning and ignores product source", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("product", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [observation("positioning.homepage", { headline: "Product headline" }, "2026-09-01T12:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("homepage", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("positioning.homepage", { headline: "Homepage headline" }, "2026-09-01T10:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("positioning:homepage:headline")?.normalizedValue.headline).toBe("Homepage headline");
  });
  it("uses shipping_returns authority for policy facts", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("homepage", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [observation("policy.return_window", { duration: 14, unit: "days" }, "2026-09-01T12:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("shipping_returns", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("policy.return_window", { duration: 30, unit: "days" }, "2026-09-01T10:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("policy:return_window")?.normalizedValue.durationDays).toBe(30);
  });
  it("uses pricing_offers authority for offer facts", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("homepage", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 100 }, "2026-09-01T12:00:00.000Z", "11111111-1111-4111-8111-111111111111")],
        },
      ]),
      sourceEvidence("pricing_offers", [
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 50 }, "2026-09-01T10:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
    ]);

    expect(merged.get("offer:free_shipping")?.normalizedValue.threshold).toBe(50);
  });
  it("resolves present after explicit absence across authoritative sources", () => {
    const merged = mergeSubjectCurrentState([
      sourceEvidence("pricing_offers", [
        {
          id: "11111111-1111-4111-8111-111111111111",
          capturedAt: "2026-09-01T10:00:00.000Z",
          observations: [
            observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
            observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
          ],
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          capturedAt: "2026-09-01T11:00:00.000Z",
          observations: [observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
        },
      ]),
      sourceEvidence("pricing_offers", [
        {
          id: "33333333-3333-4333-8333-333333333333",
          capturedAt: "2026-09-01T12:00:00.000Z",
          observations: [
            observation("offer.promo", { code: "SAVE10" }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
            observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T12:00:00.000Z", "33333333-3333-4333-8333-333333333333"),
          ],
        },
      ]),
    ]);

    expect(merged.get("offer:promo:SAVE10")?.status).toBe("present");
  });
  it("records absent provenance with prior observation and evaluation snapshot", () => {
    const presentObs = observation("offer.promo", { code: "SAVE10" }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111");
    const resolved = resolveSourceCurrentState(sourceEvidence("pricing_offers", [
      {
        id: "11111111-1111-4111-8111-111111111111",
        capturedAt: "2026-09-01T10:00:00.000Z",
        observations: [
          presentObs,
          observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T10:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
        ],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        capturedAt: "2026-09-01T11:00:00.000Z",
        observations: [observation("offer.free_shipping", { threshold: 75 }, "2026-09-01T11:00:00.000Z", "22222222-2222-4222-8222-222222222222")],
      },
    ]));

    const absent = resolved.get("offer:promo:SAVE10");
    expect(absent?.status).toBe("explicitly_absent");
    expect(absent?.provenance.observationId).toBeNull();
    expect(absent?.provenance.snapshotId).toBe("22222222-2222-4222-8222-222222222222");
    expect(absent?.provenance.priorObservationId).toBe(presentObs.id);
    expect(absent?.provenance.priorSnapshotId).toBe("11111111-1111-4111-8111-111111111111");
    expect(absent?.provenance.observedAt).toBe("2026-09-01T11:00:00.000Z");
  });
});
