import { BackendType, Barretenberg, GrumpkinCrs, type ProofData } from '@aztec/bb.js';
import { pino } from 'pino';
import { unpack } from 'msgpackr';
import { ungzip } from 'pako';

const logger = pino({
  name: 'browser-test-app',
});

// Create a logger wrapper for bb.js internal logging
// Note: We log to both pino (for structured logging) and console.log (for CI parsing)
// because bb.js internal logs include memory stats in the format "(mem: X.XMiB)"
// that the CI benchmark script needs to parse from plain-text console output
const bbLogger = (msg: string) => {
  logger.debug({ source: 'bb.js' }, msg);
  console.log(msg);
};

function installUltraHonkGlobals() {
  async function prove(
    bytecode: string,
    witness: Uint8Array,
    threads?: number,
  ): Promise<{ proofData: ProofData; verificationKey: Uint8Array }> {
    const { UltraHonkBackend } = await import('@aztec/bb.js');

    logger.debug('starting test...');
    const bb = await Barretenberg.new({ threads, logger: bbLogger });
    const backend = new UltraHonkBackend(bytecode, bb);
    const proofData = await backend.generateProof(witness);

    logger.debug(`getting the verification key...`);
    const verificationKey = await backend.getVerificationKey();
    logger.debug(`destroying the backend...`);
    await bb.destroy();
    return { proofData, verificationKey };
  }

  async function verify(proofData: ProofData, verificationKey: Uint8Array) {
    const { UltraHonkVerifierBackend } = await import('@aztec/bb.js');

    logger.debug(`verifying...`);
    const bb = await Barretenberg.new({ threads: 1, logger: bbLogger });
    const backend = new UltraHonkVerifierBackend(bb);
    const verified = await backend.verifyProof({
      ...proofData,
      verificationKey,
    });
    logger.debug(`verified: ${verified}`);

    await bb.destroy();

    logger.debug('test complete.');
    return verified;
  }

  (window as any).prove = prove;
  (window as any).verify = verify;
}
installUltraHonkGlobals();

function installChonkGlobal() {
  interface PrivateExecutionStepRaw {
    functionName: string;
    bytecode: Uint8Array;
    witness: Uint8Array;
    vk: Uint8Array;
  }

  async function processChonkInputs(
    ivcInputsBuf: Uint8Array,
  ): Promise<[Uint8Array[], Uint8Array[], Uint8Array[], string[]]> {
    const acirBufs: Uint8Array[] = [];
    const vkBufs: Uint8Array[] = [];
    const witnessBufs: Uint8Array[] = [];
    const names: string[] = [];
    // Unpack the msgpack data into the format AztecClientBackend expects
    const steps: PrivateExecutionStepRaw[] = unpack(ivcInputsBuf);
    for (const step of steps) {
      acirBufs.push(ungzip(step.bytecode));
      vkBufs.push(step.vk);
      witnessBufs.push(ungzip(step.witness));
      names.push(step.functionName);
    }
    return [acirBufs, witnessBufs, vkBufs, names];
  }

  async function proveChonk(
    ivcInputsBuf: Uint8Array,
    threads?: number,
  ): Promise<{ proof: Uint8Array; verificationKey: Uint8Array }> {
    const { AztecClientBackend } = await import('@aztec/bb.js');

    const [acirBufs, witnessBufs, vkBufs, circuitNames] = await processChonkInputs(ivcInputsBuf);
    logger.debug('starting test...');
    const bb = await Barretenberg.new({ threads, logger: bbLogger });
    const backend = new AztecClientBackend(acirBufs, bb, circuitNames);
    const { proof, vk: verificationKey } = await backend.prove(witnessBufs, vkBufs);
    await bb.destroy();
    return { proof, verificationKey };
  }

  (window as any).proveChonk = proveChonk;
}

installChonkGlobal();

type EccvmBenchOptions = {
  kind?: string;
  logSizes?: number[];
  runs?: number;
  threads?: number;
  includeProve?: boolean;
  includeSumcheck?: boolean;
  memMaxPages?: number;
};

function decodeBenchOptions(): EccvmBenchOptions | undefined {
  const encoded = new URLSearchParams(window.location.search).get('bench');
  if (!encoded) {
    return undefined;
  }
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function postJson(path: string, payload: unknown) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn(`failed to POST ${path}`, err);
  }
}

