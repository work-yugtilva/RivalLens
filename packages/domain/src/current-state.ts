import {
  buildFactIndex,
  canEmitRemoval,
  computeEvaluatedScopes,
  type ComparableObservation,
  type FactEntry,
} from "./observed-changes";

export type ComparisonFactState = "present" | "explicitly_absent" | "unknown";

export type FactProvenance = {
  observationId: string | null;
  snapshotId: string;
  priorObservationId?: string;
  priorSnapshotId?: string;
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  confidence: number;
};

export type ResolvedFact = {
  status: "present" | "explicitly_absent";
  normalizedValue: Record<string, unknown>;
  provenance: FactProvenance;
  factType: string;
  evaluatedAt: string;
};

export type EvidenceObservation = ComparableObservation & {
  observedAt: string;
  confidence: number;
  snapshotId: string;
};

export type SourceEvidence = {
  sourceId: string;
  sourceType: string;
  snapshots: Array<{
    id: string;
    capturedAt: string;
    observations: EvidenceObservation[];
  }>;
};

export type SubjectProduct = {
  productUrl: string;
  name: ResolvedFact | null;
  currentPrice: ResolvedFact | null;
  availability: ResolvedFact | null;
};

export const authoritativeSourceTypes: Record<string, readonly string[]> = {
  positioning: ["homepage"],
  policy: ["shipping_returns", "homepage"],
  offer: ["pricing_offers", "subscription", "homepage", "product"],
  subscription: ["subscription", "pricing_offers", "homepage", "product"],
  product: ["product"],
};

function factAuthorityPrefix(factIdentity: string): string {
  if (factIdentity.startsWith("positioning:")) return "positioning";
  if (factIdentity.startsWith("policy:")) return "policy";
  if (factIdentity.startsWith("subscription:")) return "subscription";
  if (factIdentity.startsWith("product:")) return "product";
  return "offer";
}

