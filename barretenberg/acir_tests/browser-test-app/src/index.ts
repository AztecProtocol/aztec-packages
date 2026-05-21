import { Barretenberg, type ProofData } from "@aztec/bb.js";
import { pino } from "pino";
import { unpack } from "msgpackr";
import { ungzip } from "pako";

const logger = pino({
  name: "browser-test-app",
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
    threads?: number
  ): Promise<{ proofData: ProofData; verificationKey: Uint8Array }> {
    const { UltraHonkBackend } = await import("@aztec/bb.js");

    logger.debug("starting test...");
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
    const { UltraHonkVerifierBackend } = await import("@aztec/bb.js");

    logger.debug(`verifying...`);
    const bb = await Barretenberg.new({ threads: 1, logger: bbLogger });
    const backend = new UltraHonkVerifierBackend(bb);
    const verified = await backend.verifyProof({
      ...proofData,
      verificationKey,
    });
    logger.debug(`verified: ${verified}`);

    await bb.destroy();

    logger.debug("test complete.");
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
    ivcInputsBuf: Uint8Array
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
    backendOptions?: { wasmPath?: string; memory?: { maximum?: number } }
  ): Promise<{ proof: Uint8Array; verificationKey: Uint8Array }> {
    const { AztecClientBackend } = await import("@aztec/bb.js");

    const [acirBufs, witnessBufs, vkBufs, circuitNames] = await processChonkInputs(
      ivcInputsBuf
    );
    logger.debug("starting test...");
    const bb = await Barretenberg.new({ threads, logger: bbLogger, ...backendOptions });
    const backend = new AztecClientBackend(acirBufs, bb, circuitNames);
    const { proof, vk: verificationKey } = await backend.prove(
      witnessBufs,
      vkBufs
    );
    await bb.destroy();
    return { proof, verificationKey };
  }

  (window as any).proveChonk = proveChonk;
}

installChonkGlobal();

interface AbBenchOptions {
  flow: string;
  threads?: number;
  pairs: number;
  warmupRuns: number;
  variants: string[];
  memMaxPages?: number;
}

