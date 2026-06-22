#!/usr/bin/env node
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { URL } = require('url');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || process.argv[2] || 3000);
const aiLogDir = path.resolve(root, '.tinyworld-ai-logs');
const aiLogFile = path.resolve(aiLogDir, 'ai-debug.jsonl');
const s3Python = fs.existsSync(path.resolve(root, '.venv/bin/python'))
  ? path.resolve(root, '.venv/bin/python')
  : 'python3';

function loadEnvFile() {
  const envPath = path.resolve(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const types = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
}

function readJsonBody(req, maxBytes = 24 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function choose(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function numberInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function createLogId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeForLog(value, depth = 0) {
  if (depth > 8) return '[depth-limit]';
  if (value == null) return value;
  if (typeof value === 'string') {
    if (/^data:image\//i.test(value)) return `[image-data-url ${value.length} chars]`;
    if (value.length > 4000) return value.slice(0, 4000) + `...[truncated ${value.length - 4000} chars]`;
    return value;
  }
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    if (value.length > 2200) {
      return {
        truncatedArray: true,
        length: value.length,
        sample: value.slice(0, 2200).map(item => sanitizeForLog(item, depth + 1)),
      };
    }
    return value.map(item => sanitizeForLog(item, depth + 1));
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/authorization|api[_-]?key|token|secret|password/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = sanitizeForLog(item, depth + 1);
  }
  return out;
}

function sanitizeForPublicJson(value, depth = 0) {
  if (depth > 12) return null;
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => sanitizeForPublicJson(item, depth + 1));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/authorization|api[_-]?key|access[_-]?key|token|secret|password/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = sanitizeForPublicJson(item, depth + 1);
  }
  return out;
}

function appendAiLog(entry) {
  try {
    fs.mkdirSync(aiLogDir, { recursive: true });
    const row = {
      id: entry.id || createLogId(entry.kind || 'ai'),
      at: new Date().toISOString(),
      ...sanitizeForLog(entry),
    };
    fs.appendFileSync(aiLogFile, JSON.stringify(row) + '\n');
    return row.id;
  } catch (err) {
    console.warn('[ai-log] failed to write log:', err.message || err);
    return entry.id || null;
  }
}

function readAwsMockStats() {
  return readAwsJson('justcausepools', 'etherwars/mockstats.json');
}

function readAwsJson(bucket, key) {
  return new Promise((resolve, reject) => {
    const args = [
      path.resolve(root, 'S3ReadWrite.py'),
      '--read-json',
      '--bucket',
      bucket,
      '--key',
      key,
    ];
    execFile(s3Python, args, {
      cwd: root,
      env: process.env,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message || 'S3 mock stats read failed').trim();
        reject(new Error(detail));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (_) {
        reject(new Error('S3 mock stats response was not strict JSON'));
      }
    });
  });
}

