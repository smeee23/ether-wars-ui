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
requireIncludes("const RESOURCE_TIER_AMOUNTS = { small: 10, medium: 40, large: 100 };", 'resource tier credit amounts');
requireIncludes('function resourceRule(', 'centralized resource rule helper');
requireIncludes("sheep: resourceRule('Sheep', 'sheep', 'food', 'large')", 'sheep large food resource rule');
requireIncludes("cow: resourceRule('Cow', 'cow', 'food', 'large')", 'cow large food resource rule');
requireIncludes("fence: resourceRule('Fence', 'fence', 'army', 'small', 'military')", 'fence army resource rule');
requireIncludes("'crystal-mining-rig': resourceRule('Crystal Weapons Platform', 'crystal-mining-rig', 'army', 'medium', 'military')", 'crystal mining rig army resource rule');
requireIncludes("skyscraper: resourceRule('Command Center', 'skyscraper', 'shelter', 'large', 'civilian')", 'command center shelter resource rule');
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
requireIncludes('const colonyNavigationState = {', 'independent colony navigation state');
requireIncludes('function normalizedPublicColonies(', 'public colony normalization');
requireIncludes('function selectPlayerColony(', 'player colony selection');
requireIncludes('function selectNeighborColony(', 'neighbor colony selection');
requireIncludes('function enterNeighborInspection(', 'neighbor inspection entry');
requireIncludes('function exitNeighborInspection(', 'neighbor inspection restoration');
requireIncludes('function validateNeighborWorldSnapshot(', 'neighbor inspection context validation');
requireIncludes('function canMutateActiveColony(', 'central inspection mutation guard');
requireIncludes('id="neighbor-inspect-colony"', 'explicit neighbor inspection action');
requireIncludes('id="neighbor-inspection-return"', 'neighbor inspection return action');
requireIncludes('function setActiveNeighborById(', 'neighbor player selection');
requireIncludes('id="player-colony-toggle"', 'player colony toggle');
requireIncludes('id="neighbor-colony-toggle"', 'neighbor colony toggle');
requireIncludes('id="active-land-brand"', 'active land brand label');
requireIncludes('function updateActiveLandBrand(', 'active land brand updater');
requireIncludes('customDepthMaterial', 'cloud shadow depth material');
requireIncludes('vendor/three/three.r128.min.js', 'self-hosted Three.js');
requireIncludes('vendor/three/GLTFLoader.r128.js', 'self-hosted GLTFLoader');

const resourceRuleLine = /^\s+['"]?[\w-]+['"]?: resourceRule\('[^']+', '[^']+', '\w+', '(small|medium|large)'/gm;
let checkedResourceRules = 0;
for (const match of html.matchAll(resourceRuleLine)) {
  checkedResourceRules++;
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
requireNotIncludes("const HOME_NEIGHBOR_SELECTOR_ID", 'combined Home/neighbor selector state');
requireNotIncludes("label: 'Open land'", 'placeholder open-land distant slot');

for (const asset of [
  'vendor/three/three.r128.min.js',
  'vendor/three/GLTFLoader.r128.js',
  'assets/mock_neighbor_player_2.json',
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
