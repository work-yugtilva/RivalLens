'use client';

import { useId, useState } from 'react';
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
  regenerate,
}: {
  report: ReportView;
  drawers: Record<string, EvidenceDrawerView>;
  competitorIds: string[];
  regenerate: (formData: FormData) => Promise<void>;
}) {
  const drawerId = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = selectedKey === null ? null : (drawers[selectedKey] ?? null);

  return (
    <>
      {report.notice ? <CompletenessNotice notice={report.notice} /> : null}
      {report.generationNotice ? (
        <GenerationNotice
          notice={report.generationNotice}
          competitorIds={competitorIds}
          regenerate={regenerate}
        />
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
              onSelect={setSelectedKey}
            />
          ))}
        </div>
      )}

      <EvidenceDrawer
        drawer={selected}
        drawerId={drawerId}
        open={selected !== null}
        onClose={() => setSelectedKey(null)}
      />
    </>
  );
}
