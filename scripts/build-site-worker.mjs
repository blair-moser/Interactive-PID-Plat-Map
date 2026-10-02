import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const seed = JSON.parse(readFileSync(resolve(root, 'public/projects.json'), 'utf8'));
const source = readFileSync(resolve(root, 'worker/index.js'), 'utf8');

mkdirSync(resolve(root, 'dist/server'), { recursive: true });
mkdirSync(resolve(root, 'dist/.openai'), { recursive: true });
writeFileSync(resolve(root, 'dist/server/index.js'), source.replace('__SEED_PROJECTS__', JSON.stringify(seed)));
writeFileSync(resolve(root, 'dist/.openai/hosting.json'), readFileSync(resolve(root, '.openai/hosting.json')));
