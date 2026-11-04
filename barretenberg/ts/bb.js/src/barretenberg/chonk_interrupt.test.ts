import type { IpcClientAsync } from '@aztec-foundation/ipc-runtime';
import { Decoder } from 'msgpackr';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AztecClientBackend, type AztecClientProveResult, INTERRUPTED_MESSAGE } from './backend.js';
import { BackendType, Barretenberg } from './index.js';
import { type PinnedFlow, ensurePinnedInputsRoot, loadPinnedFlow, localBbPath } from './testing/pinned_flows.js';

/** Ten circuits covering every kernel kind; the flow the pinned-input benchmarks use. */
const FLOW = 'ecdsar1+transfer_0_recursions+private_fpc';
/** A second shape for the measurements: recursive app circuits instead of a token transfer. */
const SECOND_MEASURED_FLOW = 'ecdsar1+storage_proof_7_layers+sponsored_fpc';

/** The thread count bb.js picks by default on a machine with 16 or more cores. */
const THREADS = 16;

/**
 * A test proves FLOW at most four times, about 10 s each at 16 threads on a developer machine; ten minutes covers a
 * loaded 8-CPU CI host by a wide margin and still ends a stuck run.
 */
const TEST_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Started at the abort: an aborted proof settles within a second or two, so this only turns a hang into a failure
 * that names it, well before the test timeout.
 */
const HANG_GUARD_MS = 30_000;

const INTERRUPTIBLE_BACKENDS = [
  { label: 'NativeUnixSocket', backend: BackendType.NativeUnixSocket },
  { label: 'WasmWorker', backend: BackendType.WasmWorker },
] as const;

/** One command as the transport saw it. */
interface Exchange {
  command: string;
  reply?: string;
  /** The text of an error reply. */
  message?: string;
  /** ClearInterrupt's answer. */
  interrupted?: boolean;
  issuedAt: number;
  answeredAt?: number;
}

const decoder = new Decoder({ useRecords: false });

/**
 * Wraps a Barretenberg's transport to record every command and reply, and to run a hook when a command is issued or
 * answered, before the client sees the answer.
 */
class TransportSpy {
  exchanges: Exchange[] = [];
  interrupts = 0;
  onIssue?: (exchange: Exchange) => void;
  onReply?: (exchange: Exchange) => void;

  constructor(readonly transport: IpcClientAsync) {
    const call = transport.call.bind(transport);
    transport.call = async (input: Uint8Array) => {
      const [[command]] = decoder.unpack(input) as [[string, unknown]];
      const exchange: Exchange = { command, issuedAt: performance.now() };
      this.exchanges.push(exchange);
      this.onIssue?.(exchange);
      const output = await call(input);
      const [reply, payload] = decoder.unpack(output) as [string, { message?: string; interrupted?: boolean }];
      Object.assign(exchange, {
        reply,
        message: payload.message,
        interrupted: payload.interrupted,
        answeredAt: performance.now(),
      });
      this.onReply?.(exchange);
      return output;
    };
    const interrupt = transport.interrupt!.bind(transport);
    transport.interrupt = () => {
      this.interrupts++;
      return interrupt();
    };
  }

  reset() {
    this.exchanges = [];
    this.interrupts = 0;
    this.onIssue = undefined;
    this.onReply = undefined;
  }

  /** The oldest command not yet answered: the one bb is running, as it answers in order. */
  inFlight(): Exchange | undefined {
    return this.exchanges.find(exchange => exchange.reply === undefined);
  }

  named(command: string): Exchange[] {
    return this.exchanges.filter(exchange => exchange.command === command);
  }
}

function transportOf(api: Barretenberg): IpcClientAsync {
  return (api as unknown as { backend: IpcClientAsync }).backend;
}

/** The spawned bb's pid, found by the socket path on its command line (the backend keeps the child private). */
function childPid(transport: IpcClientAsync): number {
  const ipcPath = (transport as unknown as { getIpcPath(): string }).getIpcPath();
  const pids = execFileSync('pgrep', ['-f', ipcPath]).toString().trim().split('\n');
  expect(pids).toHaveLength(1);
  return Number(pids[0]);
}

