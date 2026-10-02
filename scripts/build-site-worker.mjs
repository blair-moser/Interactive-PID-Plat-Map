import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(resolve(root, 'public/projects.json'), 'utf8'));
const source = readFileSync(resolve(root, 'worker/index.js'), 'utf8');
const clientHtml = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const clientVersion = clientHtml.match(/assets\/index-([^"/]+)\.js/)?.[1];
if (!clientVersion) throw new Error('Could not identify the built map client.');

mkdirSync(resolve(root, 'dist/server'), { recursive: true });
mkdirSync(resolve(root, 'dist/.openai'), { recursive: true });
writeFileSync(resolve(root, 'dist/server/index.js'), source
  .replace('__SEED_PROJECTS__', JSON.stringify(seed))
  .replace('__CLIENT_VERSION__', clientVersion));
writeFileSync(resolve(root, 'dist/.openai/hosting.json'), readFileSync(resolve(root, '.openai/hosting.json')));
