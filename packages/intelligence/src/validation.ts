import {
  intelligenceContextSchema,
  llmExecutiveBriefingSchema,
  llmIntelligenceSynthesisOutputSchema,
  llmRecommendedExperimentOutputSchema,
  llmStrategicHypothesisOutputSchema,
  type ContextComparisonFact,
  type ContextObservedChange,
  type ContextSignal,
  type ContextUntrustedSnippet,
  type EpistemicClass,
  type GroundedClaimReference,
  type GroundedNumericClaim,
  type IntelligenceContext,
  type LlmExecutiveBriefing,
  type LlmRecommendedExperimentOutput,
  type LlmStrategicHypothesisOutput,
} from '@rivallens/schemas';

export type IntelligenceValidationErrorCode =
  | 'INVALID_CONTEXT_SCHEMA'
  | 'INVALID_OUTPUT_SCHEMA'
  | 'UNKNOWN_COMPETITOR_ID'
  | 'UNKNOWN_SIGNAL_ID'
  | 'UNKNOWN_COMPARISON_KEY'
  | 'UNKNOWN_OBSERVATION_ID'
  | 'UNKNOWN_CHANGE_ID'
  | 'UNKNOWN_SNIPPET_ID'
  | 'COMPETITOR_ATTRIBUTION_MISMATCH'
  | 'EVIDENCE_DEPENDENCY_MISMATCH'
  | 'UNSUPPORTED_NUMERIC_CLAIM'
  | 'UNIT_MISMATCH'
  | 'DELTA_DIRECTION_MISMATCH'
  | 'EPISTEMIC_CLASS_VIOLATION'
  | 'UNKNOWN_AS_ABSENCE'
  | 'INVALID_HYPOTHESIS_REFERENCE'
  | 'EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS'
  | 'PRIMARY_METRIC_DUPLICATES_GUARDRAIL'
  | 'EXPERIMENT_NOT_SINGLE_VARIABLE'
  | 'EXPERIMENT_NOT_FRAMED_AS_TEST'
  | 'INAPPROPRIATE_EXPERIMENT_CAVEAT'
  | 'UNSUPPORTED_EXPERIMENT_CLAIM'
  | 'UNSUPPORTED_CAUSAL_CLAIM'
  | 'UNSUPPORTED_BRIEFING_CLAIM';

export type IntelligenceValidationError = {
  code: IntelligenceValidationErrorCode;
  path: Array<string | number>;
  message: string;
};

export type IndexedItemValidationResult = {
  index: number;
  status: 'accepted' | 'rejected';
  errors: IntelligenceValidationError[];
};

export type ItemValidationResult = {
  status: 'accepted' | 'rejected';
  errors: IntelligenceValidationError[];
};

export type IntelligenceValidationResult = {
  status: 'passed' | 'partial' | 'failed';
  hypotheses: IndexedItemValidationResult[];
  experiments: IndexedItemValidationResult[];
  executiveBriefing: ItemValidationResult;
  errors: IntelligenceValidationError[];
  acceptedOutput: {
    executiveBriefing?: LlmExecutiveBriefing;
    hypotheses: LlmStrategicHypothesisOutput[];
    experiments: LlmRecommendedExperimentOutput[];
  };
};

export type ValidateIntelligenceSynthesisInput = {
  context: unknown;
  output: unknown;
};

type ContextIndexes = {
  context: IntelligenceContext;
  competitorIds: Set<string>;
  factsByCompetitor: Map<string, Map<string, ContextComparisonFact>>;
  comparisonKeysByCompetitor: Map<string, Set<string>>;
  signalsById: Map<string, ContextSignal>;
  observationsById: Map<string, Set<string>>;
  changesById: Map<string, ContextObservedChange>;
  snippetsById: Map<string, ContextUntrustedSnippet>;
};

type ResolvedReference = {
  epistemicClass: EpistemicClass;
  fact?: ContextComparisonFact;
  signal?: ContextSignal;
  change?: ContextObservedChange;
};

function validationError(
  code: IntelligenceValidationErrorCode,
  path: Array<string | number>,
  message: string,
): IntelligenceValidationError {
  return { code, path, message };
}