/** Rejects if `proving` has not settled HANG_GUARD_MS after the signal aborts. */
function guardAfterAbort<T>(signal: AbortSignal, proving: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hung = new Promise<never>((_, reject) =>
    signal.addEventListener(
      'abort',
      () =>
        (timer = setTimeout(() => reject(new Error(`no settle ${HANG_GUARD_MS} ms after the abort`)), HANG_GUARD_MS)),
      { once: true },
    ),
  );
  return Promise.race([proving, hung]).finally(() => clearTimeout(timer));
}

function loadFlow(name: string): PinnedFlow {
  return loadPinnedFlow(join(ensurePinnedInputsRoot(), name));
}

/** The circuit with the largest bytecode: its accumulation is the longest command an abort has to stop. */
function largestCircuit(flow: PinnedFlow): number {
  return flow.bytecodes.reduce(
    (largest, bytecode, i) => (bytecode.length > flow.bytecodes[largest].length ? i : largest),
    0,
  );
}

describe.each(INTERRUPTIBLE_BACKENDS)('aborting a Chonk proof on $label', ({ backend }) => {
  const logs: string[] = [];
  let api: Barretenberg;
  let spy: TransportSpy;
  let flow: PinnedFlow;
  let prover: AztecClientBackend;
  let warm: AztecClientProveResult;
  let pid: number | undefined;

  beforeAll(async () => {
    flow = loadFlow(FLOW);
    api = await Barretenberg.new({ backend, threads: THREADS, bbPath: localBbPath(), logger: line => logs.push(line) });
    spy = new TransportSpy(transportOf(api));
    prover = new AztecClientBackend(flow.bytecodes, api, flow.names, flow.kinds);
    // Uncancelled first: it loads the CRS, which no checkpoint interrupts.
    warm = await prover.prove(flow.witnesses, flow.vks);
    pid = backend === BackendType.NativeUnixSocket ? childPid(spy.transport) : undefined;
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await api?.destroy();
  });

  beforeEach(() => spy.reset());

  /** The instance proves again on the same bb: no respawn, no CRS reload. */
  async function provesAgain() {
    const next = await prover.prove(flow.witnesses, flow.vks);
    expect(await prover.verify(next.proof, next.vk)).toBe(true);
    if (pid !== undefined) {
      expect(childPid(spy.transport)).toBe(pid);
    }
    expect(spy.named('BbSrsInitSrs')).toEqual([]);
  }

  it('is interruptible', () => {
    expect(api.interruptible).toBe(true);
  });

  it.each([
    {
      when: 'bb accumulates the largest circuit',
      inFlight: 'BbChonkAccumulate',
      // The reply to that circuit's chonkLoad: bb then runs its chonkAccumulate.
      isTrigger: (exchange: Exchange, loads: number) =>
        exchange.command === 'BbChonkLoad' && loads === largestCircuit(flow) + 1,
    },
    {
      when: 'bb proves',
      inFlight: 'BbChonkProve',
      isTrigger: (exchange: Exchange, _loads: number, accumulates: number) =>
        exchange.command === 'BbChonkAccumulate' && accumulates === flow.bytecodes.length,
    },
  ])(
    'an abort while $when stops it, fences, and leaves the instance proving',
    async ({ inFlight, isTrigger }) => {
      const controller = new AbortController();
      const reason = new Error('the user cancelled the transaction');
      const secondCaller = new AztecClientBackend([], api);
      let settled = false;
      let atAbort: { inFlight?: Exchange; settled: boolean } | undefined;
      let othersVerify: Promise<boolean> | undefined;
      let loads = 0;
      let accumulates = 0;
      spy.onReply = exchange => {
        loads += exchange.command === 'BbChonkLoad' ? 1 : 0;
        accumulates += exchange.command === 'BbChonkAccumulate' ? 1 : 0;
        if (!atAbort && isTrigger(exchange, loads, accumulates)) {
          controller.abort(reason);
          atAbort = { inFlight: spy.inFlight(), settled };
          // Queued behind the aborted commands and ahead of the fence, so it runs with the flag set.
          othersVerify = secondCaller.verify(warm.proof, warm.vk);
        }
      };

      const proving = prover
        .prove(flow.witnesses, flow.vks, { signal: controller.signal })
        .finally(() => (settled = true));
      await expect(guardAfterAbort(controller.signal, proving)).rejects.toBe(reason);

      expect(atAbort?.settled).toBe(false);
      expect(atAbort?.inFlight).toMatchObject({
        command: inFlight,
        reply: 'BbErrorResponse',
        message: INTERRUPTED_MESSAGE,
      });
      expect(spy.interrupts).toBe(1);
      expect(spy.named('BbClearInterrupt').map(exchange => exchange.interrupted)).toEqual([true]);
      expect(spy.named('BbChonkVerify')).toHaveLength(1);
      expect(await othersVerify).toBe(true);
      expect(logs).toContain(`Chonk proof aborted: bb answered "${INTERRUPTED_MESSAGE}"`);
      await provesAgain();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    'an abort during compression lets it finish, sends no interrupt and rejects with the reason',
    async () => {
      const controller = new AbortController();
      const reason = new Error('the user cancelled the transaction');
      spy.onIssue = exchange => {
        if (exchange.command === 'BbChonkCompressProof') {
          controller.abort(reason);
        }
      };
      const proving = prover.prove(flow.witnesses, flow.vks, { signal: controller.signal, compress: true });
      await expect(guardAfterAbort(controller.signal, proving)).rejects.toBe(reason);

      expect(spy.interrupts).toBe(0);
      expect(spy.named('BbChonkCompressProof')).toMatchObject([{ reply: 'BbChonkCompressProofResponse' }]);
      expect(spy.exchanges.at(-1)).toMatchObject({ command: 'BbClearInterrupt', interrupted: false });
      await provesAgain();
    },
    TEST_TIMEOUT_MS,
  );
});

describe('aborting a Chonk proof on Wasm (direct)', () => {
  it(
    'finishes the command in hand and issues no further one',
    async () => {
      const flow = loadFlow(FLOW);
      const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1 });
      try {
        expect(api.interruptible).toBe(false);
        const spy = new TransportSpy(transportOf(api));
        const controller = new AbortController();
        const reason = new Error('the user cancelled the transaction');
        spy.onIssue = exchange => {
          if (exchange.command === 'BbChonkAccumulate') {
            controller.abort(reason);
          }
        };
        const prover = new AztecClientBackend(flow.bytecodes, api, flow.names, flow.kinds);
        const proving = prover.prove(flow.witnesses, flow.vks, { signal: controller.signal });
        await expect(guardAfterAbort(controller.signal, proving)).rejects.toBe(reason);
        expect(spy.exchanges.map(exchange => [exchange.command, exchange.reply])).toEqual([
          ['BbChonkStart', 'BbChonkStartResponse'],
          ['BbChonkLoad', 'BbChonkLoadResponse'],
          ['BbChonkAccumulate', 'BbChonkAccumulateResponse'],
          ['BbClearInterrupt', 'BbClearInterruptResponse'],
        ]);
        expect(spy.interrupts).toBe(0);
      } finally {
        await api.destroy();
      }
    },
    TEST_TIMEOUT_MS,
  );
});

