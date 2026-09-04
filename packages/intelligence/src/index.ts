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
