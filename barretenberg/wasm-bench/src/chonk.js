import pako from 'pako';
import { Decoder } from 'msgpackr';

import { bbapiCall, proofFieldCount } from './bbapi.js';
import { fetchCrs } from './crs.js';

const decoder = new Decoder({ useRecords: false });

function ungzipMaybe(bytes) {
  if (bytes?.[0] === 0x1f && bytes?.[1] === 0x8b && bytes?.[2] === 0x08) {
    return pako.ungzip(bytes);
  }
  return bytes;
}

export async function fetchAndProcessInputs(inputUrl) {
  const response = await fetch(inputUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${inputUrl}: HTTP ${response.status}`);
  }
  const inputBytes = new Uint8Array(await response.arrayBuffer());
  const rawSteps = decoder.unpack(inputBytes);
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error(`Expected non-empty Chonk input step array from ${inputUrl}`);
  }

  const steps = rawSteps.map((step, index) => ({
    functionName: step.functionName || step.function_name || `circuit_${index}`,
    bytecode: ungzipMaybe(step.bytecode),
    witness: ungzipMaybe(step.witness),
    vk: step.vk ?? new Uint8Array(),
  }));

  return { inputBytes, steps };
}

export async function initSrs(wasm, options) {
  const progress = options.progress;
  const crs = await fetchCrs(options);
  progress?.('srs_init_g1_start', { num_points: crs.srsSize, g1Bytes: crs.g1.byteLength, g2Bytes: crs.g2.byteLength });
  const srsResponse = bbapiCall(
    wasm,
    'SrsInitSrs',
    { points_buf: crs.g1, num_points: crs.srsSize, g2_point: crs.g2 },
    'SrsInitSrsResponse',
  );
  progress?.('srs_init_grumpkin_start', { num_points: crs.grumpkinSrsSize, grumpkinBytes: crs.grumpkin.byteLength });
  bbapiCall(
    wasm,
    'SrsInitGrumpkinSrs',
    { points_buf: crs.grumpkin, num_points: crs.grumpkinSrsSize },
    'SrsInitGrumpkinSrsResponse',
  );
  return {
    srsSize: crs.srsSize,
    grumpkinSrsSize: crs.grumpkinSrsSize,
    g1Bytes: crs.g1.byteLength,
    g2Bytes: crs.g2.byteLength,
    grumpkinBytes: crs.grumpkin.byteLength,
    uncompressedG1Bytes: srsResponse.points_buf?.byteLength ?? 0,
  };
}

export function runChonkSetup(wasm, steps) {
  bbapiCall(wasm, 'ChonkStart', { num_circuits: steps.length }, 'ChonkStartResponse');
  for (const step of steps) {
    bbapiCall(
      wasm,
      'ChonkLoad',
      {
        circuit: {
          name: step.functionName,
          bytecode: step.bytecode,
          verification_key: step.vk,
        },
      },
      'ChonkLoadResponse',
    );
    bbapiCall(wasm, 'ChonkAccumulate', { witness: step.witness }, 'ChonkAccumulateResponse');
  }
}

export function proveChonk(wasm) {
  return bbapiCall(wasm, 'ChonkProve', {}, 'ChonkProveResponse').proof;
}

export function computeHidingKernelVk(wasm, steps) {
  const lastStep = steps[steps.length - 1];
  return bbapiCall(
    wasm,
    'ChonkComputeVk',
    {
      circuit: {
        name: lastStep.functionName,
        bytecode: lastStep.bytecode,
      },
      use_zk_flavor: true,
    },
    'ChonkComputeVkResponse',
  ).bytes;
}

export function verifyChonk(wasm, proof, vk) {
  return bbapiCall(wasm, 'ChonkVerify', { proof, vk }, 'ChonkVerifyResponse').valid;
}

export function summarizeProof(proof, vk) {
  return {
    proofFieldCount: proofFieldCount(proof),
    verificationKeyBytes: vk.byteLength ?? vk.length ?? 0,
  };
}
