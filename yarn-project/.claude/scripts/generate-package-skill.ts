#!/usr/bin/env -S node --experimental-strip-types

// Common generator for per-package skills.
// Usage: generate-package-skill.ts <package-dir-name>
// Outputs complete SKILL.md content for the given yarn-project package.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const yarnProjectRoot = resolve(scriptDir, '../..');

const pkgDir = process.argv[2];
if (!pkgDir) {
  process.stderr.write('Usage: generate-package-skill.ts <package-dir-name>\n');
  process.exit(1);
}

const pkgPath = join(yarnProjectRoot, pkgDir);
const pkgJsonPath = join(pkgPath, 'package.json');

if (!existsSync(pkgJsonPath)) {
  process.stderr.write(`No package.json found at ${pkgJsonPath}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
const pkgName: string = pkg.name ?? `@aztec/${pkgDir}`;

// Strip markdown formatting.
function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
}

// Read description from README.md.
function readDescription(): string {
  const readme = join(pkgPath, 'README.md');
  if (!existsSync(readme)) return '';
  try {
    const content = readFileSync(readme, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!') || trimmed.startsWith('```')) continue;
      if (!/^[A-Z]/.test(trimmed)) continue;
      if (trimmed.length < 20) continue;
      if (/^[A-Z_]+=/.test(trimmed)) continue;
      if (/^(To|This (guide|will))\s/.test(trimmed)) continue;
      const cleaned = stripMarkdown(trimmed);
      const sentence = cleaned.split(/\.(?:\s|$)/)[0];
      const desc = sentence.length < cleaned.length ? sentence + '.' : cleaned;
      return desc.length > 120 ? desc.slice(0, 117) + '...' : desc;
    }
  } catch { /* skip */ }
  return '';
}

// Fallback descriptions for packages without good READMEs (sourced from CLAUDE.md).
const fallbackDescriptions: Record<string, string> = {
  'aztec-node': 'Main entrypoint for running an Aztec node, integrates all server components.',
  'sequencer-client': 'Builds blocks from pending transactions and coordinates with validators.',
  'validator-client': 'Handles block validation and attestation signing for consensus.',
  'prover-node': 'Standalone prover node that generates proofs for epoch proving.',
  'prover-client': 'Orchestrates proof generation, manages proving broker and queues.',
  'archiver': 'Indexes and stores L2 block data fetched from L1 for historical queries.',
  'world-state': 'Maintains the global Merkle tree state (note hashes, nullifiers, public data).',
  'p2p': 'Peer-to-peer networking layer using libp2p for transaction and block propagation.',
  'slasher': 'Detects and collects slashable offenses.',
  'pxe': 'Main client-side library for orchestrating private tx execution and proving.',
  'aztec.js': 'JavaScript SDK for building dApps, interacting with contracts and accounts.',
  'key-store': 'Manages user private keys and key derivation for the PXE.',
  'stdlib': 'Protocol-level types (transactions, blocks, proofs) and domain interfaces.',
  'foundation': 'Low-level utilities: crypto primitives, logging, serialization, async helpers.',
  'constants': 'Protocol constants shared between TypeScript and Noir circuits.',
  'simulator': 'ACIR/AVM circuit simulation for both private and public execution.',
  'protocol-contracts': 'Canonical protocol contracts (registries, fee contracts, etc.).',
  'noir-protocol-circuits-types': 'TypeScript bindings for Noir protocol circuits.',
  'bb-prover': 'Barretenberg prover integration for generating ZK proofs.',
  'ethereum': 'L1 contract interactions, deployment, and rollup publishing.',
  'kv-store': 'Key-value storage abstraction (LMDB for server, IndexedDB for browser).',
  'end-to-end': 'End-to-end tests covering Aztec main milestones.',
  'epoch-cache': 'Caches epoch-related data from L1 for fast validator lookups.',
  'telemetry-client': 'OpenTelemetry integration for metrics and tracing.',
  'noir-contracts.js': 'TypeScript bindings for Aztec Noir contracts.',
  'noir-test-contracts.js': 'TypeScript bindings for Noir test contracts.',
  'test-wallet': 'Lightweight wallet implementation for testing.',
  'txe': 'Test execution environment for Noir contract tests.',
  'cli-wallet': 'Interactive CLI wallet for managing accounts and sending transactions.',
  'blob-lib': 'Blob encoding/decoding utilities for EIP-4844 data.',
  'node-keystore': 'Keystore management for node operator keys.',
  'docs': 'Documentation site generator.',
};

const description = (pkg.description ? stripMarkdown(pkg.description) : readDescription())
  || fallbackDescriptions[pkgDir]
  || pkgDir;

// Extract exports.
const exportsField = pkg.exports;
let exports: string[] = [];
if (exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
  exports = Object.keys(exportsField).filter((k: string) => !k.endsWith('/package.json'));
}

// Extract internal @aztec/* dependencies.
const allDeps: Record<string, string> = { ...pkg.dependencies };
const internalDeps = Object.keys(allDeps)
  .filter(d => d.startsWith('@aztec/'))
  .sort();

// Build output.
const lines: string[] = [
  '---',
  `name: ${pkgDir}`,
  `description: "${description}"`,
  '---',
  '',
  '*Auto-generated. Regenerate with `./bootstrap.sh skills`.*',
  '',
  `**Package:** \`${pkgName}\``,
  '',
];

if (exports.length > 0) {
  lines.push('### Exports');
  lines.push('');
  for (const e of exports) {
    lines.push(`- \`${e}\``);
  }
  lines.push('');
}

if (internalDeps.length > 0) {
  lines.push('### Internal Dependencies');
  lines.push('');
  lines.push(internalDeps.map(d => `\`${d}\``).join(', '));
  lines.push('');
}

console.log(lines.join('\n'));
