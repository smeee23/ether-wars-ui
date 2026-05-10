const JWKS_CACHE_TTL = 600_000;
let jwksCache: { keys: JsonWebKey[]; fetchedAt: number } | null = null;

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
}

function decodeJwtHeader(token: string): { kid?: string; alg?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
}

async function getJwks(domain: string): Promise<JsonWebKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!res.ok) throw new Error('Failed to fetch JWKS');
  const data = await res.json();
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function verifySignature(token: string, key: CryptoKey): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
}

export async function verifyAuth0Token(req: Request): Promise<string | null> {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  if (!domain || !audience) return null;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  try {
    const header = decodeJwtHeader(token);
    const payload = decodeJwtPayload(token);

    if (payload.iss !== `https://${domain}/`) return null;
    if (payload.aud !== audience && !(Array.isArray(payload.aud) && payload.aud.includes(audience))) return null;
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;

    const keys = await getJwks(domain);
    const jwk = keys.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;

    const cryptoKey = await importKey(jwk);
    const valid = await verifySignature(token, cryptoKey);
    if (!valid) return null;

    return payload.sub as string;
  } catch {
    return null;
  }
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function corsHeaders(origin?: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

export function corsResponse(origin?: string | null) {
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}