function browserFeatures() {
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
}

async function runEccvmBenchFromQuery() {
  const options = decodeBenchOptions();
  if (!options || options.kind !== 'eccvm') {
    return;
  }

  const logSizes = options.logSizes ?? [12, 13, 14, 15];
  const runs = options.runs ?? 1;
  const includeProve = options.includeProve ?? true;
  const includeSumcheck = options.includeSumcheck ?? true;
  const threads = options.threads;
  const memory = options.memMaxPages ? { maximum: options.memMaxPages } : undefined;
  const startedAt = performance.now();

  await postJson('/progress', { phase: 'start', options, features: browserFeatures(), elapsedMs: 0 });

  let bb: Barretenberg | undefined;

  try {
    bb = await Barretenberg.new({
      backend: BackendType.WasmWorker,
      threads,
      skipSrsInit: true,
      memory,
      logger: bbLogger,
    });

    await postJson('/progress', {
      phase: 'wasm_ready',
      options,
      features: browserFeatures(),
      elapsedMs: performance.now() - startedAt,
    });

    const grumpkinCrsStart = performance.now();
    const grumpkinCrs = await GrumpkinCrs.new(2 ** 16, undefined, bbLogger);
    await bb.srsInitGrumpkinSrs({ pointsBuf: grumpkinCrs.getG1Data(), numPoints: grumpkinCrs.numPoints });
    await postJson('/progress', {
      phase: 'grumpkin_srs_ready',
      grumpkinSrsMs: performance.now() - grumpkinCrsStart,
      elapsedMs: performance.now() - startedAt,
    });

    const benchStart = performance.now();
    const response = await (bb as any).eccvmBench({ logSizes, runs, includeProve, includeSumcheck });
    const payload = {
      ok: true,
      kind: 'eccvm',
      options: { logSizes, runs, threads, includeProve, includeSumcheck, memMaxPages: options.memMaxPages },
      features: browserFeatures(),
      timings: {
        totalMs: performance.now() - startedAt,
        benchMs: performance.now() - benchStart,
      },
      measurements: response.measurements,
    };
    document.body.textContent = JSON.stringify(payload, null, 2);
    await postJson('/results', payload);
  } catch (err: any) {
    const payload = {
      ok: false,
      kind: 'eccvm',
      options,
      features: browserFeatures(),
      error: err?.stack || err?.message || String(err),
      elapsedMs: performance.now() - startedAt,
    };
    document.body.textContent = JSON.stringify(payload, null, 2);
    await postJson('/results', payload);
  } finally {
    await bb?.destroy();
  }
}

// Add test function to verify bbLogger works
(window as any).testBbLogger = async function () {
  const bb = await Barretenberg.new({ threads: 1, logger: bbLogger });
  await bb.destroy();
  return true;
};

document.addEventListener('DOMContentLoaded', function () {
  const ultraHonkButton = document.createElement('button');
  ultraHonkButton.innerText = 'Run UltraHonk Proving';
  ultraHonkButton.addEventListener('click', async () => {
    alert('Please select an ACIR bytecode file in the next dialog.');
    const acirFile = await new Promise<File>(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.acir';
      input.onchange = e => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    alert('Please select an ACIR witness file in the next dialog.');
    const witnessFile = await new Promise<File>(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.witness';
      input.onchange = e => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const acir = await acirFile.text();
    const witness = new Uint8Array(await witnessFile.arrayBuffer());

    const { proofData, verificationKey } = await (window as any).prove(acir, witness);
    await (window as any).verify(proofData, verificationKey);
  });
  document.body.appendChild(ultraHonkButton);

  const chonkButton = document.createElement('button');
  chonkButton.innerText = 'Run Chonk Proving';
  chonkButton.addEventListener('click', async () => {
    const ivcInputsFile = await new Promise<File>(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.msgpack';
      input.onchange = e => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const ivcInputsBuf = new Uint8Array(await ivcInputsFile.arrayBuffer());
    try {
      await (window as any).proveChonk(ivcInputsBuf);
    } catch (error) {
      logger.error('Error during Chonk proving:', error);
      return false;
    }
    return true;
  });
  document.body.appendChild(chonkButton);
});

void runEccvmBenchFromQuery();
