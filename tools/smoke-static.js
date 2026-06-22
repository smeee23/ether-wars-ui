#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tiny-world-builder.html'), 'utf8');
const devServer = fs.readFileSync(path.join(root, 'tools/dev-server.js'), 'utf8');

function fail(message) {
  console.error('smoke failed:', message);
  process.exit(1);
}
function requireIncludes(text, label) {
  if (!html.includes(text)) fail('missing ' + label + ': ' + text);
}
function requireNotIncludes(text, label) {
  if (html.includes(text)) fail('unexpected ' + label + ': ' + text);
}

requireIncludes('function setCell(', 'state mutation entry point');
requireIncludes('function renderCellObject(', 'object renderer');
requireIncludes('function applyTool(', 'tool application');
requireIncludes('function doClear(', 'clear action');
requireIncludes('function trySpendForPlacementWithReplacement(', 'resource replacement accounting');
requireIncludes('function trySpendMockResourcesForReplacement(', 'full-level replacement refund helper');
requireIncludes("sheep: { label: 'Sheep', cost: { gold: 20 }, effect: { food: 20 } }", 'sheep food resource rule');
requireIncludes("cow: { label: 'Cow', cost: { gold: 40 }, effect: { food: 40 } }", 'cow food resource rule');
requireIncludes('function makeCowUnit(', 'leveled cow herd unit factory');
requireIncludes('function makeSheepUnit(', 'leveled sheep herd unit factory');
requireIncludes('function togglePerspective(', 'camera toggle');
requireIncludes('function runSeededVehicleDemo(', 'shareable vehicle seed demo');
requireIncludes('VEHICLE_DEMO_DEFAULT_SEED', 'vehicle demo default seed');
requireIncludes('vehicle-demo-badge', 'visible vehicle demo badge');
requireIncludes('M_VEHICLE.beacon', 'visible vehicle beacon marker');
requireIncludes('VEHICLE_COLLISION_RADIUS', 'vehicle collision radius');
requireIncludes('function getVehicleCollisionRisk(', 'vehicle collision risk check');
requireIncludes('function rerouteVehicleAroundTraffic(', 'traffic-aware vehicle reroute');
requireIncludes('function isVehicleDrivableCell(', 'object-aware vehicle drivable cell check');
requireIncludes('function refreshVehiclesForWorldObstacleChange(', 'vehicle reroute on world obstacle edits');
requireIncludes('__getVehicleRuntimeSnapshot', 'vehicle runtime debug snapshot');
requireIncludes('function makeCloud(', 'voxel cloud factory');
requireIncludes('function openTinyModal(', 'modal focus helper');
requireIncludes('customDepthMaterial', 'cloud shadow depth material');
requireIncludes('vendor/three/three.r128.min.js', 'self-hosted Three.js');
requireIncludes('vendor/three/GLTFLoader.r128.js', 'self-hosted GLTFLoader');

const oxygenMatch = html.match(/const OXYGEN_PER_LEVEL = (\d+);/);
const oxygenPerLevel = oxygenMatch ? Number(oxygenMatch[1]) : NaN;
const resourceRuleLine = /^\s+['"]?[\w-]+['"]?: \{ label: .*?cost: \{ gold: (\d+) \}, effect: \{ \w+: ([^ }]+) \}/gm;
let checkedResourceRules = 0;
for (const match of html.matchAll(resourceRuleLine)) {
  checkedResourceRules++;
  const cost = Number(match[1]);
  const rawEffect = match[2].replace(/[,}]/g, '');
  const effect = rawEffect === 'OXYGEN_PER_LEVEL' ? oxygenPerLevel : Number(rawEffect);
  if (effect !== cost) {
    fail(`resource reward must match credit cost: cost ${cost}, effect ${rawEffect}`);
  }
}
if (checkedResourceRules < 10) fail('resource reward parity check did not find expected rules');

const netlifyToml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
if (!netlifyToml.includes('publish = "dist"') || !netlifyToml.includes('command = "./publish.sh"')) {
  fail('netlify.toml does not point Netlify at publish.sh/dist');
}

requireNotIncludes('cdnjs.cloudflare.com/ajax/libs/three.js', 'Three.js CDN');
requireNotIncludes('cdn.jsdelivr.net/npm/three', 'GLTFLoader CDN');
requireNotIncludes('postTarget', 'post-processing render target');
requireNotIncludes('postMaterial', 'post-processing shader material');
requireNotIncludes('postProcessingEnabled', 'post-processing mode flag');
requireNotIncludes('render-smoothing', 'dead post smoothing control');
requireNotIncludes('<script type="module" src="cluso/cluso-embed.js"></script>', 'production-visible Cluso script tag');
requireNotIncludes('<link rel="stylesheet" href="cluso/cluso-embed.css">', 'production-visible Cluso stylesheet tag');

for (const asset of [
  'vendor/three/three.r128.min.js',
  'vendor/three/GLTFLoader.r128.js',
]) {
  if (!fs.existsSync(path.join(root, asset))) fail('missing local asset ' + asset);
}

// Dev server should now default to normal welcome menu (Farm) on bare access.
// Vehicle demo is available via the button in the welcome menu or by adding ?demo=vehicles manually.
if (!devServer.includes("if (pathname === '/') return { redirect: '/tiny-world-builder' };")) {
  fail('dev server bare root should redirect to /tiny-world-builder (welcome menu)');
}
if (!devServer.includes("if (pathname === '/tiny-world-builder') return { file:")) {
  fail('dev server should serve tiny-world-builder.html for normal access');
}

console.log('smoke ok');
