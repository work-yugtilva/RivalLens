import type {
  ConnectorHealth,
  DiscoverInput,
  DiscoveredSource,
  ObservationCandidate,
  RawSnapshot,
} from '@rivallens/schemas';

export interface RivalConnector {
  discover(input: DiscoverInput): Promise<DiscoveredSource[]>;
  collect(source: DiscoveredSource): Promise<RawSnapshot>;
  normalize(snapshot: RawSnapshot): Promise<ObservationCandidate[]>;
  healthCheck(): Promise<ConnectorHealth>;
}
