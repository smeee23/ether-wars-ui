import type { Config } from '@netlify/edge-functions';

export default async (request: Request, context: any) => {
  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const domain = Deno.env.get('AUTH0_DOMAIN') || '';
  const clientId = Deno.env.get('AUTH0_CLIENT_ID') || '';
  const audience = Deno.env.get('AUTH0_AUDIENCE') || '';

  if (!domain || !clientId) return response;

  const html = await response.text();
  const injection = `<script>
    window.__AUTH0_DOMAIN = '${domain}';
    window.__AUTH0_CLIENT_ID = '${clientId}';
    window.__AUTH0_AUDIENCE = '${audience}';
  </script>`;

  const injected = html.replace('<head>', '<head>' + injection);
  return new Response(injected, {
    status: response.status,
    headers: response.headers,
  });
};

export const config: Config = {
  path: '/*',
};
