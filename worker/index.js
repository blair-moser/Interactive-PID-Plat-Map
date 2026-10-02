const OWNER_EMAIL = 'blair.moser3+1@gmail.com';
const GITHUB_ORIGIN = 'https://blair-moser.github.io';
const GITHUB_SITE = `${GITHUB_ORIGIN}/Interactive-PID-Plat-Map`;
const seedProjects = __SEED_PROJECTS__;

function corsHeaders(request) {
  return request.headers.get('Origin') === GITHUB_ORIGIN
    ? { 'Access-Control-Allow-Origin': GITHUB_ORIGIN, Vary: 'Origin' }
    : {};
}

function json(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(request),
    },
  });
}

function validText(value, max) {
  return typeof value === 'string' && value.length <= max;
}

function validAsset(value) {
  return validText(value, 2048) && (!value || !/^javascript:/i.test(value));
}

function validProject(project) {
  return project && validText(project.id, 120) && project.id.length > 0
    && validText(project.projectName, 200)
    && validText(project.shortDetails, 2000)
    && /^#[0-9a-fA-F]{6}$/.test(project.color)
    && Number.isFinite(project.x) && project.x >= 0 && project.x <= 100
    && Number.isFinite(project.y) && project.y >= 0 && project.y <= 100
    && Array.isArray(project.taxIds) && project.taxIds.length <= 500
    && project.taxIds.every((tax) => tax && validText(tax.id, 120)
      && validText(tax.taxId, 120) && validText(tax.label, 300)
      && validText(tax.owner, 300) && validAsset(tax.accountUrl)
      && (tax.platImage === undefined || validAsset(tax.platImage)))
    && (!project.projectPlatMap || (validText(project.projectPlatMap.id, 120)
      && validText(project.projectPlatMap.title, 300)
      && validAsset(project.projectPlatMap.file)
      && ['image', 'pdf'].includes(project.projectPlatMap.type)));
}

function validProjects(projects) {
  return Array.isArray(projects) && projects.length > 0 && projects.length <= 300
    && new Set(projects.map((item) => item?.id)).size === projects.length
    && projects.every(validProject);
}

async function readState(env) {
  return env.DB.prepare('SELECT version, projects_json, updated_at FROM map_state WHERE id = 1').first();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/projects') {
      if (request.method === 'OPTIONS') {
        if (request.headers.get('Origin') !== GITHUB_ORIGIN) return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders(request),
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '600',
          },
        });
      }
      if (!env.DB) return json(request, { error: 'Live map storage is unavailable.' }, 503);
      try {
        if (request.method === 'GET') {
          const row = await readState(env);
          return json(request, row
            ? { projects: JSON.parse(row.projects_json), version: row.version, updatedAt: row.updated_at }
            : { projects: seedProjects, version: 0, updatedAt: null });
        }
        if (request.method === 'PUT') {
          if (request.headers.get('Origin') !== url.origin) {
            return json(request, { error: 'Map changes must be published from the Sites editor.' }, 403);
          }
          const userEmail = request.headers.get('oai-authenticated-user-email')?.toLowerCase();
          if (!userEmail) return json(request, { error: 'Sign in to publish map changes.' }, 401);
          if (userEmail !== OWNER_EMAIL) {
            return json(request, { error: 'Only the site owner can publish map changes.' }, 403);
          }
          if (Number(request.headers.get('Content-Length')) > 2_000_000) {
            return json(request, { error: 'Map data is too large.' }, 413);
          }
          const body = await request.json();
          if (!Number.isInteger(body?.baseVersion) || body.baseVersion < 0 || !validProjects(body?.projects)) {
            return json(request, { error: 'Map data is invalid. Your browser draft is still intact.' }, 400);
          }
          const projectsJson = JSON.stringify(body.projects);
          if (projectsJson.length > 2_000_000) return json(request, { error: 'Map data is too large.' }, 413);
          const now = new Date().toISOString();
          const result = body.baseVersion === 0
            ? await env.DB.prepare('INSERT OR IGNORE INTO map_state (id, version, projects_json, updated_at) VALUES (1, 1, ?, ?)').bind(projectsJson, now).run()
            : await env.DB.prepare('UPDATE map_state SET projects_json = ?, version = version + 1, updated_at = ? WHERE id = 1 AND version = ?').bind(projectsJson, now, body.baseVersion).run();
          if (!result.meta?.changes) {
            return json(request, { error: 'A newer live version exists. Your browser draft was kept; reload before publishing again.' }, 409);
          }
          return json(request, { saved: true, version: body.baseVersion + 1, updatedAt: now });
        }
        return json(request, { error: 'Method not allowed.' }, 405);
      } catch (error) {
        console.error('Map storage failed', error);
        return json(request, { error: 'Could not reach live map storage. Your browser draft was kept.' }, 503);
      }
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }
    const upstreamUrl = `${GITHUB_SITE}${url.pathname}${url.search}`;
    try {
      const upstream = await fetch(upstreamUrl, { method: request.method });
      const headers = new Headers(upstream.headers);
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
    } catch (error) {
      console.error('Map asset proxy failed', error);
      return new Response('Map assets are temporarily unavailable.', { status: 503 });
    }
  },
};
