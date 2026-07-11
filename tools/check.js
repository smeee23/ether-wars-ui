#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'tiny-world-builder.html');
const schemaPath = path.join(root, 'world.schema.json');
const vercelPath = path.join(root, 'vercel.json');
const netlifyPath = path.join(root, 'netlify.toml');
const html = fs.readFileSync(htmlPath, 'utf8');

function fail(message) {
  console.error('check failed:', message);
  process.exit(1);
}

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) fail('inline app script missing');
try {
  new Function(scriptMatch[1]);
} catch (err) {
  fail('inline app script syntax error: ' + err.message);
}

let externalSchema;
try {
  externalSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
} catch (err) {
  fail('world.schema.json is not valid JSON: ' + err.message);
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (err) {
    fail(relativePath + ' is not valid JSON: ' + err.message);
  }
}

const mockTournament = readJson('assets/mock_tournament_stats.json');
const mockTable = readJson('assets/mock_table_stats.json');
const mockPlayer = readJson('assets/mock_player_stats.json');
if (String(mockTable.tournamentId) !== String(mockTournament.tournamentId)
    || String(mockPlayer.tournamentId) !== String(mockTournament.tournamentId)) {
  fail('public mock tournament IDs must agree');
}
if (String(mockPlayer.tableId) !== String(mockTable.tableId)) {
  fail('public mock table IDs must agree');
}
if (!Array.isArray(mockTable.landlordIds) || !mockTable.landlordIds.map(String).includes(String(mockPlayer.landlordId))) {
  fail('public mock player must be assigned to the mock table');
}
if (Number(mockTable.roundNumber) !== Number(mockTournament.roundNumber)) {
  fail('public mock round numbers must agree');
}

const schemaStart = html.indexOf('  const WORLD_SCHEMA = ');
const schemaEnd = html.indexOf('\n\n  // -------- AI generation --------', schemaStart);
if (schemaStart < 0 || schemaEnd < 0) fail('embedded WORLD_SCHEMA block missing');
let embeddedSource = html.slice(schemaStart + '  const WORLD_SCHEMA = '.length, schemaEnd).trim();
if (embeddedSource.endsWith(';')) embeddedSource = embeddedSource.slice(0, -1);
let embeddedSchema;
try {
  embeddedSchema = JSON.parse(embeddedSource);
} catch (err) {
  fail('embedded WORLD_SCHEMA is not parseable JSON: ' + err.message);
}
if (JSON.stringify(embeddedSchema) !== JSON.stringify(externalSchema)) {
  fail('embedded WORLD_SCHEMA differs from world.schema.json');
}

const attrPattern = /<(script|link)\b[^>]*\s(?:src|href)=["']([^"']+)["']/gi;
const missing = [];
const remoteRuntime = [];
for (const match of html.matchAll(attrPattern)) {
  const tag = match[1].toLowerCase();
  const ref = match[2];
  if (/^(?:https?:)?\/\//.test(ref)) {
    if (tag === 'script') remoteRuntime.push(ref);
    continue;
  }
  if (ref.startsWith('data:') || ref.startsWith('#')) continue;
  const clean = ref.split(/[?#]/)[0];
  if (!clean || clean.startsWith('/')) continue;
  if (!fs.existsSync(path.join(root, clean))) missing.push(ref);
}
if (missing.length) fail('missing referenced static files: ' + missing.join(', '));
if (remoteRuntime.length) fail('remote script runtime references are not allowed: ' + remoteRuntime.join(', '));

if (!externalSchema.properties || !externalSchema.properties.gridSize) fail('schema missing gridSize contract');
const cellDef = externalSchema.$defs && externalSchema.$defs.cell;
if (!cellDef || !Array.isArray(cellDef.oneOf)) fail('schema must accept tuple and object cells via $defs.cell.oneOf');

let vercel;
try {
  vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
} catch (err) {
  fail('vercel.json is not valid JSON: ' + err.message);
}
const headers = ((vercel.headers || [])[0] || {}).headers || [];
if (!headers.some(h => h.key === 'Content-Security-Policy' && /script-src 'self'/.test(h.value || ''))) {
  fail('vercel.json missing self-hosted runtime CSP');
}

let netlifyText;
try {
  netlifyText = fs.readFileSync(netlifyPath, 'utf8');
} catch (err) {
  fail('netlify.toml missing or unreadable: ' + err.message);
}
for (const [needle, label] of [
  ['command = "./publish.sh"', 'Netlify build command'],
  ['publish = "dist"', 'Netlify publish directory'],
  ['NODE_VERSION = "22"', 'Netlify Node version'],
  ['Content-Security-Policy = "default-src', 'Netlify CSP header'],
  ['script-src \'self\'', 'Netlify self-hosted script policy'],
]) {
  if (!netlifyText.includes(needle)) fail('netlify.toml missing ' + label);
}

console.log('ok');
