// Narrow trusted-server entry point. Web callers add the framework-specific `server-only`
// sentinel at their boundary; Node-based evaluation tools can consume this contract directly.
export {
  orchestrateIntelligenceTrusted as orchestrateIntelligenceForPersistence,
  type TrustedIntelligenceOrchestrationResult,
} from './orchestration';
