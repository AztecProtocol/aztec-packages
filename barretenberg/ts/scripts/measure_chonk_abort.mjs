// Measures aborting a Chonk proof through bb.js on two pinned flows: abort-to-settle latency at random offsets into
// the proving pipeline, the prover's RSS over abort-then-prove cycles, and its CPU at rest after an abort. Prints one
// JSON line per sample. WasmWorker's process RSS rises over its first proofs whether or not they are aborted, so read
// its RSS against plain proofs rather than against a threshold.
//
// Usage: node scripts/measure_chonk_abort.mjs <NativeUnixSocket|WasmWorker> [threads=16] [samples=20]
//   Run from barretenberg/ts once bb.js is built (and bb, for NativeUnixSocket) and the pinned flows are downloaded
//   (barretenberg/cpp/scripts/chonk_inputs.sh download). Linux only: it reads /proc.
import { Decoder } from 'msgpackr';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ensurePinnedInputsRoot,
  loadPinnedFlow,
  localBbPath,
} from '../bb.js/dest/node/barretenberg/testing/pinned_flows.js';
import { AztecClientBackend, BackendType, Barretenberg } from '../bb.js/dest/node/index.js';

/** Ten circuits covering every kernel kind, and a shape with recursive app circuits instead of a token transfer. */
const FLOWS = ['ecdsar1+transfer_0_recursions+private_fpc', 'ecdsar1+storage_proof_7_layers+sponsored_fpc'];
/** The first cycle pays one-time allocations; two more show whether RSS keeps growing. */
const MEMORY_CYCLES = 3;
/** Long enough for /proc's 10 ms CPU ticks to resolve a busy core from an idle one. */
const CPU_WINDOW_MS = 500;

const [label, threadsArg = '16', samplesArg = '20'] = process.argv.slice(2);
const backend = BackendType[label];
const threads = Number(threadsArg);
const samples = Number(samplesArg);
if (
  (backend !== BackendType.NativeUnixSocket && backend !== BackendType.WasmWorker) ||
  !Number.isInteger(threads) ||
  !Number.isInteger(samples)
) {
  console.error('usage: node scripts/measure_chonk_abort.mjs <NativeUnixSocket|WasmWorker> [threads] [samples]');
  process.exit(2);
}

const print = sample => process.stdout.write(`${JSON.stringify(sample)}\n`);
const decoder = new Decoder({ useRecords: false });

const api = await Barretenberg.new({ backend, threads, bbPath: localBbPath() });
// The transport is private to Barretenberg; wrapping it times every command and counts interrupts.
const transport = api.backend;
let exchanges = [];
let interrupts = 0;
const call = transport.call.bind(transport);
transport.call = async input => {
  const [[command]] = decoder.unpack(input);
  const exchange = { command, issuedAt: performance.now() };
  exchanges.push(exchange);
  const output = await call(input);
  exchange.answeredAt = performance.now();
  return output;
};
const interrupt = transport.interrupt.bind(transport);
transport.interrupt = () => {
  interrupts++;
  return interrupt();
};
const reset = () => {
  exchanges = [];
  interrupts = 0;
};
const named = command => exchanges.filter(exchange => exchange.command === command);

/** The spawned bb's pid, found by the socket path on its command line (the backend keeps the child private). */
const pid =
  backend === BackendType.NativeUnixSocket
    ? Number(execFileSync('pgrep', ['-f', transport.getIpcPath()]).toString().trim())
    : undefined;

/** Resident set of the process doing the proving: the bb child, or this process, which hosts the wasm workers. */
function provingRss() {
  if (pid === undefined) {
    return process.memoryUsage().rss;
  }
  return Number(/VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))[1]) * 1024;
}

/** CPU seconds used so far by the bb child (utime + stime, in 100 Hz ticks), or by this process. */
function provingCpuSeconds() {
  if (pid === undefined) {
    const { user, system } = process.cpuUsage();
    return (user + system) / 1e6;
  }
  const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return (Number(fields[11]) + Number(fields[12])) / 100;
}

/** Proves `flow` once, uncancelled, and returns how long its pipeline took, from chonkStart to chonkProve's answer. */
async function pipelineMs(prover, flow) {
  reset();
  await prover.prove(flow.witnesses, flow.vks);
  return named('BbChonkProve')[0].answeredAt - named('BbChonkStart')[0].issuedAt;
}

/** Aborts a prove `offsetMs` after it starts; returns the command in flight at the abort and the time to settle. */
async function abortAfter(prover, flow, offsetMs) {
  reset();
  const controller = new AbortController();
  let settledAt;
  const proving = prover
    .prove(flow.witnesses, flow.vks, { signal: controller.signal })
    .then(
      () => 'proved',
      error => (error === controller.signal.reason ? 'reason' : String(error)),
    )
    .finally(() => (settledAt = performance.now()));
  await new Promise(resolve => setTimeout(resolve, offsetMs));
  const settledBeforeAbort = settledAt !== undefined;
  const inFlight = exchanges.find(exchange => exchange.answeredAt === undefined)?.command;
  const abortedAt = performance.now();
  controller.abort();
  const outcome = await proving;
  return {
    inFlight,
    outcome,
    settledBeforeAbort,
    latencyMs: settledBeforeAbort ? undefined : settledAt - abortedAt,
    interrupts,
    fenceReads: named('BbChonkStop').length,
  };
}

const loadFlow = name => loadPinnedFlow(join(ensurePinnedInputsRoot(), name));
const proverFor = flow => new AztecClientBackend(flow.bytecodes, api, flow.names, flow.kinds);

try {
  for (const flowName of FLOWS) {
    const flow = loadFlow(flowName);
    const prover = proverFor(flow);
    const pipeline = await pipelineMs(prover, flow);
    print({ kind: 'pipeline', backend: label, flow: flowName, pipelineMs: pipeline });
    for (let sample = 0; sample < samples; sample++) {
      const offsetMs = Math.random() * pipeline;
      print({
        kind: 'latency',
        backend: label,
        flow: flowName,
        sample,
        offsetMs,
        ...(await abortAfter(prover, flow, offsetMs)),
      });
    }
  }

  const flow = loadFlow(FLOWS[0]);
  const prover = proverFor(flow);
  const pipeline = await pipelineMs(prover, flow);
  for (let cycle = 0; cycle < MEMORY_CYCLES; cycle++) {
    await abortAfter(prover, flow, pipeline / 2);
    await prover.prove(flow.witnesses, flow.vks);
    print({ kind: 'rss', backend: label, cycle, rssBytes: provingRss() });
  }

  await abortAfter(prover, flow, pipeline / 2);
  const cpuBefore = provingCpuSeconds();
  await new Promise(resolve => setTimeout(resolve, CPU_WINDOW_MS));
  const cpuShare = (provingCpuSeconds() - cpuBefore) / (CPU_WINDOW_MS / 1000);
  const probeStart = performance.now();
  await api.blake2s({ data: new Uint8Array(32) });
  print({ kind: 'rest', backend: label, cpuShare, probeMs: performance.now() - probeStart });
} finally {
  await api.destroy();
}
