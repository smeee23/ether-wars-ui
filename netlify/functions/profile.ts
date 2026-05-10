import type { Config } from '@netlify/functions';
import { db } from '../../db/index.js';
import { profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth0Token, unauthorized, corsHeaders, corsResponse } from './auth.js';

export default async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') return corsResponse(origin);

  const auth0Id = await verifyAuth0Token(req);
  if (!auth0Id) return unauthorized();

  const headers = corsHeaders(origin);

  if (req.method === 'GET') {
    const [profile] = await db.select().from(profiles).where(eq(profiles.auth0Id, auth0Id));
    if (!profile) return Response.json(null, { headers });
    return Response.json(profile, { headers });
  }

  if (req.method === 'PUT') {
    const body = await req.json();
    const { username, about, image } = body;

    const [existing] = await db.select().from(profiles).where(eq(profiles.auth0Id, auth0Id));

    if (existing) {
      const [updated] = await db
        .update(profiles)
        .set({
          username: username ?? existing.username,
          about: about ?? existing.about,
          image: image ?? existing.image,
          updatedAt: new Date(),
        })
        .where(eq(profiles.auth0Id, auth0Id))
        .returning();
      return Response.json(updated, { headers });
    }

    if (!username) {
      return Response.json({ error: 'username is required' }, { status: 400, headers });
    }
    const [created] = await db
      .insert(profiles)
      .values({ auth0Id, username, about: about || '', image: image || '' })
      .returning();
    return Response.json(created, { status: 201, headers });
  }

  return new Response('Method not allowed', { status: 405, headers });
};

export const config: Config = {
  path: '/api/profile',
};