function installChonkAbGlobal() {
  function median(values: number[]): number | null {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function mean(values: number[]): number | null {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  function stddev(values: number[]): number | null {
    if (values.length < 2) return null;
    const m = mean(values)!;
    return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
  }
  // Bootstrap CI on the median so a comparison is never reported without an error bar.
  function bootstrapMedianCI(values: number[], iterations = 2000, alpha = 0.05) {
    if (values.length < 2) return { lo: null, hi: null };
    const draws: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const sample: number[] = [];
      for (let j = 0; j < values.length; j++) {
        sample.push(values[Math.floor(Math.random() * values.length)]);
      }
      draws.push(median(sample)!);
    }
    draws.sort((a, b) => a - b);
    return { lo: draws[Math.floor(iterations * (alpha / 2))], hi: draws[Math.floor(iterations * (1 - alpha / 2))] };
  }
  function summarize(values: number[]) {
    return {
      n: values.length,
      median: median(values),
      mean: mean(values),
      stddev: stddev(values),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  }

  async function postJson(path: string, body: unknown) {
    try {
      await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      // Posting back to the local harness is best effort.
    }
  }

  // Interleaves two bb.wasm variants on the SAME device within one session and reports the
  // paired median delta with a bootstrap CI. Each variant is selected at runtime via bb.js's
  // wasmPath option, so a single build hosts both /wasm/<variant>/ binaries.
  async function runChonkAb(options: AbBenchOptions) {
    const variants = options.variants ?? ["pr", "base"];
    const pairs = Math.max(1, options.pairs || 1);
    const warmup = Math.max(0, options.warmupRuns || 0);
    const memory = options.memMaxPages ? { maximum: options.memMaxPages } : undefined;

    const inputUrl = `/inputs/${encodeURIComponent(options.flow)}/ivc-inputs.msgpack`;
    const ivcInputsBuf = new Uint8Array(await (await fetch(inputUrl)).arrayBuffer());

    const runs: Array<{ pair: number; variant: string; proveTotalMs: number }> = [];
    (window as any).__benchStatus = { state: "running", options };

    for (let p = 0; p < pairs; p++) {
      // Alternate order each pair to remove first-mover bias.
      const order = p % 2 === 0 ? variants : [...variants].reverse();
      for (const variant of order) {
        const started = performance.now();
        await (window as any).proveChonk(ivcInputsBuf, options.threads, {
          wasmPath: `/wasm/${variant}/barretenberg.wasm.gz`,
          memory,
        });
        const proveTotalMs = performance.now() - started;
        const row = { pair: p + 1, variant, proveTotalMs };
        runs.push(row);
        (window as any).__benchStatus = { state: "pair_done", ...row };
        await postJson("/progress", { type: "pair_run", ...row });
      }
    }

    const byVariant: Record<string, ReturnType<typeof summarize>> = {};
    for (const v of variants) {
      byVariant[v] = summarize(runs.filter((r) => r.variant === v).slice(warmup).map((r) => r.proveTotalMs));
    }
    const pairedDeltas: number[] = [];
    const pctDeltas: number[] = [];
    for (let p = warmup; p < pairs; p++) {
      const a = runs.find((r) => r.pair === p + 1 && r.variant === variants[0]);
      const b = runs.find((r) => r.pair === p + 1 && r.variant === variants[1]);
      if (a && b) {
        pairedDeltas.push(a.proveTotalMs - b.proveTotalMs);
        pctDeltas.push(((a.proveTotalMs - b.proveTotalMs) / b.proveTotalMs) * 100);
      }
    }

    const result = {
      mode: "ab",
      flow: options.flow,
      variants,
      pairs,
      warmup,
      runs,
      byVariant,
      paired: {
        deltaMs: summarize(pairedDeltas),
        deltaMsCI95: bootstrapMedianCI(pairedDeltas),
        deltaPct: summarize(pctDeltas),
        deltaPctCI95: bootstrapMedianCI(pctDeltas),
      },
    };
    (window as any).__benchStatus = { state: "complete" };
    (window as any).__benchResult = result;
    await postJson("/result", result);
    return result;
  }

  (window as any).runChonkAb = runChonkAb;

  function decodeBenchParam(raw: string): AbBenchOptions {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
  }

  const benchParam = new URLSearchParams(location.search).get("bench");
  if (benchParam) {
    runChonkAb(decodeBenchParam(benchParam)).catch(async (error) => {
      const err = { message: error?.message ?? String(error), stack: error?.stack ?? "" };
      (window as any).__benchStatus = { state: "error", error: err };
      (window as any).__benchError = err;
      await postJson("/result", { ok: false, error: err });
    });
  }
}

installChonkAbGlobal();

// Add test function to verify bbLogger works
(window as any).testBbLogger = async function() {
  const bb = await Barretenberg.new({ threads: 1, logger: bbLogger });
  await bb.destroy();
  return true;
};

document.addEventListener("DOMContentLoaded", function () {
  const ultraHonkButton = document.createElement("button");
  ultraHonkButton.innerText = "Run UltraHonk Proving";
  ultraHonkButton.addEventListener("click", async () => {
    alert("Please select an ACIR bytecode file in the next dialog.");
    const acirFile = await new Promise<File>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.acir";
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    alert("Please select an ACIR witness file in the next dialog.");
    const witnessFile = await new Promise<File>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,.witness";
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const acir = await acirFile.text();
    const witness = new Uint8Array(await witnessFile.arrayBuffer());

    const { proofData, verificationKey } = await (window as any).prove(
      acir,
      witness
    );
    await (window as any).verify(proofData, verificationKey);
  });
  document.body.appendChild(ultraHonkButton);

  const chonkButton = document.createElement("button");
  chonkButton.innerText = "Run Chonk Proving";
  chonkButton.addEventListener("click", async () => {
    const ivcInputsFile = await new Promise<File>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".msgpack";
      input.onchange = (e) => resolve((e.target as HTMLInputElement).files![0]);
      input.click();
    });

    const ivcInputsBuf = new Uint8Array(await ivcInputsFile.arrayBuffer());
    try {
      await (window as any).proveChonk(ivcInputsBuf);
    } catch (error) {
      logger.error("Error during Chonk proving:", error);
      return false;
    }
    return true;
  });
  document.body.appendChild(chonkButton);
});
