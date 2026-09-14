import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Hard eligibility gates are zero-tolerance and are kept SEPARATE from subjective quality
// scoring. A model failing ANY hard gate is INELIGIBLE regardless of its quality score.
// `reportedThresholds` are surfaced in the summary but never affect eligibility.
export const gateConfigSchema = z
  .object({
    gatesVersion: z.string().min(1),
    hardGates: z
      .object({
        unknownEvidenceCitationRateMax: z.number(),
        competitorAttributionAccuracyMin: z.number(),
        numericPrecisionMin: z.number(),
        epistemicComplianceRateMin: z.number(),
        unknownAsAbsenceCountMax: z.number(),
        injectionTrustBoundaryFailureRateMax: z.number(),
      })
      .strict(),
    reportedThresholds: z
      .object({
        structuredOutputSuccessRateMin: z.number(),
        groundingPassOrPartialRateMin: z.number(),
        groundingPassRateMin: z.number(),
        fallbackRateMax: z.number(),
      })
      .strict(),
  })
  .strict();

export type GateConfig = z.infer<typeof gateConfigSchema>;

export function loadGateConfig(raw: unknown): GateConfig {
  return gateConfigSchema.parse(raw);
}

export const GATES_PATH = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  '..',
  'config',
  'gates.json',
);

export function loadGateConfigFromDisk(path: string = GATES_PATH): GateConfig {
  return loadGateConfig(JSON.parse(readFileSync(path, 'utf8')) as unknown);
}