/** Abort-to-settle samples per backend and flow; the latency bounds are checked over them, not here. */
const MEASURED_SAMPLES = 20;
/** The first cycle pays one-time allocations; two more show whether RSS keeps growing. */
const MEMORY_CYCLES = 3;
/** Allocator noise on a multi-GB heap stays well under 5%, while keeping one proof's working set would exceed it. */
const RSS_GROWTH_LIMIT = 0.05;
/** Long enough for /proc's 10 ms CPU ticks to resolve a busy core from an idle one. */
const CPU_WINDOW_MS = 500;

function printSample(sample: object) {
  process.stdout.write(`${JSON.stringify(sample)}\n`);
}

/** Resident set of the process doing the proving: the bb child, or this process, which hosts the wasm workers. */
function provingRss(pid: number | undefined): number {
  if (pid === undefined) {
    return process.memoryUsage().rss;
  }
  const kib = /VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))![1];
  return Number(kib) * 1024;
}

/** CPU seconds used so far by the bb child (utime + stime, in 100 Hz ticks), or by this process. */
function provingCpuSeconds(pid: number | undefined): number {
  if (pid === undefined) {
    const { user, system } = process.cpuUsage();
    return (user + system) / 1e6;
  }
  const fields = readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
  return (Number(fields[11]) + Number(fields[12])) / 100;
}

const measure = process.env.BB_INTERRUPT_MEASURE ? describe : describe.skip;

