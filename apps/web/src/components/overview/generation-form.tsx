'use client';

import { createContext, useActionState, useContext } from 'react';

export type GenerationResult = { status: 'success' | 'error'; message: string };
export type GenerateReportAction = (formData: FormData) => Promise<GenerationResult>;
const GenerationContext = createContext<{
  action: (formData: FormData) => void;
  pending: boolean;
  result: GenerationResult | null;
} | null>(null);

export function GenerationProvider({
  generate,
  children,
}: {
  generate: GenerateReportAction;
  children: React.ReactNode;
}) {
  const [result, action, pending] = useActionState(
    async (_previous: GenerationResult | null, data: FormData): Promise<GenerationResult> => {
      try {
        return await generate(data);
      } catch {
        return {
          status: 'error',
          message:
            'The report request could not be completed. Check your connection and try again.',
        };
      }
    },
    null,
  );
  return (
    <GenerationContext.Provider value={{ result, action, pending }}>
      {children}
    </GenerationContext.Provider>
  );
}

function useGeneration() {
  const context = useContext(GenerationContext);
  if (!context) throw new Error('Report generation requires its provider.');
  return context;
}

export function GenerationForm({
  competitorIds,
  children,
  className,
}: {
  competitorIds: string[];
  children: (pending: boolean) => React.ReactNode;
  className?: string;
}) {
  const { action, pending } = useGeneration();
  return (
    <form action={action} aria-busy={pending} className={className}>
      {competitorIds.map((id) => (
        <input key={id} type="hidden" name="competitorIds" value={id} />
      ))}
      {children(pending)}
    </form>
  );
}

export function GenerationFeedback() {
  const { pending, result } = useGeneration();
  return (
    <div className="mx-4 tablet:mx-0 xl:w-[896px]">
      <p
        role="status"
        className={
          pending || result?.status === 'success' ? 'mb-5 text-13 text-rl-muted' : 'sr-only'
        }
      >
        {pending
          ? 'Generating the whole report…'
          : result?.status === 'success'
            ? result.message
            : ''}
      </p>
      {result?.status === 'error' && !pending ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-rl-rule p-3 text-13 leading-[1.5] text-rl-body"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