function schemaErrors(
  code: 'INVALID_CONTEXT_SCHEMA' | 'INVALID_OUTPUT_SCHEMA',
  prefix: Array<string | number>,
  issues: Array<{ path: Array<string | number>; message: string }>,
): IntelligenceValidationError[] {
  return issues.map((issue) => validationError(code, [...prefix, ...issue.path], issue.message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function signalEvidenceSubjectId(
  role: ContextSignal['evidence'][number]['role'],
  signal: ContextSignal,
  context: IntelligenceContext,
): string {
  switch (role) {
    case 'owned':
      return context.brand.id;
    case 'competitor':
    case 'previous':
    case 'current':
    case 'evaluation':
    case 'previous_evaluation':
      return signal.competitorId;
  }

  const unhandledRole: never = role;
  throw new Error(`Unsupported signal evidence role: ${unhandledRole}`);
}

function addObservation(
  index: Map<string, Set<string>>,
  observationId: string | null | undefined,
  subjectId: string,
): void {
  if (!observationId) return;
  const subjects = index.get(observationId) ?? new Set<string>();
  subjects.add(subjectId);
  index.set(observationId, subjects);
}

function buildIndexes(context: IntelligenceContext): ContextIndexes {
  const factsByCompetitor = new Map<string, Map<string, ContextComparisonFact>>();
  const comparisonKeysByCompetitor = new Map<string, Set<string>>();
  const observationsById = new Map<string, Set<string>>();
  for (const fact of context.facts) {
    const competitorId = fact.competitor.subjectId;
    const factsByKey = factsByCompetitor.get(competitorId) ?? new Map<string, ContextComparisonFact>();
    factsByKey.set(fact.key, fact);
    factsByCompetitor.set(competitorId, factsByKey);
    const keys = comparisonKeysByCompetitor.get(competitorId) ?? new Set<string>();
    keys.add(fact.key);
    comparisonKeysByCompetitor.set(competitorId, keys);
    addObservation(observationsById, fact.owned.provenance?.observationId, fact.owned.subjectId);
    addObservation(
      observationsById,
      fact.owned.provenance?.priorObservationId,
      fact.owned.subjectId,
    );
    addObservation(
      observationsById,
      fact.competitor.provenance?.observationId,
      fact.competitor.subjectId,
    );
    addObservation(
      observationsById,
      fact.competitor.provenance?.priorObservationId,
      fact.competitor.subjectId,
    );
  }

  const signalsById = new Map(context.signals.map((signal) => [signal.id, signal]));
  for (const signal of context.signals) {
    const keys = comparisonKeysByCompetitor.get(signal.competitorId) ?? new Set<string>();
    keys.add(signal.comparisonKey);
    comparisonKeysByCompetitor.set(signal.competitorId, keys);
    for (const evidence of signal.evidence) {
      const subjectId = signalEvidenceSubjectId(evidence.role, signal, context);
      addObservation(observationsById, evidence.observationId, subjectId);
      addObservation(observationsById, evidence.priorObservationId, subjectId);
    }
  }
  for (const change of context.recentChanges) {
    addObservation(observationsById, change.evidence.currentObservationId, change.subjectId);
    addObservation(observationsById, change.evidence.previousObservationId, change.subjectId);
  }
  for (const snippet of context.untrustedSnippets) {
    addObservation(observationsById, snippet.observationId, snippet.subjectId);
  }

  return {
    context,
    competitorIds: new Set(context.competitors.map((competitor) => competitor.id)),
    factsByCompetitor,
    comparisonKeysByCompetitor,
    signalsById,
    observationsById,
    changesById: new Map(context.recentChanges.map((change) => [change.id, change])),
    snippetsById: new Map(context.untrustedSnippets.map((snippet) => [snippet.snippetId, snippet])),
  };
}

function resolveReference(
  reference: GroundedClaimReference,
  indexes: ContextIndexes,
  path: Array<string | number>,
  hypothesisCompetitorId?: string,
): { resolved?: ResolvedReference; errors: IntelligenceValidationError[] } {
  const errors: IntelligenceValidationError[] = [];
  let resolved: ResolvedReference | undefined;
  let actualSubjectIds: Set<string> | undefined;
  let comparisonState: 'present' | 'explicitly_absent' | 'unknown' | undefined;

  switch (reference.kind) {
    case 'comparison': {
      if (!indexes.competitorIds.has(reference.competitorId)) {
        errors.push(
          validationError(
            'UNKNOWN_COMPETITOR_ID',
            path,
            `Competitor ${reference.competitorId} is absent from the context`,
          ),
        );
      }
      const fact = indexes.factsByCompetitor
        .get(reference.competitorId)
        ?.get(reference.comparisonKey);
      if (!fact) {
        errors.push(
          validationError(
            'UNKNOWN_COMPARISON_KEY',
            path,
            `Comparison ${reference.comparisonKey} is absent for competitor ${reference.competitorId}`,
          ),
        );
        break;
      }
      actualSubjectIds = new Set([fact.owned.subjectId, fact.competitor.subjectId]);
      const subjectValue =
        reference.subjectId === fact.owned.subjectId
          ? fact.owned
          : reference.subjectId === fact.competitor.subjectId
            ? fact.competitor
            : undefined;
      comparisonState = subjectValue?.state;
      resolved = { epistemicClass: fact.epistemicClass, fact };
      if (
        hypothesisCompetitorId !== undefined &&
        reference.competitorId !== hypothesisCompetitorId
      ) {
        errors.push(
          validationError(
            'COMPETITOR_ATTRIBUTION_MISMATCH',
            path,
            'The comparison does not belong to the hypothesis competitor',
          ),
        );
      }
      break;
    }
    case 'signal': {
      const signal = indexes.signalsById.get(reference.signalId);
      if (!signal) {
        errors.push(
          validationError('UNKNOWN_SIGNAL_ID', path, `Signal ${reference.signalId} is absent`),
        );
        break;
      }
      actualSubjectIds = new Set([signal.competitorId]);
      resolved = { epistemicClass: signal.epistemicClass, signal };
      if (hypothesisCompetitorId !== undefined && signal.competitorId !== hypothesisCompetitorId) {
        errors.push(
          validationError(
            'COMPETITOR_ATTRIBUTION_MISMATCH',
            path,
            'The signal does not belong to the hypothesis competitor',
          ),
        );
      }
      break;
    }
    case 'observation': {
      const subjects = indexes.observationsById.get(reference.observationId);
      if (!subjects) {
        errors.push(
          validationError(
            'UNKNOWN_OBSERVATION_ID',
            path,
            `Observation ${reference.observationId} is absent`,
          ),
        );
        break;
      }
      actualSubjectIds = subjects;
      resolved = { epistemicClass: 'observed' };
      break;
    }
    case 'change': {
      const change = indexes.changesById.get(reference.changeId);
      if (!change) {
        errors.push(
          validationError('UNKNOWN_CHANGE_ID', path, `Change ${reference.changeId} is absent`),
        );
        break;
      }
      actualSubjectIds = new Set([change.subjectId]);
      resolved = { epistemicClass: change.epistemicClass, change };
      break;
    }
    case 'snippet': {
      const snippet = indexes.snippetsById.get(reference.snippetId);
      if (!snippet) {
        errors.push(
          validationError('UNKNOWN_SNIPPET_ID', path, `Snippet ${reference.snippetId} is absent`),
        );
        break;
      }
      actualSubjectIds = new Set([snippet.subjectId]);
      resolved = { epistemicClass: snippet.epistemicClass };
      break;
    }
  }

  if (actualSubjectIds && !actualSubjectIds.has(reference.subjectId)) {
    errors.push(
      validationError(
        'COMPETITOR_ATTRIBUTION_MISMATCH',
        path,
        'The referenced entity does not belong to the claimed subject',
      ),
    );
  }
  if (
    hypothesisCompetitorId !== undefined &&
    reference.subjectId !== indexes.context.brand.id &&
    reference.subjectId !== hypothesisCompetitorId
  ) {
    errors.push(
      validationError(
        'COMPETITOR_ATTRIBUTION_MISMATCH',
        path,
        'The referenced subject is outside the hypothesis competitor scope',
      ),
    );
  }

  if (resolved) {
    const promotionToObserved =
      reference.claimedEpistemicClass === 'observed' && resolved.epistemicClass !== 'observed';
    const mislabeledEstimate =
      resolved.epistemicClass === 'estimated' && reference.claimedEpistemicClass !== 'estimated';
    const mislabeledReport =
      resolved.epistemicClass === 'reported' && reference.claimedEpistemicClass !== 'reported';
    if (promotionToObserved || mislabeledEstimate || mislabeledReport) {
      errors.push(
        validationError(
          'EPISTEMIC_CLASS_VIOLATION',
          path,
          `Claimed ${reference.claimedEpistemicClass} evidence resolves to ${resolved.epistemicClass}`,
        ),
      );
    }
    if (
      reference.assertion === 'absence' &&
      (reference.kind !== 'comparison' || comparisonState !== 'explicitly_absent')
    ) {
      errors.push(
        validationError(
          'UNKNOWN_AS_ABSENCE',
          path,
          'Absence requires an explicitly_absent comparison value',
        ),
      );
    }
    if (reference.kind === 'comparison' && comparisonState === 'unknown') {
      errors.push(
        validationError(
          reference.assertion === 'absence' ? 'UNKNOWN_AS_ABSENCE' : 'EVIDENCE_DEPENDENCY_MISMATCH',
          path,
          'An unknown comparison value cannot support a factual claim',
        ),
      );
    }
  }

  return { resolved, errors };
}

function expectedDirection(value: number, relative: boolean): GroundedNumericClaim['direction'] {
  if (value === 0) return 'equal';
  if (relative) return value > 0 ? 'competitor_higher' : 'competitor_lower';
  return value > 0 ? 'increase' : 'decrease';
}

const CHANGE_FIELD_UNITS = new Map<string, GroundedNumericClaim['unit']>([
  ['offer.free_shipping\u0000threshold', 'usd'],
  ['policy.guarantee\u0000durationDays', 'days'],
  ['policy.return_window\u0000durationDays', 'days'],
  ['subscription.details\u0000discountPercent', 'percent'],
]);

function changeFieldUnit(
  change: ContextObservedChange,
  field: string,
): GroundedNumericClaim['unit'] | undefined {
  return CHANGE_FIELD_UNITS.get(`${change.factType}\u0000${field}`);
}

function numericChangeField(
  value: Record<string, unknown> | null,
  field: string,
): number | undefined {
  if (!value || !Object.hasOwn(value, field)) return undefined;
  const candidate = value[field];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

function validateNumericClaim(
  claim: GroundedNumericClaim,
  indexes: ContextIndexes,
  path: Array<string | number>,
  hypothesisCompetitorId?: string,
): IntelligenceValidationError[] {
  const referenceResult = resolveReference(
    claim.reference,
    indexes,
    [...path, 'reference'],
    hypothesisCompetitorId,
  );
  if (!referenceResult.resolved || referenceResult.errors.length > 0) {
    return referenceResult.errors;
  }

  const { fact, signal, change } = referenceResult.resolved;
  let expectedValue: number | undefined;
  let expectedUnit: GroundedNumericClaim['unit'] | undefined;
  let directionValue: number | undefined;
  let relativeDirection = false;

  if (signal) {
    const supporting = signal.supportingValues;
    const value = supporting[claim.valueRole];
    if (typeof value === 'number') expectedValue = value;
    if (supporting.unit) {
      expectedUnit =
        claim.valueRole !== 'delta' && supporting.unit === 'percentage_points'
          ? 'percent'
          : supporting.unit;
    }
    if (claim.valueRole === 'delta' && typeof value === 'number') {
      directionValue = value;
      relativeDirection = supporting.owned !== undefined && supporting.competitor !== undefined;
    }
  } else if (fact?.delta) {
    if (claim.valueRole === 'owned') expectedValue = fact.delta.ownedValue;
    if (claim.valueRole === 'competitor') expectedValue = fact.delta.competitorValue;
    if (claim.valueRole === 'delta') expectedValue = fact.delta.difference;
    if (['owned', 'competitor', 'delta'].includes(claim.valueRole)) {
      expectedUnit =
        claim.valueRole === 'delta' && fact.delta.unit === 'percent'
          ? 'percentage_points'
          : fact.delta.unit;
    }
    if (claim.valueRole === 'delta') {
      directionValue = fact.delta.difference;
      relativeDirection = true;
    }
  } else if (change) {
    const field = claim.field;
    if (field) {
      expectedUnit = changeFieldUnit(change, field);
      if (expectedUnit !== undefined) {
        const previous = numericChangeField(change.beforeValue, field);
        const current = numericChangeField(change.afterValue, field);
        if (claim.valueRole === 'previous' && previous !== undefined) expectedValue = previous;
        if (claim.valueRole === 'current' && current !== undefined) expectedValue = current;
        if (claim.valueRole === 'delta' && previous !== undefined && current !== undefined) {
          expectedValue = current - previous;
          directionValue = current - previous;
        }
      }
    }
  }

  const errors: IntelligenceValidationError[] = [];
  if (claim.valueRole === 'owned' && claim.reference.subjectId !== indexes.context.brand.id) {
    errors.push(
      validationError(
        'COMPETITOR_ATTRIBUTION_MISMATCH',
        [...path, 'reference', 'subjectId'],
        'An owned value must be attributed to the owned brand',
      ),
    );
  }
  const referencedCompetitorId =
    claim.reference.kind === 'comparison' ? claim.reference.competitorId : signal?.competitorId;
  if (
    claim.valueRole === 'competitor' &&
    referencedCompetitorId !== undefined &&
    claim.reference.subjectId !== referencedCompetitorId
  ) {
    errors.push(
      validationError(
        'COMPETITOR_ATTRIBUTION_MISMATCH',
        [...path, 'reference', 'subjectId'],
        'A competitor value must be attributed to the cited competitor',
      ),
    );
  }
  if (expectedUnit !== undefined && claim.unit !== expectedUnit) {
    errors.push(
      validationError(
        'UNIT_MISMATCH',
        [...path, 'unit'],
        `Expected ${expectedUnit}, received ${claim.unit}`,
      ),
    );
  }
  if (expectedValue === undefined || expectedValue !== claim.value) {
    errors.push(
      validationError(
        'UNSUPPORTED_NUMERIC_CLAIM',
        [...path, 'value'],
        `Value ${claim.value} does not exist at the cited context location`,
      ),
    );
  }
  if (
    claim.direction !== undefined &&
    (directionValue === undefined ||
      claim.direction !== expectedDirection(directionValue, relativeDirection))
  ) {
    errors.push(
      validationError(
        'DELTA_DIRECTION_MISMATCH',
        [...path, 'direction'],
        'The claimed direction does not match the cited values',
      ),
    );
  }
  return errors;
}

const CERTAINTY_PATTERN =
  /\b(?:will|guaranteed|guarantees|proven|proves?|caused|causes?|ensures?|drives?|leads to|results in|clearly|undoubtedly|certainly|definitely|always)\b/i;
const NUMBER_PATTERN =
  /(?<![\w.])(\$?)([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?)(?:\s*(percentage points|%|percent|days|usd))?/gi;
const DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;

function hasUnsupportedCausalCertainty(texts: string[]): boolean {
  return CERTAINTY_PATTERN.test(texts.join(' '));
}

function sentenceAt(text: string, index: number): string {
  let start = 0;
  let end = text.length;
  for (let position = 0; position < text.length; position += 1) {
    const next = text[position + 1];
    const isBoundary =
      /[.!?]/.test(text[position]!) && (next === undefined || /\s/.test(next));
    if (!isBoundary) continue;
    if (position < index) start = position + 1;
    else {
      end = position;
      break;
    }
  }
  return text.slice(start, end).toLowerCase();
}

function proseUnit(value: string): GroundedNumericClaim['unit'] | undefined {
  const normalized = value.toLowerCase();
  if (normalized.includes('percentage points')) return 'percentage_points';
  if (normalized.includes('%') || /\bpercent\b/.test(normalized)) return 'percent';
  if (/\bdays?\b/.test(normalized)) return 'days';
  if (normalized.includes('$') || /\busd\b/.test(normalized)) return 'usd';
  return undefined;
}

function isHarmlessBareNumber(match: RegExpMatchArray, text: string): boolean {
  const currency = match[1] ?? '';
  const rawValue = match[2] ?? '';
  const unit = match[3] ?? '';
  if (currency || unit || /[+\-.,e]/i.test(rawValue)) return false;
  const value = Number(rawValue);
  if (Number.isInteger(value) && value >= 1900 && value <= 2100) return true;

  const prefix = text.slice(0, match.index ?? 0);
  return /[a-z]+[A-Z][A-Za-z0-9-]*\s*$/.test(prefix);
}

function proseDirection(
  sentence: string,
  subjectRoles: { owned: boolean; competitor: boolean },
): GroundedNumericClaim['direction'] | undefined {
  if (subjectRoles.competitor && /\blower\b/.test(sentence)) {
    return 'competitor_lower';
  }
  if (subjectRoles.competitor && /\bhigher\b/.test(sentence)) {
    return 'competitor_higher';
  }
  if (subjectRoles.owned && /\blower\b/.test(sentence)) {
    return 'competitor_higher';
  }
  if (subjectRoles.owned && /\bhigher\b/.test(sentence)) {
    return 'competitor_lower';
  }
  if (/\b(?:increase|increased|increasing|rise|rose)\b/.test(sentence)) return 'increase';
  if (/\b(?:decrease|decreased|decreasing|drop|dropped|reduce|reduced)\b/.test(sentence)) {
    return 'decrease';
  }
  return undefined;
}

function mentionedSubjectIds(sentence: string, indexes: ContextIndexes): Set<string> {
  const subjects = new Set<string>();
  if (sentence.includes(indexes.context.brand.domain.toLowerCase())) {
    subjects.add(indexes.context.brand.id);
  }
  for (const competitor of indexes.context.competitors) {
    if (sentence.includes(competitor.domain.toLowerCase())) subjects.add(competitor.id);
  }
  return subjects;
}

function proseSubjectRoles(
  sentence: string,
  mentionedSubjects: Set<string>,
  indexes: ContextIndexes,
): { owned: boolean; competitor: boolean } {
  return {
    owned:
      mentionedSubjects.has(indexes.context.brand.id) || /\b(?:our|we|us|owned)\b/.test(sentence),
    competitor:
      [...mentionedSubjects].some((subjectId) => subjectId !== indexes.context.brand.id) ||
      /\b(?:competitor|rival)\b/.test(sentence),
  };
}

function numericClaimSubjectId(claim: GroundedNumericClaim, indexes: ContextIndexes): string {
  return claim.valueRole === 'owned' ? indexes.context.brand.id : claim.reference.subjectId;
}

function knownDomainErrors(
  texts: string[],
  indexes: ContextIndexes,
  path: Array<string | number>,
  code: IntelligenceValidationErrorCode,
  message: string,
): IntelligenceValidationError[] {
  const knownDomains = new Set([
    indexes.context.brand.domain.toLowerCase(),
    ...indexes.context.competitors.map((competitor) => competitor.domain.toLowerCase()),
  ]);
  const mentionedDomains = texts
    .flatMap((text) => text.match(DOMAIN_PATTERN) ?? [])
    .map((domain) => domain.toLowerCase());
  return mentionedDomains.some((domain) => !knownDomains.has(domain))
    ? [validationError(code, path, message)]
    : [];
}

function unsupportedProseNumberErrors(
  texts: string[],
  claims: GroundedNumericClaim[],
  indexes: ContextIndexes,
  path: Array<string | number>,
): IntelligenceValidationError[] {
  const errors: IntelligenceValidationError[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(NUMBER_PATTERN)) {
      if (isHarmlessBareNumber(match, text)) continue;
      const value = Number((match[2] ?? '').replaceAll(',', ''));
      const sentence = sentenceAt(text, match.index ?? 0);
      const unit = proseUnit(match[0]);
      const subjects = mentionedSubjectIds(sentence, indexes);
      const subjectRoles = proseSubjectRoles(sentence, subjects, indexes);
      const direction = proseDirection(sentence, subjectRoles);
      const supported = claims.some((claim) => {
        if (unit !== undefined && claim.unit !== unit) return false;
        if (subjects.size === 1 && !subjects.has(numericClaimSubjectId(claim, indexes))) {
          return false;
        }
        if (claim.valueRole !== 'delta') {
          const subjectId = numericClaimSubjectId(claim, indexes);
          if (subjectRoles.owned && subjectId !== indexes.context.brand.id) return false;
          if (subjectRoles.competitor && subjectId === indexes.context.brand.id) return false;
        } else if ((subjectRoles.owned || subjectRoles.competitor) && direction === undefined) {
          return false;
        }
        if (direction !== undefined && claim.direction !== direction) return false;
        if (claim.value === value) return true;
        return (
          direction !== undefined &&
          value >= 0 &&
          claim.value < 0 &&
          Math.abs(claim.value) === value &&
          claim.direction === direction
        );
      });
      if (!supported) {
        errors.push(
          validationError(
            'UNSUPPORTED_NUMERIC_CLAIM',
            path,
            `Prose number ${value} has no matching structured numeric claim`,
          ),
        );
      }
    }
  }
  return errors;
}

function validateHypothesis(
  hypothesis: LlmStrategicHypothesisOutput,
  index: number,
  indexes: ContextIndexes,
): IntelligenceValidationError[] {
  const path = ['hypotheses', index];
  const errors: IntelligenceValidationError[] = [];
  if (!indexes.competitorIds.has(hypothesis.competitorId)) {
    errors.push(
      validationError(
        'UNKNOWN_COMPETITOR_ID',
        [...path, 'competitorId'],
        `Competitor ${hypothesis.competitorId} is absent from the context`,
      ),
    );
  }

  for (const [signalIndex, signalId] of hypothesis.supportingSignalIds.entries()) {
    const signal = indexes.signalsById.get(signalId);
    if (!signal) {
      errors.push(
        validationError(
          'UNKNOWN_SIGNAL_ID',
          [...path, 'supportingSignalIds', signalIndex],
          `Signal ${signalId} is absent from the context`,
        ),
      );
    } else if (signal.competitorId !== hypothesis.competitorId) {
      errors.push(
        validationError(
          'COMPETITOR_ATTRIBUTION_MISMATCH',
          [...path, 'supportingSignalIds', signalIndex],
          'The signal belongs to a different competitor',
        ),
      );
    }
  }

  const comparisonKeys = indexes.comparisonKeysByCompetitor.get(hypothesis.competitorId);
  for (const [comparisonIndex, comparisonKey] of hypothesis.supportingComparisonKeys.entries()) {
    if (!comparisonKeys?.has(comparisonKey)) {
      errors.push(
        validationError(
          'UNKNOWN_COMPARISON_KEY',
          [...path, 'supportingComparisonKeys', comparisonIndex],
          `Comparison ${comparisonKey} is absent for the hypothesis competitor`,
        ),
      );
    }
  }

  const resolvedClasses = new Set<EpistemicClass>();
  for (const [referenceIndex, reference] of hypothesis.claimReferences.entries()) {
    const result = resolveReference(
      reference,
      indexes,
      [...path, 'claimReferences', referenceIndex],
      hypothesis.competitorId,
    );
    errors.push(...result.errors);
    if (result.resolved) resolvedClasses.add(result.resolved.epistemicClass);
  }

  for (const signalId of hypothesis.supportingSignalIds) {
    const covered = hypothesis.claimReferences.some(
      (reference) => reference.kind === 'signal' && reference.signalId === signalId,
    );
    if (!covered) {
      errors.push(
        validationError(
          'EVIDENCE_DEPENDENCY_MISMATCH',
          [...path, 'claimReferences'],
          `Supporting signal ${signalId} has no structured claim reference`,
        ),
      );
    }
  }
  for (const comparisonKey of hypothesis.supportingComparisonKeys) {
    const covered = hypothesis.claimReferences.some((reference) => {
      if (reference.kind === 'comparison') return reference.comparisonKey === comparisonKey;
      if (reference.kind === 'signal') {
        return indexes.signalsById.get(reference.signalId)?.comparisonKey === comparisonKey;
      }
      return false;
    });
    if (!covered) {
      errors.push(
        validationError(
          'EVIDENCE_DEPENDENCY_MISMATCH',
          [...path, 'claimReferences'],
          `Supporting comparison ${comparisonKey} has no structured claim reference`,
        ),
      );
    }
  }

  const declaredClasses = new Set(hypothesis.epistemicClassDependencies);
  if (
    resolvedClasses.size !== declaredClasses.size ||
    [...resolvedClasses].some((epistemicClass) => !declaredClasses.has(epistemicClass))
  ) {
    errors.push(
      validationError(
        'EVIDENCE_DEPENDENCY_MISMATCH',
        [...path, 'epistemicClassDependencies'],
        'Declared epistemic dependencies do not match resolved claim references',
      ),
    );
  }

  const validNumericClaims: GroundedNumericClaim[] = [];
  for (const [numericIndex, claim] of hypothesis.numericClaims.entries()) {
    const numericErrors = validateNumericClaim(
      claim,
      indexes,
      [...path, 'numericClaims', numericIndex],
      hypothesis.competitorId,
    );
    errors.push(...numericErrors);
    if (numericErrors.length === 0) validNumericClaims.push(claim);
  }
  const texts = [
    hypothesis.statement,
    hypothesis.rationale,
    hypothesis.uncertainty.statement,
    ...hypothesis.assumptions,
  ];
  errors.push(
    ...knownDomainErrors(
      texts,
      indexes,
      [...path, 'prose'],
      'EVIDENCE_DEPENDENCY_MISMATCH',
      'The hypothesis names a domain that is absent from the context',
    ),
  );
  errors.push(
    ...unsupportedProseNumberErrors(
      texts,
      validNumericClaims,
      indexes,
      [...path, 'prose'],
    ),
  );
  if (hasUnsupportedCausalCertainty(texts)) {
    errors.push(
      validationError(
        'UNSUPPORTED_CAUSAL_CLAIM',
        [...path, 'statement'],
        'Hypotheses must remain uncertain rather than asserting causal certainty',
      ),
    );
  }
  return errors;
}

function duplicateMetricError(
  value: unknown,
  index: number,
): IntelligenceValidationError | undefined {
  if (!isRecord(value) || !Array.isArray(value.guardrailMetrics)) return undefined;
  return value.guardrailMetrics.includes(value.primaryMetric)
    ? validationError(
        'PRIMARY_METRIC_DUPLICATES_GUARDRAIL',
        ['experiments', index, 'guardrailMetrics'],
        'The primary metric cannot also be a guardrail metric',
      )
    : undefined;
}

function validateExperiment(
  experiment: LlmRecommendedExperimentOutput,
  index: number,
  indexes: ContextIndexes,
  hypotheses: Array<LlmStrategicHypothesisOutput | undefined>,
  hypothesisResults: IndexedItemValidationResult[],
  hypothesisIndexesByRef: Map<string, number>,
): IntelligenceValidationError[] {
  const path = ['experiments', index];
  const errors: IntelligenceValidationError[] = [];
  if (!indexes.competitorIds.has(experiment.competitorId)) {
    errors.push(
      validationError('UNKNOWN_COMPETITOR_ID', [...path, 'competitorId'], 'Unknown competitor'),
    );
  }
  const hypothesisIndex = hypothesisIndexesByRef.get(experiment.hypothesisRef);
  const hypothesis = hypothesisIndex === undefined ? undefined : hypotheses[hypothesisIndex];
  const hypothesisResult =
    hypothesisIndex === undefined ? undefined : hypothesisResults[hypothesisIndex];
  if (!hypothesis || !hypothesisResult) {
    errors.push(
      validationError(
        'INVALID_HYPOTHESIS_REFERENCE',
        [...path, 'hypothesisRef'],
        'The hypothesis ref does not exist or is ambiguous',
      ),
    );
  } else if (hypothesisResult.status === 'rejected') {
    errors.push(
      validationError(
        'EXPERIMENT_DEPENDS_ON_INVALID_HYPOTHESIS',
        [...path, 'hypothesisRef'],
        'The referenced hypothesis did not pass validation',
      ),
    );
  } else if (hypothesis.competitorId !== experiment.competitorId) {
    errors.push(
      validationError(
        'COMPETITOR_ATTRIBUTION_MISMATCH',
        [...path, 'competitorId'],
        'The experiment and hypothesis competitors differ',
      ),
    );
  }

  for (const [referenceIndex, reference] of experiment.claimReferences.entries()) {
    const result = resolveReference(
      reference,
      indexes,
      [...path, 'claimReferences', referenceIndex],
      experiment.competitorId,
    );
    if (result.errors.length > 0) {
      errors.push(...result.errors);
      errors.push(
        validationError(
          'UNSUPPORTED_EXPERIMENT_CLAIM',
          [...path, 'claimReferences', referenceIndex],
          'An experiment claim reference did not validate',
        ),
      );
    }
  }

  const validNumericClaims: GroundedNumericClaim[] = [];
  for (const [numericIndex, claim] of experiment.numericClaims.entries()) {
    const numericErrors = validateNumericClaim(
      claim,
      indexes,
      [...path, 'numericClaims', numericIndex],
      experiment.competitorId,
    );
    errors.push(...numericErrors);
    if (numericErrors.length === 0) validNumericClaims.push(claim);
    else {
      errors.push(
        validationError(
          'UNSUPPORTED_EXPERIMENT_CLAIM',
          [...path, 'numericClaims', numericIndex],
          'An experiment numeric claim did not validate',
        ),
      );
    }
  }

  const texts = [
    experiment.title,
    experiment.objective,
    experiment.hypothesisUnderTest,
    experiment.variableUnderTest,
    experiment.design.controlDescription,
    experiment.design.treatmentDescription,
    ...experiment.implementationNotes,
    experiment.caveat.statement,
  ];
  if (hasUnsupportedCausalCertainty(texts)) {
    errors.push(
      validationError(
        'EXPERIMENT_NOT_FRAMED_AS_TEST',
        [...path, 'hypothesisUnderTest'],
        'The experiment promises an outcome instead of framing it as a test',
      ),
    );
  }
  const experimentText = texts.join(' ');
  const competitorPerformancePattern =
    /\b(?:competitor|rival)\b[^.]*\b(?:conversion|revenue|sales|margin|performance|lift|rate)\b|\b(?:conversion|revenue|sales|margin|performance|lift|rate)\b[^.]*\b(?:competitor|rival)\b/i;
  if (competitorPerformancePattern.test(experimentText)) {
    errors.push(
      validationError(
        'UNSUPPORTED_EXPERIMENT_CLAIM',
        [...path, 'design'],
        'Experiment design cannot introduce competitor performance evidence',
      ),
    );
  }
  errors.push(
    ...knownDomainErrors(
      texts,
      indexes,
      [...path, 'prose'],
      'UNSUPPORTED_EXPERIMENT_CLAIM',
      'The experiment names a domain that is absent from the context',
    ),
  );
  const proseNumericErrors = unsupportedProseNumberErrors(
    texts,
    validNumericClaims,
    indexes,
    [...path, 'prose'],
  );
  errors.push(...proseNumericErrors);
  if (proseNumericErrors.length > 0) {
    errors.push(
      validationError(
        'UNSUPPORTED_EXPERIMENT_CLAIM',
        [...path, 'prose'],
        'The experiment introduces an unsupported numeric claim',
      ),
    );
  }
  const expectedCaveat = /shipping/i.test(experiment.variableUnderTest)
    ? 'shipping_margin_exposure'
    : /return|guarantee/i.test(experiment.variableUnderTest)
      ? 'policy_return_refund_exposure'
      : /subscription/i.test(experiment.variableUnderTest)
        ? 'subscription_customer_fit_and_cancellation'
        : /discount|promotion|bundle|bogo/i.test(experiment.variableUnderTest)
          ? 'promotion_margin_exposure'
          : undefined;
  if (expectedCaveat && experiment.caveat.category !== expectedCaveat) {
    errors.push(
      validationError(
        'INAPPROPRIATE_EXPERIMENT_CAVEAT',
        [...path, 'caveat', 'category'],
        `Expected ${expectedCaveat} for ${experiment.variableUnderTest}`,
      ),
    );
  }
  return errors;
}

function validateBriefing(
  briefing: LlmExecutiveBriefing,
  indexes: ContextIndexes,
  hypothesisResults: IndexedItemValidationResult[],
  hypothesisIndexesByRef: Map<string, number>,
): IntelligenceValidationError[] {
  const path = ['executiveBriefing'];
  const errors: IntelligenceValidationError[] = [];
  for (const hypothesisRef of briefing.supportingHypothesisRefs) {
    const hypothesisIndex = hypothesisIndexesByRef.get(hypothesisRef);
    if (hypothesisIndex === undefined) {
      errors.push(
        validationError(
          'INVALID_HYPOTHESIS_REFERENCE',
          [...path, 'supportingHypothesisRefs'],
          `Hypothesis ref ${hypothesisRef} is missing or ambiguous`,
        ),
      );
    } else if (hypothesisResults[hypothesisIndex]?.status !== 'accepted') {
      errors.push(
        validationError(
          'UNSUPPORTED_BRIEFING_CLAIM',
          [...path, 'supportingHypothesisRefs'],
          `Hypothesis ref ${hypothesisRef} is invalid`,
        ),
      );
    }
  }
  for (const [referenceIndex, reference] of briefing.claimReferences.entries()) {
    const result = resolveReference(reference, indexes, [
      ...path,
      'claimReferences',
      referenceIndex,
    ]);
    if (result.errors.length > 0) {
      errors.push(...result.errors);
      errors.push(
        validationError(
          'UNSUPPORTED_BRIEFING_CLAIM',
          [...path, 'claimReferences', referenceIndex],
          'A briefing claim reference did not validate',
        ),
      );
    }
  }
  const validNumericClaims: GroundedNumericClaim[] = [];
  for (const [numericIndex, claim] of briefing.numericClaims.entries()) {
    const numericErrors = validateNumericClaim(claim, indexes, [
      ...path,
      'numericClaims',
      numericIndex,
    ]);
    errors.push(...numericErrors);
    if (numericErrors.length === 0) validNumericClaims.push(claim);
    else {
      errors.push(
        validationError(
          'UNSUPPORTED_BRIEFING_CLAIM',
          [...path, 'numericClaims', numericIndex],
          'A briefing numeric claim did not validate',
        ),
      );
    }
  }
  const texts = [briefing.headline, briefing.strategicPostureSummary, briefing.keyTakeaway];
  errors.push(
    ...knownDomainErrors(
      texts,
      indexes,
      [...path, 'prose'],
      'UNSUPPORTED_BRIEFING_CLAIM',
      'The briefing names a domain that is absent from the context',
    ),
  );
  const numericErrors = unsupportedProseNumberErrors(texts, validNumericClaims, indexes, [
    ...path,
    'prose',
  ]);
  errors.push(...numericErrors);
  if (numericErrors.length > 0 || hasUnsupportedCausalCertainty(texts)) {
    errors.push(
      validationError(
        'UNSUPPORTED_BRIEFING_CLAIM',
        [...path, 'prose'],
        'The briefing introduces unsupported numeric or causal certainty',
      ),
    );
  }
  return errors;
}

function failedResult(errors: IntelligenceValidationError[]): IntelligenceValidationResult {
  return {
    status: 'failed',
    hypotheses: [],
    experiments: [],
    executiveBriefing: { status: 'rejected', errors },
    errors,
    acceptedOutput: { hypotheses: [], experiments: [] },
  };
}

export function validateIntelligenceSynthesis(
  input: ValidateIntelligenceSynthesisInput,
): IntelligenceValidationResult {
  const parsedContext = intelligenceContextSchema.safeParse(input.context);
  if (!parsedContext.success) {
    return failedResult(schemaErrors('INVALID_CONTEXT_SCHEMA', [], parsedContext.error.issues));
  }

  const fullOutputResult = llmIntelligenceSynthesisOutputSchema.safeParse(input.output);
  if (!isRecord(input.output)) {
    return failedResult(
      fullOutputResult.success
        ? []
        : schemaErrors('INVALID_OUTPUT_SCHEMA', [], fullOutputResult.error.issues),
    );
  }
  const rawHypotheses = input.output.hypotheses;
  const rawExperiments = input.output.experiments;
  const rawBriefing = input.output.executiveBriefing;
  if (!Array.isArray(rawHypotheses) || !Array.isArray(rawExperiments)) {
    return failedResult(
      fullOutputResult.success
        ? []
        : schemaErrors('INVALID_OUTPUT_SCHEMA', [], fullOutputResult.error.issues),
    );
  }

  const indexes = buildIndexes(parsedContext.data);
  const parsedHypotheses = rawHypotheses.map((value) =>
    llmStrategicHypothesisOutputSchema.safeParse(value),
  );
  const hypothesisValues = parsedHypotheses.map((result) =>
    result.success ? result.data : undefined,
  );
  const hypothesisIndexesByRef = new Map<string, number[]>();
  for (const [index, hypothesis] of hypothesisValues.entries()) {
    if (!hypothesis) continue;
    const refs = hypothesisIndexesByRef.get(hypothesis.ref) ?? [];
    refs.push(index);
    hypothesisIndexesByRef.set(hypothesis.ref, refs);
  }
  const uniqueHypothesisIndexesByRef = new Map<string, number>();
  for (const [ref, indexesForRef] of hypothesisIndexesByRef) {
    if (indexesForRef.length === 1) uniqueHypothesisIndexesByRef.set(ref, indexesForRef[0]!);
  }
  const hypotheses = parsedHypotheses.map((result, index): IndexedItemValidationResult => {
    const errors = result.success
      ? validateHypothesis(result.data, index, indexes)
      : schemaErrors('INVALID_OUTPUT_SCHEMA', ['hypotheses', index], result.error.issues);
    if (result.success && (hypothesisIndexesByRef.get(result.data.ref)?.length ?? 0) > 1) {
      errors.push(
        validationError(
          'INVALID_HYPOTHESIS_REFERENCE',
          ['hypotheses', index, 'ref'],
          `Hypothesis ref ${result.data.ref} is duplicated`,
        ),
      );
    }
    return { index, status: errors.length === 0 ? 'accepted' : 'rejected', errors };
  });

  const parsedExperiments = rawExperiments.map((value) =>
    llmRecommendedExperimentOutputSchema.safeParse(value),
  );
  const experiments = parsedExperiments.map((result, index): IndexedItemValidationResult => {
    let errors: IntelligenceValidationError[];
    if (result.success) {
      errors = validateExperiment(
        result.data,
        index,
        indexes,
        hypothesisValues,
        hypotheses,
        uniqueHypothesisIndexesByRef,
      );
    } else {
      errors = schemaErrors('INVALID_OUTPUT_SCHEMA', ['experiments', index], result.error.issues);
      const duplicate = duplicateMetricError(rawExperiments[index], index);
      if (duplicate) errors.unshift(duplicate);
      const raw = rawExperiments[index];
      if (
        isRecord(raw) &&
        isRecord(raw.design) &&
        raw.design.variablePolicy !== 'single_variable'
      ) {
        errors.unshift(
          validationError(
            'EXPERIMENT_NOT_SINGLE_VARIABLE',
            ['experiments', index, 'design', 'variablePolicy'],
            'Experiments must isolate one variable',
          ),
        );
      }
    }
    return { index, status: errors.length === 0 ? 'accepted' : 'rejected', errors };
  });

  const parsedBriefing = llmExecutiveBriefingSchema.safeParse(rawBriefing);
  const briefingErrors = parsedBriefing.success
    ? validateBriefing(parsedBriefing.data, indexes, hypotheses, uniqueHypothesisIndexesByRef)
    : schemaErrors('INVALID_OUTPUT_SCHEMA', ['executiveBriefing'], parsedBriefing.error.issues);
  const executiveBriefing: ItemValidationResult = {
    status: briefingErrors.length === 0 ? 'accepted' : 'rejected',
    errors: briefingErrors,
  };

  const globalErrors = fullOutputResult.success
    ? []
    : schemaErrors(
        'INVALID_OUTPUT_SCHEMA',
        [],
        fullOutputResult.error.issues.filter((issue) => {
          const [section, itemIndex] = issue.path;
          if (
            (section === 'hypotheses' || section === 'experiments') &&
            typeof itemIndex === 'number'
          ) {
            return false;
          }
          if (section === 'executiveBriefing' && issue.path.length > 1) return false;
          return true;
        }),
      );
  const errors = [
    ...globalErrors,
    ...hypotheses.flatMap((item) => item.errors),
    ...experiments.flatMap((item) => item.errors),
    ...executiveBriefing.errors,
  ];
  const acceptedOutput: IntelligenceValidationResult['acceptedOutput'] = {
    hypotheses: hypothesisValues.flatMap((hypothesis, index) =>
      hypothesis && hypotheses[index]!.status === 'accepted' ? [hypothesis] : [],
    ),
    experiments: parsedExperiments.flatMap((result, index) =>
      result.success && experiments[index]!.status === 'accepted' ? [result.data] : [],
    ),
    ...(parsedBriefing.success && executiveBriefing.status === 'accepted'
      ? { executiveBriefing: parsedBriefing.data }
      : {}),
  };
  const acceptedCount =
    acceptedOutput.hypotheses.length +
    acceptedOutput.experiments.length +
    (acceptedOutput.executiveBriefing ? 1 : 0);

  return {
    status: errors.length === 0 ? 'passed' : acceptedCount > 0 ? 'partial' : 'failed',
    hypotheses,
    experiments,
    executiveBriefing,
    errors,
    acceptedOutput,
  };
}