export function sourceAuthorityRank(sourceType: string, factIdentity: string): number {
  const authorities = authoritativeSourceTypes[factAuthorityPrefix(factIdentity)] ?? [];
  const index = authorities.indexOf(sourceType);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function isAuthoritativeSource(sourceType: string, factIdentity: string): boolean {
  return sourceAuthorityRank(sourceType, factIdentity) !== Number.MAX_SAFE_INTEGER;
}

function buildProvenance(
  entry: FactEntry,
  observation: EvidenceObservation,
  sourceId: string,
): FactProvenance {
  return {
    observationId: observation.id,
    snapshotId: observation.snapshotId,
    sourceId,
    sourceUrl: observation.sourceUrl,
    observedAt: observation.observedAt,
    confidence: observation.confidence,
  };
}

function pickEvaluationAnchor(observations: EvidenceObservation[]): EvidenceObservation {
  return observations[0];
}

function buildAbsentProvenance(
  previousPresent: ResolvedFact,
  snapshot: { id: string; capturedAt: string },
  anchorObservation: EvidenceObservation,
  sourceId: string,
): FactProvenance {
  return {
    observationId: null,
    snapshotId: snapshot.id,
    priorObservationId: previousPresent.provenance.observationId ?? undefined,
    priorSnapshotId: previousPresent.provenance.snapshotId,
    sourceId,
    sourceUrl: anchorObservation.sourceUrl,
    observedAt: snapshot.capturedAt,
    confidence: anchorObservation.confidence,
  };
}

function observationById(observations: EvidenceObservation[]): Map<string, EvidenceObservation> {
  return new Map(observations.map((observation) => [observation.id, observation]));
}

export function resolveSourceCurrentState(source: SourceEvidence): Map<string, ResolvedFact> {
  const state = new Map<string, ResolvedFact>();

  for (const snapshot of source.snapshots) {
    if (snapshot.observations.length === 0) continue;

    const observationLookup = observationById(snapshot.observations);
    const currentIndex = buildFactIndex(snapshot.observations);
    const evaluatedScopes = computeEvaluatedScopes(source.sourceType, snapshot.observations);
    const previousPresent = [...state.entries()]
      .filter(([, fact]) => fact.status === "present")
      .map(([factIdentity]) => factIdentity);
    const anchorObservation = pickEvaluationAnchor(snapshot.observations);

    for (const [factIdentity, entry] of currentIndex) {
      const observation = observationLookup.get(entry.observation.id);
      if (!observation) continue;
      state.set(factIdentity, {
        status: "present",
        normalizedValue: entry.normalizedValue,
        provenance: buildProvenance(entry, observation, source.sourceId),
        factType: entry.factType,
        evaluatedAt: snapshot.capturedAt,
      });
    }

    for (const factIdentity of previousPresent) {
      if (currentIndex.has(factIdentity)) continue;
      const previous = state.get(factIdentity);
      if (!previous) continue;
      const factType = previous.factType;
      if (canEmitRemoval(factIdentity, factType, evaluatedScopes)) {
        state.set(factIdentity, {
          status: "explicitly_absent",
          normalizedValue: previous.normalizedValue,
          provenance: buildAbsentProvenance(previous, snapshot, anchorObservation, source.sourceId),
          factType,
          evaluatedAt: snapshot.capturedAt,
        });
      } else {
        state.delete(factIdentity);
      }
    }
  }

  return state;
}

type AuthoritativeCandidate = ResolvedFact & { sourceType: string };

function pickAuthoritativeCandidate(
  candidates: AuthoritativeCandidate[],
  factIdentity: string,
): AuthoritativeCandidate | null {
  const authoritative = candidates.filter((candidate) =>
    isAuthoritativeSource(candidate.sourceType, factIdentity),
  );
  if (authoritative.length === 0) return null;

  const bestRank = Math.min(...authoritative.map((candidate) =>
    sourceAuthorityRank(candidate.sourceType, factIdentity),
  ));
  const tier = authoritative.filter((candidate) =>
    sourceAuthorityRank(candidate.sourceType, factIdentity) === bestRank,
  );

  return tier.reduce((winner, candidate) =>
    Date.parse(candidate.evaluatedAt) > Date.parse(winner.evaluatedAt) ? candidate : winner,
  );
}

export function mergeSubjectCurrentState(sources: SourceEvidence[]): Map<string, ResolvedFact> {
  const candidatesByFact = new Map<string, AuthoritativeCandidate[]>();

  for (const source of sources) {
    const resolved = resolveSourceCurrentState(source);
    for (const [factIdentity, fact] of resolved) {
      const candidates = candidatesByFact.get(factIdentity) ?? [];
      candidates.push({ ...fact, sourceType: source.sourceType });
      candidatesByFact.set(factIdentity, candidates);
    }
  }

  const merged = new Map<string, ResolvedFact>();
  for (const [factIdentity, candidates] of candidatesByFact) {
    const winner = pickAuthoritativeCandidate(candidates, factIdentity);
    if (!winner) continue;
    const { sourceType, ...fact } = winner;
    void sourceType;
    merged.set(factIdentity, fact);
  }

  return merged;
}

function productUrlFromIdentity(factIdentity: string): string | null {
  if (!factIdentity.startsWith("product:")) return null;
  const remainder = factIdentity.slice("product:".length);
  const suffixes = [":price:current", ":price:compare_at", ":availability", ":name"];
  for (const suffix of suffixes) {
    if (remainder.endsWith(suffix)) return remainder.slice(0, -suffix.length);
  }
  return null;
}

export function resolveSubjectProductFacts(sources: SourceEvidence[]): SubjectProduct[] {
  const productSources = sources.filter((source) => source.sourceType === "product");
  const merged = mergeSubjectCurrentState(productSources);
  const products = new Map<string, SubjectProduct>();

  for (const [factIdentity, fact] of merged) {
    const productUrl = productUrlFromIdentity(factIdentity);
    if (!productUrl) continue;

    let product = products.get(productUrl);
    if (!product) {
      product = { productUrl, name: null, currentPrice: null, availability: null };
      products.set(productUrl, product);
    }

    if (factIdentity.endsWith(":name")) product.name = fact;
    else if (factIdentity.endsWith(":price:current")) product.currentPrice = fact;
    else if (factIdentity.endsWith(":availability")) product.availability = fact;
  }

  return [...products.values()].sort((left, right) => left.productUrl.localeCompare(right.productUrl));
}
