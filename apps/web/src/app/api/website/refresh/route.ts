import { WebsiteConnector, WebsiteUrlSafetyError } from '@rivallens/connectors/website';
import { websiteRawSnapshotSchema, websiteRefreshRequestSchema } from '@rivallens/schemas';
import { NextResponse } from 'next/server';
import { runObservedChangeDetection } from '@/lib/internal/observed-change-detection';
import {
  ensureWebsiteSource,
  markWebsiteSourceFailed,
  persistWebsiteObservations,
  persistWebsiteSnapshot,
} from '@/lib/internal/website-collection';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadAuthorizedWebsiteTarget } from '@/lib/website-target';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const payload = websiteRefreshRequestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: 'Invalid website refresh request.' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const target = await loadAuthorizedWebsiteTarget(payload.data.subjectType, payload.data.subjectId);
  if (!target) return NextResponse.json({ error: 'Website target not found.' }, { status: 404 });

  const connector = new WebsiteConnector();
  let sourceId: string | undefined;

  try {
    const [source] = await connector.discoverHomepage({ subjectId: target.subjectId, canonicalUrl: target.domain });
    const resolvedSourceId = await ensureWebsiteSource(target, source);
    sourceId = resolvedSourceId;
    const snapshot = websiteRawSnapshotSchema.parse(await connector.collect(source));
    const persisted = await persistWebsiteSnapshot({ target, sourceId: resolvedSourceId, snapshot });
    const observations = await persistWebsiteObservations({
      snapshotId: persisted.snapshotId,
      subjectId: target.subjectId,
      candidates: await connector.normalize(snapshot),
    });
    const changes = await runObservedChangeDetection({
      sourceId: persisted.sourceId,
      sourceType: source.sourceType,
      subjectId: target.subjectId,
      snapshotId: persisted.snapshotId,
      capturedAt: snapshot.capturedAt,
    });

    return NextResponse.json(
      {
        sourceId: persisted.sourceId,
        snapshotId: persisted.snapshotId,
        finalUrl: snapshot.canonicalUrl,
        capturedAt: snapshot.capturedAt,
        observations,
        changes,
      },
      { status: 201 },
    );
  } catch (error) {
    if (sourceId) await markWebsiteSourceFailed(sourceId, error).catch(() => undefined);
    if (error instanceof WebsiteUrlSafetyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Website refresh failed.' }, { status: 422 });
  }
}
