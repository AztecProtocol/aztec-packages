import type { IpcClientAsync } from '@aztec-foundation/ipc-runtime';
import { Decoder } from 'msgpackr';
import { execFileSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';

import { AztecClientBackend, type AztecClientProveResult, INTERRUPTED_MESSAGE } from './backend.js';
import { BackendType, Barretenberg } from './index.js';
import { type PinnedFlow, ensurePinnedInputsRoot, loadPinnedFlow, localBbPath } from './testing/pinned_flows.js';

/** Ten circuits covering every kernel kind; the flow the pinned-input benchmarks use. */
const FLOW = 'ecdsar1+transfer_0_recursions+private_fpc';

/** bb.js's default thread cap, within the CPUs this process may run on (a CI slot pins fewer). */
const THREADS = Math.min(16, availableParallelism());

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
  /** ChonkStop's answer. */
  interrupted?: boolean;
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
      const exchange: Exchange = { command };
      this.exchanges.push(exchange);
      this.onIssue?.(exchange);
      const output = await call(input);
      const [reply, payload] = decoder.unpack(output) as [string, { message?: string; interrupted?: boolean }];
      Object.assign(exchange, { reply, message: payload.message, interrupted: payload.interrupted });
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

/**
 * Fails a precondition on scheduling: an abort fired on a reply must reach bb while the next command runs, which only a
 * stall of this process longer than that command breaks, not a fault in bb or bb.js.
 */
function expectTimely(holds: boolean, what: string) {
  if (!holds) {
    throw new Error(`timing precondition: ${what}; the test process stalled longer than the targeted command`);
  }
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

      expectTimely(atAbort?.settled === false, 'the abort landed after prove() settled');
      expectTimely(
        atAbort?.inFlight?.reply !== `${inFlight}Response`,
        `${inFlight} finished before the abort reached bb`,
      );
      expect(atAbort?.inFlight).toMatchObject({
        command: inFlight,
        reply: 'BbErrorResponse',
        message: INTERRUPTED_MESSAGE,
      });
      expect(spy.interrupts).toBe(1);
      expect(spy.named('BbChonkStop').map(exchange => exchange.interrupted)).toEqual([true]);
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
      expect(spy.exchanges.at(-1)).toMatchObject({ command: 'BbChonkStop', interrupted: false });
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
          ['BbChonkStop', 'BbChonkStopResponse'],
        ]);
        expect(spy.interrupts).toBe(0);
      } finally {
        await api.destroy();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