measure.each(INTERRUPTIBLE_BACKENDS)('measuring aborts on $label', ({ label, backend }) => {
  let api: Barretenberg;
  let spy: TransportSpy;
  let pid: number | undefined;

  beforeAll(async () => {
    api = await Barretenberg.new({ backend, threads: THREADS, bbPath: localBbPath() });
    spy = new TransportSpy(transportOf(api));
    pid = backend === BackendType.NativeUnixSocket ? childPid(spy.transport) : undefined;
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    await api?.destroy();
  });

  /** Proves `flow` once, uncancelled, and returns how long its pipeline took, from chonkStart to chonkProve's answer. */
  async function pipelineMs(prover: AztecClientBackend, flow: PinnedFlow) {
    spy.reset();
    await prover.prove(flow.witnesses, flow.vks);
    return spy.named('BbChonkProve')[0].answeredAt! - spy.named('BbChonkStart')[0].issuedAt;
  }

  /** Aborts a prove `offsetMs` after it starts; returns the command in flight at the abort and the time to settle. */
  async function abortAfter(prover: AztecClientBackend, flow: PinnedFlow, offsetMs: number) {
    spy.reset();
    const controller = new AbortController();
    let settledAt: number | undefined;
    const proving = prover
      .prove(flow.witnesses, flow.vks, { signal: controller.signal })
      .then(
        () => 'proved',
        (error: unknown) => (error === controller.signal.reason ? 'reason' : String(error)),
      )
      .finally(() => (settledAt = performance.now()));
    await new Promise(resolve => setTimeout(resolve, offsetMs));
    const settledBeforeAbort = settledAt !== undefined;
    const inFlight = spy.inFlight()?.command;
    const abortedAt = performance.now();
    controller.abort();
    const outcome = await proving;
    return {
      inFlight,
      outcome,
      settledBeforeAbort,
      latencyMs: settledBeforeAbort ? undefined : settledAt! - abortedAt,
      interrupts: spy.interrupts,
      fenceReads: spy.named('BbClearInterrupt').length,
    };
  }

  it.each([FLOW, SECOND_MEASURED_FLOW])(
    'abort-to-settle latency on %s',
    async flowName => {
      const flow = loadFlow(flowName);
      const prover = new AztecClientBackend(flow.bytecodes, api, flow.names, flow.kinds);
      const pipeline = await pipelineMs(prover, flow);
      printSample({ kind: 'pipeline', backend: label, flow: flowName, pipelineMs: pipeline });
      for (let sample = 0; sample < MEASURED_SAMPLES; sample++) {
        const offsetMs = Math.random() * pipeline;
        printSample({
          kind: 'latency',
          backend: label,
          flow: flowName,
          sample,
          offsetMs,
          ...(await abortAfter(prover, flow, offsetMs)),
        });
      }
    },
    TEST_TIMEOUT_MS * 3,
  );

  it(
    'RSS across abort-then-prove cycles, and bb at rest after an abort',
    async () => {
      const flow = loadFlow(FLOW);
      const prover = new AztecClientBackend(flow.bytecodes, api, flow.names, flow.kinds);
      const pipeline = await pipelineMs(prover, flow);
      const rss: number[] = [];
      for (let cycle = 0; cycle < MEMORY_CYCLES; cycle++) {
        await abortAfter(prover, flow, pipeline / 2);
        await prover.prove(flow.witnesses, flow.vks);
        rss.push(provingRss(pid));
        printSample({ kind: 'rss', backend: label, cycle, rssBytes: rss[cycle] });
      }
      expect(Math.max(...rss.slice(1)) / rss[0]).toBeLessThanOrEqual(1 + RSS_GROWTH_LIMIT);

      await abortAfter(prover, flow, pipeline / 2);
      const cpuBefore = provingCpuSeconds(pid);
      await new Promise(resolve => setTimeout(resolve, CPU_WINDOW_MS));
      const cpuShare = (provingCpuSeconds(pid) - cpuBefore) / (CPU_WINDOW_MS / 1000);
      const probeStart = performance.now();
      await api.blake2s({ data: new Uint8Array(32) });
      printSample({ kind: 'rest', backend: label, cpuShare, probeMs: performance.now() - probeStart });
    },
    TEST_TIMEOUT_MS,
  );
});
