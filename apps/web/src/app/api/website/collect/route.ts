import { WebsiteConnector, WebsiteUrlSafetyError } from '@rivallens/connectors/website';
import { websiteCollectionRequestSchema, websiteRawSnapshotSchema } from '@rivallens/schemas';
import { NextResponse } from 'next/server';
import { runObservedChangeDetection } from '@/lib/internal/observed-change-detection';
import {
  markWebsiteSourceFailed,
  persistWebsiteObservations,
  persistWebsiteSnapshot,
} from '@/lib/internal/website-collection';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadAuthorizedWebsiteSource } from '@/lib/website-target';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const payload = websiteCollectionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: 'Invalid website collection request.' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const authorized = await loadAuthorizedWebsiteSource(payload.data.sourceId);
  if (!authorized) return NextResponse.json({ error: 'Website source not found.' }, { status: 404 });

  const connector = new WebsiteConnector();
  try {
    const snapshot = websiteRawSnapshotSchema.parse(await connector.collect(authorized.source));
    const persisted = await persistWebsiteSnapshot({ target: authorized.target, sourceId: payload.data.sourceId, snapshot });
    const observations = await persistWebsiteObservations({
      snapshotId: persisted.snapshotId,
      subjectId: authorized.target.subjectId,
      candidates: await connector.normalize(snapshot),
    });
    const changes = await runObservedChangeDetection({
      sourceId: payload.data.sourceId,
      sourceType: authorized.source.sourceType,
      subjectId: authorized.target.subjectId,
      snapshotId: persisted.snapshotId,
      capturedAt: snapshot.capturedAt,
    });
    return NextResponse.json(
      { sourceId: persisted.sourceId, snapshotId: persisted.snapshotId, observations, changes },
      { status: 201 },
    );
  } catch (error) {
    await markWebsiteSourceFailed(payload.data.sourceId, error).catch(() => undefined);
    if (error instanceof WebsiteUrlSafetyError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Website collection failed.' }, { status: 422 });
  }
}
