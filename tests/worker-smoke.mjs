import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

let row = null;
const DB = {
  prepare(sql) {
    let params = [];
    return {
      bind(...values) { params = values; return this; },
      async first() { return row; },
      async run() {
        if (sql.startsWith('INSERT')) {
          if (row) return { meta: { changes: 0 } };
          row = { version: 1, projects_json: params[0], updated_at: params[1] };
          return { meta: { changes: 1 } };
        }
        if (row?.version !== params[2]) return { meta: { changes: 0 } };
        row = { version: row.version + 1, projects_json: params[0], updated_at: params[1] };
        return { meta: { changes: 1 } };
      },
    };
  },
};

const api = 'https://interactive-pid-plat-map.bmoser3.chatgpt.site/api/projects';
const get = await worker.fetch(new Request(api, { headers: { Origin: 'https://blair-moser.github.io' } }), { DB });
assert.equal(get.status, 200);
assert.equal(get.headers.get('Access-Control-Allow-Origin'), 'https://blair-moser.github.io');
const initial = await get.json();
assert.equal(initial.version, 0);
assert.equal(initial.projects.length, 40);

const access = await worker.fetch(new Request('https://interactive-pid-plat-map.bmoser3.chatgpt.site/api/editor-status'), { DB });
assert.deepEqual(await access.json(), { signedIn: false, canPublish: false });

const unauthorized = await worker.fetch(new Request(api, {
  method: 'PUT',
  headers: { Origin: new URL(api).origin, 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseVersion: 0, projects: initial.projects }),
}), { DB });
assert.equal(unauthorized.status, 401);

const publish = (baseVersion, projects) => worker.fetch(new Request(api, {
  method: 'PUT',
  headers: {
    Origin: new URL(api).origin,
    'Content-Type': 'application/json',
    'oai-authenticated-user-email': 'blair.moser3+1@gmail.com',
  },
  body: JSON.stringify({ baseVersion, projects }),
}), { DB });

const firstSave = await publish(0, initial.projects);
const firstSaveBody = await firstSave.json();
assert.equal(firstSave.status, 200, JSON.stringify(firstSaveBody));
assert.equal(firstSaveBody.version, 1);

const current = await (await worker.fetch(new Request(api), { DB })).json();
assert.equal(current.version, 1);
assert.equal(current.projects.length, 40);
assert.equal((await publish(0, initial.projects)).status, 409);

const updated = structuredClone(initial.projects);
updated[0].x += 0.5;
assert.equal((await publish(1, updated)).status, 200);
const after = await (await worker.fetch(new Request(api), { DB })).json();
assert.equal(after.version, 2);
assert.equal(after.projects[0].x, updated[0].x);
console.log('Worker smoke checks passed.');
