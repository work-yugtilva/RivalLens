export {
  COMPETITIVE_SIGNAL_RULE_VERSION,
  CURRENT_COMPETITIVE_SIGNAL_RULE_VERSION,
  SUPPORTED_CURRENT_COMPETITIVE_SIGNAL_RULE_VERSIONS,
  currentCompetitiveSignalFamily,
  currentCompetitiveSignalLogicalIdentity,
  detectCompetitiveSignals,
  resolveCurrentCompetitiveSignals,
  type DetectCompetitiveSignalsInput,
  type EvidenceEnrichedObservedChange,
  type ResolveCurrentCompetitiveSignalsInput,
} from './signals';

export {
  STRATEGIC_HYPOTHESIS_ENGINE_VERSION,
  SUPPORTED_HYPOTHESIS_SIGNAL_RULE_VERSION,
  generateStrategicHypotheses,
  resolveCurrentStrategicHypotheses,
  type GenerateStrategicHypothesesInput,
  type ResolveCurrentStrategicHypothesesInput,
} from './hypotheses';

export {
  RECOMMENDED_EXPERIMENT_ENGINE_VERSION,
  SUPPORTED_EXPERIMENT_HYPOTHESIS_ENGINE_VERSION,
  generateRecommendedExperiments,
  type GenerateRecommendedExperimentsInput,
} from './experiments';

export {
  resolveCurrentRecommendedExperiments,
  type ResolveCurrentRecommendedExperimentsInput,
} from './current-experiments';

export {
  COMPETITIVE_REPORT_ENGINE_VERSION,
  COMPETITIVE_REPORT_SECTION_LIMIT,
  competitiveReportHash,
  composeCompetitiveIntelligenceReport,
} from './reports';

export {
  buildIntelligenceContext,
  canonicalContext,
  intelligenceContextHash,
  type BuildIntelligenceContextInput,
} from './context';

export {
  INTELLIGENCE_SYNTHESIS_PROMPT_VERSION,
  INTELLIGENCE_SYNTHESIS_SYSTEM_PROMPT,
} from './synthesis-prompt';

export {
  validateIntelligenceSynthesis,
  type IndexedItemValidationResult,
  type IntelligenceValidationError,
  type IntelligenceValidationErrorCode,
  type IntelligenceValidationResult,
  type ItemValidationResult,
  type ValidateIntelligenceSynthesisInput,
} from './validation';