function writeAwsJson(bucket, key, data) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join('/tmp', `tinyworld-inter-round-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    } catch (err) {
      reject(err);
      return;
    }

    const args = [
      path.resolve(root, 'S3ReadWrite.py'),
      '--write-json',
      tmpFile,
      '--bucket',
      bucket,
      '--key',
      key,
    ];
    execFile(s3Python, args, {
      cwd: root,
      env: process.env,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }, (err, _stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (err) {
        const detail = String(stderr || err.message || 'S3 JSON write failed').trim();
        reject(new Error(detail));
        return;
      }
      resolve();
    });
  });
}

function deleteAwsJson(bucket, key) {
  return new Promise((resolve, reject) => {
    const args = [
      path.resolve(root, 'S3ReadWrite.py'),
      '--delete-object',
      '--bucket',
      bucket,
      '--key',
      key,
    ];
    execFile(s3Python, args, {
      cwd: root,
      env: process.env,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }, (err, _stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message || 'S3 JSON delete failed').trim();
        reject(new Error(detail));
        return;
      }
      resolve();
    });
  });
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonNegativeIntOrNull(value) {
  const n = numberOrNull(value);
  return n === null ? null : Math.max(0, Math.round(n));
}

const COMMIT_PREVIEW_HASH_ALGORITHM = 'keccak256-abi';
const COMMIT_PREVIEW_PLAYER_ADDRESS_PLACEHOLDER = '0x0000000000000000000000000000000000000000';
const COMMIT_ACTION_CODES = { defend: 0, attack: 1, build: 2 };
const COMMIT_RESOURCE_KEYS = ['credits', 'food', 'water', 'oxygen', 'shelter', 'fleet'];
const COMMIT_BASE_TERRAIN = 'stone';

function stableCommitJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableCommitJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableCommitJson(value[key])).join(',') + '}';
}

function keccakRot(value, shift) {
  const n = BigInt(shift);
  return ((value << n) | (value >> (64n - n))) & 0xffffffffffffffffn;
}

function keccakF1600(state) {
  const rotc = [
    1,3,6,10,15,21,28,36,45,55,2,14,
    27,41,56,8,25,43,62,18,39,61,20,44,
  ];
  const piln = [
    10,7,11,17,18,3,5,16,8,21,24,4,
    15,23,19,13,12,2,20,14,22,9,6,1,
  ];
  const rc = [
    0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
    0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
    0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
    0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
    0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
    0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n,
  ];
  const bc = new Array(5);
  for (let round = 0; round < 24; round++) {
    for (let i = 0; i < 5; i++) {
      bc[i] = state[i] ^ state[i + 5] ^ state[i + 10] ^ state[i + 15] ^ state[i + 20];
    }
    for (let i = 0; i < 5; i++) {
      const t = bc[(i + 4) % 5] ^ keccakRot(bc[(i + 1) % 5], 1);
      for (let j = 0; j < 25; j += 5) state[j + i] ^= t;
    }
    let t = state[1];
    for (let i = 0; i < 24; i++) {
      const j = piln[i];
      const current = state[j];
      state[j] = keccakRot(t, rotc[i]);
      t = current;
    }
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i++) bc[i] = state[j + i];
      for (let i = 0; i < 5; i++) state[j + i] = bc[i] ^ ((~bc[(i + 1) % 5]) & bc[(i + 2) % 5]);
    }
    state[0] ^= rc[round];
  }
}

function keccak256Bytes(bytes) {
  const rate = 136;
  const state = new Array(25).fill(0n);
  for (let i = 0; i < bytes.length; i++) {
    const pos = i % rate;
    state[pos >> 3] ^= BigInt(bytes[i] & 255) << BigInt((pos & 7) * 8);
    if (pos === rate - 1) keccakF1600(state);
  }
  const pos = bytes.length % rate;
  state[pos >> 3] ^= 0x01n << BigInt((pos & 7) * 8);
  state[(rate - 1) >> 3] ^= 0x80n << BigInt(((rate - 1) & 7) * 8);
  keccakF1600(state);
  const out = [];
  for (let i = 0; i < 32; i++) out.push(Number((state[i >> 3] >> BigInt((i & 7) * 8)) & 0xffn));
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => (b & 255).toString(16).padStart(2, '0')).join('');
}

function keccak256Hex(bytes) {
  return '0x' + bytesToHex(keccak256Bytes(bytes));
}

function keccak256Utf8(text) {
  return keccak256Hex(Buffer.from(String(text), 'utf8'));
}

function commitHashObject(value) {
  return keccak256Utf8(stableCommitJson(value));
}

function randomBytes32Hex() {
  return '0x' + crypto.randomBytes(32).toString('hex');
}

function normalizeBytes32Hex(value) {
  const text = String(value || '').trim();
  return /^0x[0-9a-f]{64}$/i.test(text) ? text.toLowerCase() : null;
}

function normalizeAddressHex(value) {
  const text = String(value || '').trim();
  return /^0x[0-9a-f]{40}$/i.test(text) ? text.toLowerCase() : COMMIT_PREVIEW_PLAYER_ADDRESS_PLACEHOLDER;
}

function commitUintWord(value) {
  const n = BigInt(Math.max(0, Math.round(Number(value) || 0)));
  return n.toString(16).padStart(64, '0');
}

function commitAddressWord(value) {
  return normalizeAddressHex(value).slice(2).padStart(64, '0');
}

function commitBytes32Word(value) {
  return (normalizeBytes32Hex(value) || ('0x' + '0'.repeat(64))).slice(2);
}

function commitAbiEncodedHex(preimage) {
  return '0x' + [
    commitAddressWord(preimage.playerAddress),
    commitUintWord(preimage.roundNumber),
    commitUintWord(preimage.actionTypeCode),
    commitBytes32Word(preimage.targetId),
    commitUintWord(preimage.wagerAmount),
    commitBytes32Word(preimage.resourceAllocationHash),
    commitBytes32Word(preimage.worldSnapshotHash),
    commitBytes32Word(preimage.salt),
  ].join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '').replace(/^0x/i, '');
  const bytes = [];
  for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16) || 0);
  return bytes;
}

function targetIdForCommit(targetNeighborId) {
  const target = String(targetNeighborId || '');
  return target ? keccak256Utf8(target) : '0x' + '0'.repeat(64);
}

function normalizeHexColor(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(s)) return ('#' + s).toLowerCase();
  return null;
}

function normalizeCommitAppearance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const bodyColor = normalizeHexColor(value.bodyColor || value.body || value.wallColor || value.walls);
  const topColor = normalizeHexColor(value.topColor || value.top || value.roofColor || value.roof);
  const rawVoxelBuildId = value.voxelBuildId || value.voxelBuild || value.stampId || value.stamp;
  const voxelBuildId = (typeof rawVoxelBuildId === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(rawVoxelBuildId))
    ? rawVoxelBuildId
    : null;
  const rawScale = Array.isArray(value.objectScale) || Array.isArray(value.scale)
    ? null
    : (value.objectScale !== undefined ? value.objectScale : value.scale);
  const objectScaleNumber = rawScale === null ? NaN : Number(rawScale);
  const objectScale = Number.isFinite(objectScaleNumber)
    ? Math.max(0.25, Math.min(4, objectScaleNumber))
    : null;
  const rawObjectStyle = String(value.objectStyle || value.style || '').toLowerCase();
  const objectStyle = rawObjectStyle === 'normal' || rawObjectStyle === 'voxel'
    ? rawObjectStyle
    : null;
  const out = {};
  if (bodyColor) out.bodyColor = bodyColor;
  if (topColor) out.topColor = topColor;
  if (voxelBuildId) out.voxelBuildId = voxelBuildId;
  if (objectScale !== null && Math.abs(objectScale - 1) > 0.001) out.objectScale = +objectScale.toFixed(3);
  if (objectStyle) out.objectStyle = objectStyle;
  return Object.keys(out).length ? out : null;
}

function normalizeCommitCell(entry) {
  let x, z, terrain, kind, floors, buildingType, terrainFloors, fenceSide, extras, transform, appearance;
  if (Array.isArray(entry)) {
    [x, z, terrain, kind, floors, buildingType, terrainFloors, fenceSide, extras, transform, appearance] = entry;
  } else if (entry && typeof entry === 'object') {
    ({ x, z, terrain, kind, floors, buildingType, terrainFloors, fenceSide, extras, transform, appearance } = entry);
  }
  x = Math.round(Number(x));
  z = Math.round(Number(z));
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  let rotationY = 0, offsetX = 0, offsetZ = 0;
  if (Array.isArray(transform)) {
    rotationY = Number(transform[0]) || 0;
    offsetX = Number(transform[1]) || 0;
    offsetZ = Number(transform[2]) || 0;
  } else if (transform && typeof transform === 'object') {
    rotationY = Number(transform.rotationY) || 0;
    offsetX = Number(transform.offsetX) || 0;
    offsetZ = Number(transform.offsetZ) || 0;
  }
  const normalizedExtras = Array.isArray(extras)
    ? extras.map(e => ({
        kind: (e && (e.kind || e.k)) || null,
        fenceSide: (e && (e.fenceSide || e.s)) || null,
        floors: Math.max(1, Math.round(Number(e && (e.floors || e.f)) || 1)),
      })).filter(e => e.kind).sort((a, b) => (
        String(a.kind).localeCompare(String(b.kind))
        || String(a.fenceSide || '').localeCompare(String(b.fenceSide || ''))
        || a.floors - b.floors
      ))
    : [];
  return {
    x,
    z,
    terrain: terrain || COMMIT_BASE_TERRAIN,
    terrainFloors: Math.max(1, Math.round(Number(terrainFloors) || 1)),
    kind: kind || null,
    floors: Math.max(1, Math.round(Number(floors) || 1)),
    buildingType: buildingType || null,
    fenceSide: fenceSide || null,
    extras: normalizedExtras,
    transform: {
      rotationY,
      offsetX,
      offsetZ,
    },
    appearance: normalizeCommitAppearance(appearance),
  };
}

function normalizeCommitWorldSnapshot(worldSnapshot) {
  const cells = Array.isArray(worldSnapshot && worldSnapshot.cells)
    ? worldSnapshot.cells.map(normalizeCommitCell).filter(Boolean)
    : [];
  cells.sort((a, b) => (a.x - b.x) || (a.z - b.z));
  return {
    schema: 'etherlands.world.v1',
    gridSize: Math.max(1, Math.round(Number(worldSnapshot && worldSnapshot.gridSize) || 15)),
    cells,
  };
}

function normalizeCommitResourceAllocation(proposedResources, proposedAllocations) {
  const resourcesOut = {};
  for (const key of COMMIT_RESOURCE_KEYS) {
    resourcesOut[key] = nonNegativeIntOrNull(proposedResources && proposedResources[key]) || 0;
  }
  return {
    resources: resourcesOut,
    allocations: {
      creditSpend: nonNegativeIntOrNull(proposedAllocations && proposedAllocations.creditSpend) || 0,
      wagerAmount: nonNegativeIntOrNull(proposedAllocations && proposedAllocations.wagerAmount) || 0,
    },
  };
}

function buildCommitPreimageFromInterRoundState(body, opts = {}) {
  const interRoundState = body.interRoundState || {};
  const roundAction = interRoundState.roundAction || {};
  const proposedAllocations = interRoundState.proposedAllocations || {};
  const actionType = String(roundAction.selectedAction || 'defend').toLowerCase();
  const wagerAmount = nonNegativeIntOrNull(roundAction.wagerAmount ?? proposedAllocations.wagerAmount) || 0;
  const targetNeighborId = roundAction.selectedTargetNeighborId ? String(roundAction.selectedTargetNeighborId) : '';
  return {
    schema: 'etherlands.commit-preimage.v1',
    playerId: String(body.playerId || 'player-1'),
    playerAddress: normalizeAddressHex(opts.playerAddress || COMMIT_PREVIEW_PLAYER_ADDRESS_PLACEHOLDER),
    roundNumber: nonNegativeIntOrNull(body.roundNumber) || 0,
    actionType,
    actionTypeCode: Object.prototype.hasOwnProperty.call(COMMIT_ACTION_CODES, actionType) ? COMMIT_ACTION_CODES[actionType] : 0,
    targetNeighborId,
    targetId: targetIdForCommit(targetNeighborId),
    wagerAmount,
    proposedAllocations: opts.proposedAllocations || normalizeCommitResourceAllocation(interRoundState.proposedResources || {}, proposedAllocations).allocations,
    resourceAllocationHash: opts.resourceAllocationHash,
    worldSnapshotHash: opts.worldSnapshotHash,
    salt: normalizeBytes32Hex(opts.salt) || randomBytes32Hex(),
  };
}

function buildCommitPreviewFromInterRoundState(body) {
  const interRoundState = body.interRoundState || {};
  const submittedPreview = interRoundState.commitPreview || {};
  const submittedPreimage = submittedPreview.preimage || {};
  const normalizedWorld = normalizeCommitWorldSnapshot(interRoundState.proposedWorld || {});
  const normalizedResources = normalizeCommitResourceAllocation(interRoundState.proposedResources || {}, interRoundState.proposedAllocations || {});
  const worldSnapshotHash = commitHashObject(normalizedWorld);
  const resourceAllocationHash = commitHashObject(normalizedResources);
  const preimage = buildCommitPreimageFromInterRoundState(body, {
    playerAddress: submittedPreimage.playerAddress,
    salt: submittedPreimage.salt,
    worldSnapshotHash,
    resourceAllocationHash,
    proposedAllocations: normalizedResources.allocations,
  });
  return {
    preimage,
    worldSnapshotHash,
    resourceAllocationHash,
    commitHash: keccak256Hex(hexToBytes(commitAbiEncodedHex(preimage))),
    hashAlgorithm: COMMIT_PREVIEW_HASH_ALGORITHM,
    isDevOnly: true,
  };
}

function validateCommitPreview(body) {
  const preview = body.interRoundState && body.interRoundState.commitPreview;
  if (!preview) return { ok: true, recomputed: buildCommitPreviewFromInterRoundState(body), matched: false };
  const recomputed = buildCommitPreviewFromInterRoundState(body);
  const fields = ['worldSnapshotHash', 'resourceAllocationHash', 'commitHash', 'hashAlgorithm', 'isDevOnly'];
  for (const field of fields) {
    if (preview[field] !== recomputed[field]) {
      return { ok: false, error: `commitPreview.${field} does not match recomputed draft hash` };
    }
  }
  if (stableCommitJson(preview.preimage) !== stableCommitJson(recomputed.preimage)) {
    return { ok: false, error: 'commitPreview.preimage does not match recomputed draft preimage' };
  }
  return { ok: true, recomputed, matched: true };
}

function validateInterRoundStatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'Body must be a JSON object' };
  }
  const playerId = String(body.playerId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) {
    return { ok: false, status: 400, error: 'playerId is required and must be URL-safe' };
  }
  const phase = String(body.phase || '').trim().toLowerCase();
  if (phase !== 'commit') {
    return { ok: false, status: 409, error: 'interRoundState can only be saved during commit phase' };
  }
  if (!body.lastRevealState || typeof body.lastRevealState !== 'object' || Array.isArray(body.lastRevealState)) {
    return { ok: false, status: 400, error: 'lastRevealState is required' };
  }
  if (!body.interRoundState || typeof body.interRoundState !== 'object' || Array.isArray(body.interRoundState)) {
    return { ok: false, status: 400, error: 'interRoundState is required' };
  }

  const lastRevealState = body.lastRevealState;
  const requiredResources = ['credits', 'food', 'water', 'oxygen', 'shelter', 'fleet'];
  for (const key of requiredResources) {
    if (nonNegativeIntOrNull(lastRevealState[key]) === null) {
      return { ok: false, status: 400, error: `lastRevealState.${key} is required` };
    }
  }

  const roundNumber = nonNegativeIntOrNull(body.roundNumber);
  const lastRoundNumber = nonNegativeIntOrNull(lastRevealState.roundNumber);
  if (!roundNumber || !lastRoundNumber || roundNumber !== lastRoundNumber) {
    return { ok: false, status: 409, error: 'roundNumber must match lastRevealState.roundNumber' };
  }

  const credits = nonNegativeIntOrNull(lastRevealState.credits);
  const interRoundState = body.interRoundState;
  const roundAction = interRoundState.roundAction || {};
  const wager = nonNegativeIntOrNull(roundAction.wagerAmount ?? interRoundState.wagerAmount) || 0;
  const proposedResources = interRoundState.proposedResources || {};
  const proposedCredits = nonNegativeIntOrNull(proposedResources.credits);
  const proposedAllocations = interRoundState.proposedAllocations || {};
  const explicitSpend = nonNegativeIntOrNull(proposedAllocations.creditSpend);
  const inferredSpend = proposedCredits === null ? 0 : Math.max(0, credits - proposedCredits);
  const creditSpend = explicitSpend === null ? inferredSpend : explicitSpend;

  if (creditSpend > credits) {
    return { ok: false, status: 409, error: 'proposed credit spend exceeds lastRevealState.credits' };
  }
  if (proposedCredits !== null && proposedCredits > credits) {
    return { ok: false, status: 409, error: 'proposed credits exceed lastRevealState.credits' };
  }
  let totalResourceGain = 0;
  const resourcePairs = [
    ['food', 'food'],
    ['water', 'water'],
    ['oxygen', 'oxygen'],
    ['shelter', 'shelter'],
    ['fleet', 'fleet'],
  ];
  for (const [proposedKey, baselineKey] of resourcePairs) {
    const proposed = nonNegativeIntOrNull(proposedResources[proposedKey]);
    if (proposed === null) continue;
    const baseline = nonNegativeIntOrNull(lastRevealState[baselineKey]) || 0;
    totalResourceGain += Math.max(0, proposed - baseline);
  }
  if (totalResourceGain > creditSpend) {
    return { ok: false, status: 409, error: 'total proposed resource gain exceeds proposed credit spend' };
  }
  if (wager > credits) {
    return { ok: false, status: 409, error: 'attack wager exceeds lastRevealState.credits' };
  }
  if (String(roundAction.selectedAction || '').toLowerCase() === 'attack' && wager <= 0) {
    return { ok: false, status: 409, error: 'attack action requires a positive wager' };
  }

  const commitPreviewValidation = validateCommitPreview(body);
  if (!commitPreviewValidation.ok) {
    return { ok: false, status: 409, error: commitPreviewValidation.error };
  }

  const bucket = 'justcausepools';
  const key = `etherwars/players/${playerId}/round-${roundNumber}/interRoundState.json`;
  if (!key.startsWith('etherwars/players/') || !key.endsWith('/interRoundState.json')) {
    return { ok: false, status: 400, error: 'Unsafe S3 key' };
  }

  const updatedAt = new Date().toISOString();
  const safeBody = sanitizeForPublicJson({
    ...body,
    interRoundState: {
      ...interRoundState,
      commitPreview: commitPreviewValidation.recomputed,
    },
    phase,
    playerId,
    roundNumber,
    updatedAt,
    serverValidation: {
      status: 'accepted',
      creditSpend,
      totalResourceGain,
      wager,
      commitPreviewStatus: commitPreviewValidation.matched ? 'matched' : 'server-generated',
      checkedAt: updatedAt,
    },
  });
  return { ok: true, bucket, key, updatedAt, body: safeBody };
}

function interRoundStateTargetFromParams(params) {
  const playerId = String(params.get('playerId') || '').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) {
    return { ok: false, status: 400, error: 'playerId is required and must be URL-safe' };
  }
  const roundNumber = nonNegativeIntOrNull(params.get('roundNumber'));
  if (!roundNumber) {
    return { ok: false, status: 400, error: 'roundNumber is required' };
  }
  const bucket = 'justcausepools';
  const key = `etherwars/players/${playerId}/round-${roundNumber}/interRoundState.json`;
  if (!key.startsWith('etherwars/players/') || !key.endsWith('/interRoundState.json')) {
    return { ok: false, status: 400, error: 'Unsafe S3 key' };
  }
  return { ok: true, bucket, key, playerId, roundNumber };
}

async function handleMockStats(req, res) {
  if (req.method !== 'GET') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET' });
    return;
  }
  try {
    const data = await readAwsMockStats();
    send(res, 200, JSON.stringify(sanitizeForPublicJson(data)), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  } catch (err) {
    console.warn('[mockstats] failed:', err.message || String(err));
    send(res, 502, JSON.stringify({
      ok: false,
      error: 'Unable to read Ether Wars mock stats from S3',
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }
}

async function handleInterRoundState(req, res) {
  const reqUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'GET') {
    const target = interRoundStateTargetFromParams(reqUrl.searchParams);
    if (!target.ok) {
      send(res, target.status, JSON.stringify({ ok: false, error: target.error }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }
    try {
      const data = await readAwsJson(target.bucket, target.key);
      send(res, 200, JSON.stringify({
        ok: true,
        bucket: target.bucket,
        key: target.key,
        state: sanitizeForPublicJson(data),
      }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    } catch (err) {
      console.warn('[inter-round-state] read failed:', err.message || String(err));
      send(res, 404, JSON.stringify({
        ok: false,
        error: 'Unable to read Ether Wars interRoundState',
      }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    return;
  }
  if (req.method === 'DELETE') {
    const target = interRoundStateTargetFromParams(reqUrl.searchParams);
    if (!target.ok) {
      send(res, target.status, JSON.stringify({ ok: false, error: target.error }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }
    try {
      await deleteAwsJson(target.bucket, target.key);
      send(res, 200, JSON.stringify({
        ok: true,
        bucket: target.bucket,
        key: target.key,
        deleted: true,
      }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    } catch (err) {
      console.warn('[inter-round-state] delete failed:', err.message || String(err));
      send(res, 500, JSON.stringify({
        ok: false,
        error: 'Unable to delete Ether Wars interRoundState',
      }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    return;
  }
  if (req.method !== 'POST') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, POST, DELETE' });
    return;
  }
  try {
    const body = await readJsonBody(req, 2 * 1024 * 1024);
    const result = validateInterRoundStatePayload(body);
    if (!result.ok) {
      send(res, result.status, JSON.stringify({ ok: false, error: result.error }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }
    await writeAwsJson(result.bucket, result.key, result.body);
    send(res, 200, JSON.stringify({
      ok: true,
      bucket: result.bucket,
      key: result.key,
      updatedAt: result.updatedAt,
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  } catch (err) {
    console.warn('[inter-round-state] failed:', err.message || String(err));
    send(res, 500, JSON.stringify({
      ok: false,
      error: 'Unable to save Ether Wars interRoundState',
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }
}

function readAiLog(limit = 40) {
  if (!fs.existsSync(aiLogFile)) return [];
  const lines = fs.readFileSync(aiLogFile, 'utf8').trim().split(/\n/).filter(Boolean);
  return lines.slice(-limit).map(line => {
    try { return JSON.parse(line); } catch (_) { return { parseError: true, line }; }
  });
}

function voxelPartsSchema(allowedMaterials) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      notes: { type: 'string' },
      customParts: {
        type: 'array',
        maxItems: 180,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            kind: { type: 'string', enum: ['box', 'cylinder', 'cone'] },
            material: { type: 'string', enum: allowedMaterials.length ? allowedMaterials : ['stone'] },
            size: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'number' },
            },
            pos: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'number' },
            },
            scale: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'number' },
            },
          },
          required: ['id', 'kind', 'material', 'size', 'pos', 'scale'],
        },
      },
    },
    required: ['notes', 'customParts'],
  };
}

function extractJsonText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) return response.output_text;
  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function parseModelJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('Model returned no text');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) return JSON.parse(fenced[1]);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw err;
  }
}

function openaiRequest(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Promise.reject(new Error('OPENAI_API_KEY is not set in this dev server environment'));
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/responses',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (apiRes) => {
      let raw = '';
      apiRes.on('data', (chunk) => {
        raw += chunk;
      });
      apiRes.on('end', () => {
        let parsed;
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch (err) {
          reject(new Error(`OpenAI returned non-JSON response (${apiRes.statusCode})`));
          return;
        }
        if (apiRes.statusCode < 200 || apiRes.statusCode >= 300) {
          reject(new Error(parsed.error?.message || `OpenAI request failed with ${apiRes.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function handleReinterpretStamp(req, res) {
  const logId = createLogId('reinterpret');
  try {
    const input = await readJsonBody(req);
    const model = String(input.model || 'gpt-5.5').trim();
    const allowedMaterials = Array.isArray(input.allowedMaterials) ? input.allowedMaterials : [];
    const reasoningEffort = choose(input.reasoningEffort, ['none', 'low', 'medium', 'high', 'xhigh'], 'low');
    const reasoningSummary = choose(input.reasoningSummary, ['off', 'auto', 'concise', 'detailed'], 'off');
    const textVerbosity = choose(input.textVerbosity, ['low', 'medium', 'high'], 'low');
    const maxOutputTokens = numberInRange(input.maxOutputTokens, 12000, 1000, 128000);
    const schemaInstruction = [
      'You are generating geometry for a Three.js voxel stamp builder.',
      'Return ONLY valid JSON, no markdown.',
      'The JSON shape must be: {"customParts":[...], "notes":"short optional note"}.',
      'Each customParts item must be:',
      '{"id": string, "kind": "box"|"cylinder"|"cone", "material": one of allowedMaterials, "size": [x,y,z], "pos": [x,y,z], "scale": [1,1,1]}.',
      'Use semantic reinterpretation: do not merely stretch source parts.',
      'Increase detail with small trim blocks, windows, roof ribs, railings, bevel-like layered bands, doors, caps, and silhouette-defining parts.',
      'When source parts are empty, create a new original stamp from instruction and imageInstruction, using semantic construction rather than placeholder masses.',
      'Quality contract: produce a readable asset from the default isometric camera with distinct base, body, top, trim, and detail parts where those concepts apply.',
      'Use a richer part count for complex assets, but keep parts purposeful and connected; avoid noisy random cubes.',
      'Keep total customParts under 180 and dimensions within a compact stamp footprint.',
      'Preserve selectedObject.label, selectedObject.stamp, and the sourceCustomParts category exactly unless instruction explicitly asks for a different object.',
      'Do not introduce Japanese, pagoda, temple, shrine, torii, sakura, or garden styling unless the instruction or selectedObject explicitly asks for it.',
      'Keep all returned parts grounded, connected to the selected object, and inside allowedBounds when provided.',
      'Do not create detached floating rings, detached columns, orbiting blocks, crosses, or symbols.',
    ].join('\n');
    const userText = JSON.stringify({
      allowedMaterials,
      instruction: input.instruction || '',
      selectedObject: input.selectedObject || null,
      sourceParts: input.sourceParts || [],
      sourceCustomParts: input.sourceCustomParts || [],
      sourceBounds: input.sourceBounds || null,
      allowedBounds: input.allowedBounds || null,
      renderFootprint: input.renderFootprint || null,
      desiredScale: input.desiredScale || [1, 1, 1],
      style: input.style || 'low-poly voxel diorama',
      qualityTarget: 'semantic editable customParts first; layered detail; no broad one-block substitute; no detached decoration',
      imageInstruction: input.imageDataUrl ? 'Use the attached image as visual reference for the stamp.' : 'Use selectedObject/sourceParts as reference.',
    });
    const content = [
      { type: 'input_text', text: `${schemaInstruction}\n\nINPUT:\n${userText}` },
    ];
    if (input.imageDataUrl) content.push({ type: 'input_image', image_url: input.imageDataUrl, detail: 'high' });
    const requestPayload = {
      model,
      input: [{ role: 'user', content }],
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: reasoningEffort },
      text: {
        verbosity: textVerbosity,
        format: {
          type: 'json_schema',
          name: 'voxel_stamp_parts',
          strict: true,
          schema: voxelPartsSchema(allowedMaterials),
        },
      },
    };
    if (reasoningSummary !== 'off') requestPayload.reasoning.summary = reasoningSummary;
    appendAiLog({
      id: logId,
      kind: 'reinterpret-stamp',
      phase: 'request',
      model,
      input,
      requestPayload,
    });
    const response = await openaiRequest(requestPayload);
    const rawText = extractJsonText(response);
    const parsed = parseModelJson(rawText);
    appendAiLog({
      id: logId,
      kind: 'reinterpret-stamp',
      phase: 'response',
      model,
      rawText,
      parsed,
      outputSummary: {
        customParts: Array.isArray(parsed.customParts) ? parsed.customParts.length : 0,
        notes: parsed.notes || '',
      },
    });
    send(res, 200, JSON.stringify({
      ok: true,
      logId,
      model,
      reasoningEffort,
      reasoningSummary,
      textVerbosity,
      maxOutputTokens,
      imageUsed: Boolean(input.imageDataUrl),
      rawText,
      ...parsed,
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  } catch (err) {
    appendAiLog({
      id: logId,
      kind: 'reinterpret-stamp',
      phase: 'error',
      error: err.message || String(err),
    });
    send(res, 500, JSON.stringify({ ok: false, error: err.message || String(err) }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }
}

function voxelBuildSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'voxels'],
    properties: {
      name: { type: 'string' },
      voxels: {
        type: 'array',
        minItems: 80,
        maxItems: 1800,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'z', 'color'],
          properties: {
            x: { type: 'integer' },
            y: { type: 'integer' },
            z: { type: 'integer' },
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
          },
        },
      },
    },
  };
}

async function handleEnhanceVoxelBuild(req, res) {
  const logId = createLogId('enhance-build');
  try {
    const input = await readJsonBody(req);
    const model = String(input.model || 'gpt-5.5').trim();
    const stamp = input.stamp || {};
    const instruction = String(input.instruction || stamp.instruction || 'Enhance this selected object as a richer voxel build.');
    const schema = voxelBuildSchema();
    const requestPayload = {
      model,
      input: [{
        role: 'user',
        content: [{
          type: 'input_text',
          text: [
            'You enhance selected voxel stamps for Tiny World Builder.',
            'Return JSON only. Preserve the selected object category, footprint, scale, and readable chunky voxel look.',
            'Follow selectedKind, sourceCell, style, and requirements in the payload over generic style assumptions.',
            'The source voxels are already upscaled onto a high-resolution coordinate grid. Keep that resolution.',
            'Every returned voxel must stay inside allowedBounds when allowedBounds is present.',
            'Do not create floating orbit rings, detached columns, detached symbols, or unsupported chunks. Decorative voxels must touch or visually attach to the source object/base.',
            'The renderer will place this stamp inside one selected tile by default, so keep the object compact and centered.',
            'Do not collapse the object into large rectangular blocks. Do not fill the whole bounding box solid.',
            'Add higher-resolution voxel detail appropriate to selectedKind. Rocks stay geological, trees stay organic, buildings stay architectural.',
            'Do not introduce Japanese garden, shrine, temple, pagoda, torii, sakura, roof, window, door, or lantern details unless the selected object or user instruction explicitly asks for them.',
            'For buildings, keep roof, walls, windows, door, base, trim, and details readable without changing the building into a different object type.',
            'Use many small voxels and visible silhouette breaks. Target at least the requested targetVoxelCount where possible.',
            'Do not return prose or markdown.',
            '',
            'Selected object payload:',
            JSON.stringify({
              instruction,
              name: stamp.name || 'selected object',
              selectedKind: stamp.selectedKind || 'voxel-build',
              selectedLabel: stamp.selectedLabel || stamp.name || 'selected object',
              seedId: stamp.seedId || null,
              style: stamp.style || 'Tiny World low-poly voxel diorama, readable chunky blocks',
              sourceCell: stamp.sourceCell || null,
              sourceCoord: stamp.sourceCoord || null,
              desiredScale: stamp.desiredScale || 1,
              sourceVoxelCount: stamp.sourceVoxelCount || (Array.isArray(stamp.voxels) ? stamp.voxels.length : 0),
              targetVoxelCount: stamp.targetVoxelCount || 240,
              requirements: stamp.requirements || [],
              voxels: Array.isArray(stamp.voxels) ? stamp.voxels : [],
            }),
          ].join('\n'),
        }],
      }],
      max_output_tokens: 12000,
      reasoning: { effort: 'low' },
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'voxel_build',
          strict: true,
          schema,
        },
      },
    };
    appendAiLog({
      id: logId,
      kind: 'enhance-voxel-build',
      phase: 'request',
      model,
      input,
      requestPayload,
      before: input.before || input.stamp?.sourceCell || null,
      inputSummary: {
        selectedKind: stamp.selectedKind || 'voxel-build',
        selectedLabel: stamp.selectedLabel || stamp.name || 'selected object',
        seedId: stamp.seedId || null,
        sourceVoxelCount: Array.isArray(stamp.voxels) ? stamp.voxels.length : 0,
        sourceBounds: stamp.sourceBounds || null,
        allowedBounds: stamp.allowedBounds || null,
        renderFootprint: stamp.renderFootprint || null,
      },
    });
    const response = await openaiRequest(requestPayload);
    const rawText = extractJsonText(response);
    const parsed = parseModelJson(rawText);
    appendAiLog({
      id: logId,
      kind: 'enhance-voxel-build',
      phase: 'response',
      model,
      rawText,
      parsed,
      outputSummary: {
        name: parsed.name,
        voxels: Array.isArray(parsed.voxels) ? parsed.voxels.length : 0,
      },
    });
    send(res, 200, JSON.stringify({
      ok: true,
      logId,
      model,
      rawText,
      name: parsed.name,
      voxels: parsed.voxels,
    }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  } catch (err) {
    appendAiLog({
      id: logId,
      kind: 'enhance-voxel-build',
      phase: 'error',
      error: err.message || String(err),
    });
    send(res, 500, JSON.stringify({ ok: false, error: err.message || String(err) }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
  }
}

function routeForRequest(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  const pathname = decodeURIComponent(parsed.pathname);

  // Normal access: show the welcome menu (defaults to Farm)
  if (pathname === '/') return { redirect: '/tiny-world-builder' };
  if (pathname === '/tiny-world-builder') return { file: path.resolve(root, 'tiny-world-builder.html') };

  const resolved = path.resolve(root, '.' + pathname);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return { file: resolved };
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }
  if (parsedUrl.pathname === '/api/reinterpret-stamp') {
    if (req.method !== 'POST') {
      send(res, 405, 'Method Not Allowed', { Allow: 'POST' });
      return;
    }
    handleReinterpretStamp(req, res);
    return;
  }
  if (parsedUrl.pathname === '/api/enhance-voxel-build') {
    if (req.method !== 'POST') {
      send(res, 405, 'Method Not Allowed', { Allow: 'POST' });
      return;
    }
    handleEnhanceVoxelBuild(req, res);
    return;
  }
  if (parsedUrl.pathname === '/api/ai-debug-log') {
    if (req.method === 'GET') {
      const limit = numberInRange(parsedUrl.searchParams.get('limit'), 40, 1, 200);
      send(res, 200, JSON.stringify({ ok: true, file: path.relative(root, aiLogFile), entries: readAiLog(limit) }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
      return;
    }
    if (req.method === 'POST') {
      readJsonBody(req).then(input => {
        const logId = appendAiLog({
          id: input.id || createLogId('client-ai'),
          kind: input.kind || 'client-ai',
          phase: input.phase || 'client',
          input,
        });
        send(res, 200, JSON.stringify({ ok: true, logId }), {
          'Content-Type': 'application/json; charset=utf-8',
        });
      }).catch(err => {
        send(res, 500, JSON.stringify({ ok: false, error: err.message || String(err) }), {
          'Content-Type': 'application/json; charset=utf-8',
        });
      });
      return;
    }
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, POST' });
    return;
  }
  if (parsedUrl.pathname === '/api/mockstats') {
    handleMockStats(req, res);
    return;
  }
  if (parsedUrl.pathname === '/api/inter-round-state') {
    handleInterRoundState(req, res);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }
  const route = routeForRequest(req.url);
  if (!route) {
    send(res, 403, 'Forbidden');
    return;
  }
  if (route.redirect) {
    redirect(res, route.redirect);
    return;
  }
  const file = route.file;
  fs.stat(file, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      send(res, 404, 'Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: npm run dev -- ${port + 1}`);
  } else {
    console.error(err && err.stack ? err.stack : err);
  }
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Tiny World dev server: http://localhost:${port}/tiny-world-builder`);
  console.log(`  → Shows welcome menu (defaults to Farm preset)`);
  console.log(`  → Click "Vehicle Demo" button for cars/trucks`);
  console.log(`  Or append ?demo=vehicles to jump straight to vehicle demo`);
  console.log('Press Ctrl+C to stop.');
});
