'use client';

import { useId, useRef, useState } from 'react';
import type { EvidenceDrawerView } from '@/lib/overview/provenance-types';
import type { ReportView } from '@/lib/overview/types';
import { CompletenessNotice, GenerationNotice } from './completeness-notice';
import { EvidenceDrawer } from './evidence-drawer';
import { InsufficientReport } from './report-states';
import { ReportSection } from './report-section';

/**
 * The report column and the drawer that explains it. Selection lives here so
 * that opening one item's evidence closes the previous one, and so the section
 * rows can show which item the drawer is currently answering for.
 */
export function OverviewReport({
  report,
  drawers,
  competitorIds,
}: {
  report: ReportView;
  drawers: Record<string, EvidenceDrawerView>;
  competitorIds: string[];
}) {
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = selectedKey === null ? null : (drawers[selectedKey] ?? null);

  return (
    <>
      {report.notice ? <CompletenessNotice notice={report.notice} /> : null}
      {report.generationNotice ? (
        <GenerationNotice notice={report.generationNotice} competitorIds={competitorIds} />
      ) : null}

      {report.briefing ? (
        <section className="mb-8 rounded-xl border border-rl-border bg-white p-6" aria-label="Executive briefing">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rl-faint">Executive briefing</p>
          <h2 className="mt-2 text-xl font-semibold text-rl-ink">{report.briefing.headline}</h2>
          <p className="mt-3 text-sm leading-6 text-rl-muted">{report.briefing.summary}</p>
          <p className="mt-3 text-sm font-medium text-rl-ink">{report.briefing.keyTakeaway}</p>
        </section>
      ) : null}

      {report.insufficient ? (
        <InsufficientReport insufficient={report.insufficient} />
      ) : (
        <div className="xl:w-[896px]">
          {report.sections.map((section, index) => (
            <ReportSection
              key={section.name}
              section={section}
              first={index === 0}
              last={index === report.sections.length - 1}
              selectedKey={selectedKey}
              drawerId={drawerId}
              onSelect={(key, trigger) => {
                triggerRef.current = trigger;
                setSelectedKey(key);
              }}
            />
          ))}
        </div>
      )}

      <EvidenceDrawer
        drawer={selected}
        drawerId={drawerId}
        open={selected !== null}
        onClose={() => setSelectedKey(null)}
        returnFocus={() => triggerRef.current?.focus({ preventScroll: true })}
      />
    </>
  );
}
