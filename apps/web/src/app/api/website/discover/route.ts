import { WebsiteConnector, WebsiteUrlSafetyError } from '@rivallens/connectors/website';
import { websiteDiscoveryRequestSchema } from '@rivallens/schemas';
import { NextResponse } from 'next/server';
import { ensureWebsiteSources } from '@/lib/internal/website-collection';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadAuthorizedWebsiteTarget } from '@/lib/website-target';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const payload = websiteDiscoveryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ error: 'Invalid website discovery request.' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const target = await loadAuthorizedWebsiteTarget(payload.data.subjectType, payload.data.subjectId);
  if (!target) return NextResponse.json({ error: 'Website target not found.' }, { status: 404 });

  try {
    const connector = new WebsiteConnector();
    const sources = await connector.discover({ subjectId: target.subjectId, canonicalUrl: target.domain });
    const sourceIds = await ensureWebsiteSources(target, sources);
    return NextResponse.json({ discovered: sourceIds.length, sources: sources.map((source, index) => ({ ...source, id: sourceIds[index] })) });
  } catch (error) {
    if (error instanceof WebsiteUrlSafetyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Website discovery failed.' }, { status: 422 });
  }
}
