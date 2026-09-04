import type { z } from 'zod';

export interface StructuredAiProvider {
  generate<TSchema extends z.ZodType>(input: {
    schema: TSchema;
    promptVersion: string;
  }): Promise<z.infer<TSchema>>;
}
