import type { Observation, Report, Signal, Snapshot } from '@rivallens/schemas';

export type { Observation, Report, Signal, Snapshot };

export const evidenceChain = ['source', 'snapshot', 'observation', 'change', 'signal', 'recommendation', 'report'] as const;

export * from './observed-changes';
export * from './current-state';
export * from './comparison';

export function buildWebsiteArtifactPath(input: {
  organizationId: string;
  subjectId: string;
  sourceId: string;
  snapshotId: string;
}) {
  return `${input.organizationId}/${input.subjectId}/web/${input.sourceId}/${input.snapshotId}.html.gz`;
}
