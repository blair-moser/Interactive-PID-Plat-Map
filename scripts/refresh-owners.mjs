import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectsPath = resolve(process.cwd(), process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : 'public/projects.json');
const dryRun = process.argv.includes('--dry-run');

const ACCOUNT_URL_PREFIX =
  'https://eweb.washco.utah.gov:8443/recorder/taxweb/account.jsp?accountNum=';
const ACCOUNT_URL_SUFFIX = '&submit=Public+Login&guest=true';
const ARCGIS_QUERY_URL =
  'https://agisprodvm.washco.utah.gov/arcgis/rest/services/ParcelOwners/MapServer/0/query';

function normalizeTaxId(value) {
  return String(value ?? '').trim().toUpperCase();
}

function escapeSqlLiteral(value) {
  return String(value).replaceAll("'", "''");
}

function makeAccountUrl(accountNumber) {
  const trimmed = String(accountNumber ?? '').trim();
  return trimmed ? `${ACCOUNT_URL_PREFIX}${encodeURIComponent(trimmed)}${ACCOUNT_URL_SUFFIX}` : '';
}

async function lookupTaxId(taxId) {
  const params = new URLSearchParams({
    f: 'json',
    where: `TAX_ID = '${escapeSqlLiteral(taxId)}'`,
    outFields: 'TAX_ID,ACCOUNTFULL,LABEL_NAME',
    returnGeometry: 'false',
  });
  const response = await fetch(`${ARCGIS_QUERY_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`County lookup failed for ${taxId}: ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  const feature = payload.features?.[0]?.attributes;
  if (!feature) return null;

  return {
    taxId: normalizeTaxId(feature.TAX_ID),
    owner: String(feature.LABEL_NAME ?? '').trim(),
    accountNumber: String(feature.ACCOUNTFULL ?? '').trim(),
    accountUrl: makeAccountUrl(feature.ACCOUNTFULL),
  };
}

function collectTaxIds(projects) {
  const taxIds = new Set();
  for (const project of projects) {
    for (const account of project.taxIds ?? []) {
      const taxId = normalizeTaxId(account.taxId);
      if (taxId) taxIds.add(taxId);
    }
  }
  return [...taxIds].sort();
}

const projects = JSON.parse(await readFile(projectsPath, 'utf8'));
const taxIds = collectTaxIds(projects);
const lookups = new Map();
const failures = [];

for (const taxId of taxIds) {
  try {
    lookups.set(taxId, await lookupTaxId(taxId));
  } catch (error) {
    failures.push({ taxId, message: error.message });
  }
}

let ownerUpdates = 0;
let accountUrlUpdates = 0;
let missing = 0;
const missingTaxIds = [];

for (const project of projects) {
  for (const account of project.taxIds ?? []) {
    const lookup = lookups.get(normalizeTaxId(account.taxId));
    if (!lookup) {
      missing += 1;
      missingTaxIds.push(account.taxId);
      continue;
    }
    if (lookup.owner && account.owner !== lookup.owner) {
      account.owner = lookup.owner;
      ownerUpdates += 1;
    }
    if (lookup.accountUrl && account.accountUrl !== lookup.accountUrl) {
      account.accountUrl = lookup.accountUrl;
      accountUrlUpdates += 1;
    }
  }
}

if (!dryRun) {
  await writeFile(projectsPath, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
}

console.log(`${dryRun ? 'Checked' : 'Refreshed'} ${taxIds.length} unique Tax IDs from Washington County.`);
console.log(`Owner updates: ${ownerUpdates}`);
console.log(`Account URL updates: ${accountUrlUpdates}`);
console.log(`County records not found: ${missing}`);
if (missingTaxIds.length) {
  for (const taxId of [...new Set(missingTaxIds)].slice(0, 10)) {
    console.log(`- missing: ${taxId}`);
  }
  if (missingTaxIds.length > 10) console.log(`- and ${missingTaxIds.length - 10} more missing records`);
}
if (failures.length) {
  console.log(`Lookup failures: ${failures.length}`);
  for (const failure of failures.slice(0, 10)) {
    console.log(`- ${failure.taxId}: ${failure.message}`);
  }
  if (failures.length > 10) console.log(`- and ${failures.length - 10} more`);
}
if (dryRun) console.log('Dry run only. No file was changed.');
