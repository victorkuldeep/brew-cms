import { NextRequest, NextResponse } from 'next/server';
import { handleApiRequest } from '@brew-cms/api';
import { cms } from '@/lib/cms';

export const dynamic = 'force-dynamic';

async function handler(
  req: NextRequest,
  context: { params: Promise<{ route: string[] }> }
) {
  const { route } = await context.params;
  const path = `/api/v1/${route.join('/')}`;
  const method = req.method;

  // Extract query parameters
  const searchParams = req.nextUrl.searchParams;
  const query: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    query[key] = val;
  });

  // Extract headers
  const headers: Record<string, string> = {};
  req.headers.forEach((val, key) => {
    headers[key.toLowerCase()] = val;
  });

  // Parse body for mutations
  let body: unknown = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Body not JSON or empty
    }
  }

  // Resolve actor: Studio uses default admin or user from session/auth header
  const actor = cms.getDefaultAdminActor();

  const apiResponse = await handleApiRequest(
    {
      method,
      path,
      query,
      headers,
      body,
      actor,
    },
    cms.getApiContext()
  );

  return NextResponse.json(apiResponse.body, {
    status: apiResponse.status,
    headers: apiResponse.headers,
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
};
