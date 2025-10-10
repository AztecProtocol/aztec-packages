import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Load and parse the trusted setup file for KZG operations.
 * The file format is:
 * - Line 1: num_g1 points (4096)
 * - Line 2: num_g2 points (65)
 * - Lines 3 to 3+num_g1: G1 Lagrange points as hex strings (48 bytes each = 96 hex chars)
 * - Lines 3+num_g1 to 3+num_g1+num_g2: G2 Monomial points as hex strings (96 bytes each = 192 hex chars)
 * - Lines 3+num_g1+num_g2 to 3+num_g1+num_g2+num_g1: G1 Monomial points as hex strings (48 bytes each = 96 hex chars)
 *
 * Returns raw byte arrays (bb.js will add length prefix via serializeBufferable).
 */
export function loadTrustedSetup(): {
  g1Lagrange: Uint8Array;
  g1Monomial: Uint8Array;
  g2Monomial: Uint8Array;
} {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const trustedSetupPath = join(__dirname, 'trusted_setup.txt');

  const content = readFileSync(trustedSetupPath, 'utf-8');
  const lines = content.trim().split('\n');

  const numG1 = parseInt(lines[0], 10);
  const numG2 = parseInt(lines[1], 10);

  // Parse G1 Lagrange (lines 2 to 2+numG1)
  const g1LagrangeHex = lines.slice(2, 2 + numG1);
  const g1LagrangeData = hexArrayToBytes(g1LagrangeHex);

  // Parse G2 Monomial (lines 2+numG1 to 2+numG1+numG2)
  const g2MonomialHex = lines.slice(2 + numG1, 2 + numG1 + numG2);
  const g2MonomialData = hexArrayToBytes(g2MonomialHex);

  // Parse G1 Monomial (lines 2+numG1+numG2 to 2+numG1+numG2+numG1)
  const g1MonomialHex = lines.slice(2 + numG1 + numG2, 2 + numG1 + numG2 + numG1);
  const g1MonomialData = hexArrayToBytes(g1MonomialHex);

  return {
    g1Lagrange: g1LagrangeData,
    g1Monomial: g1MonomialData,
    g2Monomial: g2MonomialData,
  };
}

/**
 * Convert an array of hex strings to a single Uint8Array
 */
function hexArrayToBytes(hexStrings: string[]): Uint8Array {
  return Buffer.concat(hexStrings.map(hex => Buffer.from(hex, 'hex')));
}
