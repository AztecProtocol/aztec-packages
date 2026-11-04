import { BbError, type ChonkProof } from '@aztec-foundation/bb.js-api';
import type { IpcClientAsync } from '@aztec-foundation/ipc-runtime';
import { jest } from '@jest/globals';
import { getEventListeners } from 'events';

import { CircuitKind } from '../circuit_kind.js';
import {
  AztecClientBackend,
  type AztecClientProveOptions,
  INTERRUPTED_MESSAGE,
  fieldToString,
  fieldsToStrings,
} from './backend.js';
import { Barretenberg } from './index.js';

describe('field helper functions', () => {
  describe('fieldToString', () => {
    it('converts zero field to "0"', () => {
      const zeroField = new Uint8Array(32).fill(0);
      expect(fieldToString(zeroField)).toBe('0');
    });

    it('converts field with value 1 to "1"', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 1;
      expect(fieldToString(oneField)).toBe('1');
    });

    it('converts field with value 256 to "256"', () => {
      const field = new Uint8Array(32).fill(0);
      field[30] = 1;
      field[31] = 0;
      expect(fieldToString(field)).toBe('256');
    });

    it('converts field with max uint8 in last byte to "255"', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field)).toBe('255');
    });

    it('converts larger values correctly', () => {
      // 0x0100 = 256 in decimal
      const field = new Uint8Array(32).fill(0);
      field[30] = 0x01;
      field[31] = 0x00;
      expect(fieldToString(field)).toBe('256');
    });

    it('handles multi-byte values', () => {
      // 0x010203 = 66051 in decimal
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field)).toBe('66051');
    });

    it('handles large field values', () => {
      // A known value: all bytes set to 1
      const field = new Uint8Array(32).fill(1);
      const result = fieldToString(field);
      // Verify it's a valid decimal string
      expect(result).toMatch(/^\d+$/);
      // Verify the length is reasonable for a 256-bit number
      expect(result.length).toBeGreaterThan(70);
    });

    it('converts to hex with radix 16', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field, 16)).toBe('ff');
    });

    it('converts to hex for multi-byte values', () => {
      // 0x010203
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field, 16)).toBe('10203');
    });

    it('converts to binary with radix 2', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 5;
      expect(fieldToString(field, 2)).toBe('101');
    });
  });

  describe('fieldsToStrings', () => {
    it('converts empty array to empty array', () => {
      expect(fieldsToStrings([])).toEqual([]);
    });

    it('converts single field', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 42;
      expect(fieldsToStrings([oneField])).toEqual(['42']);
    });

    it('converts multiple fields', () => {
      const field1 = new Uint8Array(32).fill(0);
      field1[31] = 1;

      const field2 = new Uint8Array(32).fill(0);
      field2[31] = 2;

      const field3 = new Uint8Array(32).fill(0);
      field3[31] = 3;

      expect(fieldsToStrings([field1, field2, field3])).toEqual(['1', '2', '3']);
    });

    it('preserves order of fields', () => {
      const fields = [10, 20, 30, 40, 50].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields)).toEqual(['10', '20', '30', '40', '50']);
    });

    it('converts to hex with radix 16', () => {
      const fields = [15, 16, 255].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields, 16)).toEqual(['f', '10', 'ff']);
    });
  });
});

describe('AztecClientBackend', () => {
  it.each(['chonkStart', 'chonkLoad', 'chonkAccumulate'] as const)('propagates %s failures', async step => {
    const error = new Error(`${step} failed`);
    const failure = Promise.reject(error);
    void failure.catch(() => {});
    const api = {
      chonkStart: () => Promise.resolve({}),
      chonkLoad: () => Promise.resolve({}),
      chonkAccumulate: () => Promise.resolve({}),
      chonkProve: () => Promise.reject(new Error('Proving continued after setup failed')),
    };
    api[step] = () => failure;
    const backend = new AztecClientBackend(
      [new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['hiding_kernel'],
      [CircuitKind.HidingKernel],
    );
    await expect(backend.prove([new Uint8Array([2])], [new Uint8Array([3])])).rejects.toBe(error);
  });

  it('issues every command before the first one completes', async () => {
    const issued: string[] = [];
    let completeStart!: () => void;
    const startDone = new Promise<object>(resolve => (completeStart = () => resolve({})));
    const api = {
      chonkStart: () => (issued.push('chonkStart'), startDone),
      chonkLoad: () => (issued.push('chonkLoad'), startDone),
      chonkAccumulate: () => (issued.push('chonkAccumulate'), startDone),
      chonkProve: () => (issued.push('chonkProve'), startDone.then(() => Promise.reject(new Error('stop')))),
    };
    const backend = new AztecClientBackend(
      [new Uint8Array([1]), new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['app', 'hiding_kernel'],
      [CircuitKind.App, CircuitKind.HidingKernel],
    );
    const proving = backend.prove(
      [new Uint8Array([2]), new Uint8Array([2])],
      [new Uint8Array([3]), new Uint8Array([3])],
    );
    await Promise.resolve();
    expect(issued).toEqual([
      'chonkStart',
      'chonkLoad',
      'chonkAccumulate',
      'chonkLoad',
      'chonkAccumulate',
      'chonkProve',
    ]);
    completeStart();
    await expect(proving).rejects.toThrow('stop');
  });

  it('rejects a missing VK before issuing any command', async () => {
    const issued: string[] = [];
    const record = (name: string) => () => (issued.push(name), Promise.resolve({}));
    const api = {
      chonkStart: record('chonkStart'),
      chonkLoad: record('chonkLoad'),
      chonkAccumulate: record('chonkAccumulate'),
      chonkProve: record('chonkProve'),
    };
    const backend = new AztecClientBackend(
      [new Uint8Array([1]), new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['app', 'hiding_kernel'],
      [CircuitKind.App, CircuitKind.HidingKernel],
    );
    await expect(
      backend.prove([new Uint8Array([2]), new Uint8Array([2])], [new Uint8Array([3]), new Uint8Array(0)]),
    ).rejects.toThrow('Missing precomputed VK for circuit 1 (hiding_kernel)');
    expect(issued).toEqual([]);
  });
});

const EMPTY_PROOF: ChonkProof = { hidingOinkProof: [], mergeProof: [], eccvmProof: [], ipaProof: [], jointProof: [] };
const PIPELINE = ['chonkStart', 'chonkLoad', 'chonkAccumulate', 'chonkLoad', 'chonkAccumulate', 'chonkProve'];

/** Passes one macrotask, after which every continuation of an answered command has run. */
const nextMacrotask = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * A real Barretenberg whose Chonk commands are answered by a model of bb, in issue order, one per `answer()`, or as
 * they are issued when `synchronous`, as a direct wasm call answers. Its transport takes an interrupt as the wasm one
 * does, setting the flag at once; while the flag is set, the commands bb arms fail with the interruption, and
 * `chonkStop` reports and clears it.
 */
class FakeBb {
  readonly issued: string[] = [];
  readonly logs: string[] = [];
  readonly stopReadTimes: number[] = [];
  /** One-time failures by command name, taking precedence over the flag. */
  readonly failures = new Map<string, unknown>();
  readonly api: Barretenberg;
  readonly synchronous: boolean;
  interrupts = 0;
  flag = false;
  onIssue?: (command: string) => void;
  readStop: () => Promise<{ interrupted: boolean }> = () => {
    const interrupted = this.flag;
    this.flag = false;
    return Promise.resolve({ interrupted });
  };
  private readonly queue: (() => void)[] = [];

  constructor({ interruptible = true, synchronous = false } = {}) {
    this.synchronous = synchronous;
    const transport: IpcClientAsync = {
      call: () => Promise.reject(new Error('unexpected call')),
      destroy: () => Promise.resolve(),
      interruptible,
      interrupt: () => {
        this.interrupts++;
        this.flag = true;
        return true;
      },
    };
    this.api = Object.assign(new Barretenberg(transport, { logger: message => this.logs.push(message) }), {
      chonkStart: this.queued('chonkStart', () => ({}), false),
      chonkLoad: this.queued('chonkLoad', () => ({}), true),
      chonkAccumulate: this.queued('chonkAccumulate', () => ({}), true),
      chonkProve: this.queued('chonkProve', () => ({ proof: EMPTY_PROOF }), true),
      chonkVerify: this.queued('chonkVerify', () => ({ valid: true }), false),
      chonkCompressProof: this.queued('chonkCompressProof', () => ({ compressedProof: new Uint8Array([1]) }), false),
      chonkStop: () => {
        this.issued.push('chonkStop');
        this.stopReadTimes.push(performance.now());
        return this.readStop();
      },
    });
  }

  get stopReads() {
    return this.stopReadTimes.length;
  }

  get pending() {
    return this.queue.length;
  }

  async answer(count = 1) {
    for (let i = 0; i < count; i++) {
      const next = this.queue.shift();
      if (!next) {
        throw new Error(`nothing to answer after ${this.issued.join(', ')}`);
      }
      next();
      await nextMacrotask();
    }
  }

  async answerAll() {
    while (this.queue.length > 0) {
      await this.answer();
    }
  }

  private queued(name: string, result: () => unknown, armed: boolean): () => Promise<any> {
    return () =>
      new Promise((resolve, reject) => {
        this.issued.push(name);
        this.onIssue?.(name);
        const answer = () => {
          if (this.failures.has(name)) {
            reject(this.failures.get(name));
            this.failures.delete(name);
          } else if (armed && this.flag) {
            reject(new BbError(INTERRUPTED_MESSAGE));
          } else {
            resolve(result());
          }
        };
        if (this.synchronous) {
          answer();
        } else {
          this.queue.push(answer);
        }
      });
  }
}

function proveTwoCircuits(bb: FakeBb, options?: AztecClientProveOptions) {
  const backend = new AztecClientBackend(
    [new Uint8Array([1]), new Uint8Array([1])],
    bb.api,
    ['app', 'hiding_kernel'],
    [CircuitKind.App, CircuitKind.HidingKernel],
  );
  return backend.prove([new Uint8Array([2]), new Uint8Array([2])], [new Uint8Array([3]), new Uint8Array([3])], options);
}

/** A model step takes one macrotask, so a thousand is far beyond any proof here. */
const MAX_STEPS = 1000;

async function until(condition: () => boolean) {
  for (let i = 0; i < MAX_STEPS && !condition(); i++) {
    await nextMacrotask();
  }
  expect(condition()).toBe(true);
}

/** Answers bb's commands as they arrive until `promise` settles. */
async function answerUntilSettled<T>(bb: FakeBb, promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  let outcome: PromiseSettledResult<T> | undefined;
  void Promise.allSettled([promise]).then(([result]) => (outcome = result));
  for (let i = 0; i < MAX_STEPS && !outcome; i++) {
    await (bb.pending > 0 ? bb.answer() : nextMacrotask());
  }
  expect(outcome).toBeDefined();
  return outcome!;
}

/** Answers every command and runs the timers, the fence's included, over FAKE_SPAN_MS of fake time. */
async function onFakeTime(bb: FakeBb) {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  try {
    const answering = bb.answerAll();
    await jest.advanceTimersByTimeAsync(FAKE_SPAN_MS);
    await answering;
  } finally {
    jest.useRealTimers();
  }
}

/** Twice the fence's one-second bound. */
const FAKE_SPAN_MS = 2000;

/** Makes the fence's first read wait for the returned release, which then reads true. */
function holdFence(bb: FakeBb): () => void {
  let release!: () => void;
  bb.readStop = () =>
    new Promise(resolve => {
      release = () => {
        bb.flag = false;
        resolve({ interrupted: true });
      };
    });
  return () => release();
}

describe('AztecClientBackend.prove with an AbortSignal', () => {
  it('throws an argument error before looking at the signal, then rejects an aborted one without issuing', async () => {
    const bb = new FakeBb();
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    const oneCircuit = new AztecClientBackend(
      [new Uint8Array([1])],
      bb.api,
      ['hiding_kernel'],
      [CircuitKind.HidingKernel],
    );
    await expect(
      oneCircuit.prove([new Uint8Array([2])], [new Uint8Array(0)], { signal: controller.signal }),
    ).rejects.toThrow('Missing precomputed VK');
    await expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    expect(bb.issued).toEqual([]);
  });

  it.each([
    { when: 'while bb accumulates', answered: 2, interruptsAtAbort: 1, interrupts: 1, issued: PIPELINE },
    { when: 'while bb proves', answered: 5, interruptsAtAbort: 1, interrupts: 1, issued: PIPELINE },
    {
      when: 'during chonkVerify',
      answered: 6,
      interruptsAtAbort: 0,
      interrupts: 0,
      issued: [...PIPELINE, 'chonkVerify'],
    },
    {
      when: 'during chonkCompressProof',
      answered: 7,
      interruptsAtAbort: 0,
      interrupts: 0,
      issued: [...PIPELINE, 'chonkVerify', 'chonkCompressProof'],
    },
  ])(
    'an abort $when settles after every answer and one fence',
    async ({ answered, interruptsAtAbort, interrupts, issued }) => {
      const bb = new FakeBb();
      const controller = new AbortController();
      const reason = new Error('cancelled');
      let settled = false;
      const proving = proveTwoCircuits(bb, { signal: controller.signal, compress: true }).finally(
        () => (settled = true),
      );
      const rejected = expect(proving).rejects.toBe(reason);
      await bb.answer(answered);
      controller.abort(reason);
      controller.abort(new Error('a second abort of the same signal'));
      expect(bb.interrupts).toBe(interruptsAtAbort);
      await nextMacrotask();
      expect(settled).toBe(false);
      await bb.answerAll();
      await rejected;
      expect(bb.interrupts).toBe(interrupts);
      expect(bb.issued).toEqual([...issued, 'chonkStop']);
      expect(bb.flag).toBe(false);
      expect(bb.logs.filter(line => line.includes(INTERRUPTED_MESSAGE))).toHaveLength(interrupts);
    },
  );

  it.each([
    { what: 'a transport failure after the interruption', failing: 'chonkProve' },
    { what: 'a real failure racing the abort', failing: 'chonkAccumulate' },
  ])('rethrows $what in place of the reason', async ({ failing }) => {
    const bb = new FakeBb();
    const controller = new AbortController();
    const failure = new Error(`${failing} failed`);
    bb.failures.set(failing, failure);
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(failure);
    await bb.answer(2);
    controller.abort();
    await bb.answerAll();
    await rejected;
    expect(bb.issued).toEqual([...PIPELINE, 'chonkStop']);
  });

  it('marks the instance non-interruptible, once, when the fence is unknown to bb', async () => {
    const bb = new FakeBb();
    bb.readStop = () => Promise.reject(new BbError('unknown command: BbChonkStop'));
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    await bb.answer(2);
    controller.abort(reason);
    await bb.answerAll();
    await rejected;
    expect(bb.stopReads).toBe(1);
    expect(bb.api.interruptible).toBe(false);
    expect(bb.logs.filter(line => line.includes('takes effect between commands'))).toHaveLength(1);
  });

  it('stays interruptible when bb does not confirm an interrupt, which then fails the next proof once', async () => {
    const bb = new FakeBb();
    // The interrupt stays in flight until the fence has given up, as when bb is not scheduled.
    const send = bb.api.interrupt.bind(bb.api);
    bb.api.interrupt = () => {
      const delivered = send();
      bb.flag = false;
      return delivered;
    };
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    controller.abort(reason);
    await onFakeTime(bb);
    await rejected;
    expect(bb.interrupts).toBe(1);
    expect(bb.api.interruptible).toBe(true);
    // A hundred reads 10 ms apart.
    expect(bb.stopReads).toBe(100);
    expect(bb.stopReadTimes[bb.stopReads - 1] - bb.stopReadTimes[0]).toBe(990);

    bb.flag = true;
    const late = await answerUntilSettled(bb, proveTwoCircuits(bb));
    expect(late.status).toBe('rejected');
    expect((late as PromiseRejectedResult).reason.message).toBe(INTERRUPTED_MESSAGE);
    expect(bb.flag).toBe(false);
    expect((await answerUntilSettled(bb, proveTwoCircuits(bb))).status).toBe('fulfilled');
  });

  it('marks the instance non-interruptible when bb does not know chonkStop, for an abort after proving', async () => {
    const bb = new FakeBb();
    bb.readStop = () => Promise.reject(new BbError('unknown command: BbChonkStop'));
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    await bb.answer(PIPELINE.length);
    controller.abort(reason);
    await bb.answerAll();
    await rejected;
    expect(bb.interrupts).toBe(0);
    expect(bb.issued).toEqual([...PIPELINE, 'chonkVerify', 'chonkStop']);
    expect(bb.api.interruptible).toBe(false);
  });

  it('rejects at the fence bound when chonkStop is never answered, and stays interruptible', async () => {
    const bb = new FakeBb();
    bb.readStop = () => new Promise(() => {});
    const controller = new AbortController();
    const reason = new Error('cancelled');
    let outcome: PromiseSettledResult<unknown> | undefined;
    void Promise.allSettled([proveTwoCircuits(bb, { signal: controller.signal })]).then(
      ([result]) => (outcome = result),
    );
    controller.abort(reason);
    await onFakeTime(bb);
    expect(outcome).toEqual({ status: 'rejected', reason });
    expect(bb.stopReads).toBe(1);
    expect(bb.api.interruptible).toBe(true);
  });

  it('spaces fence reads by the retry interval and stays interruptible once one reads true', async () => {
    const bb = new FakeBb();
    const reads = [false, false, true];
    bb.readStop = () => Promise.resolve({ interrupted: reads.shift()! });
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    controller.abort(reason);
    await onFakeTime(bb);
    await rejected;
    expect(bb.stopReadTimes.map(time => time - bb.stopReadTimes[0])).toEqual([0, 10, 20]);
    expect(bb.api.interruptible).toBe(true);
  });

  it('ends the fence on a transport failure without marking the instance non-interruptible', async () => {
    const bb = new FakeBb();
    bb.readStop = () => Promise.reject(new Error('backend destroyed'));
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const rejected = expect(proveTwoCircuits(bb, { signal: controller.signal })).rejects.toBe(reason);
    controller.abort(reason);
    await bb.answerAll();
    await rejected;
    expect(bb.stopReads).toBe(1);
    expect(bb.api.interruptible).toBe(true);
  });

  it.each([
    { path: 'without a signal', interruptible: true, withSignal: false },
    { path: 'pipelined with a signal', interruptible: true, withSignal: true },
    { path: 'one command at a time', interruptible: false, withSignal: true },
  ])('clears a late interrupt once and rethrows it, $path', async ({ interruptible, withSignal }) => {
    const bb = new FakeBb({ interruptible });
    bb.flag = true;
    const options = withSignal ? { signal: new AbortController().signal } : undefined;
    const outcome = await answerUntilSettled(bb, proveTwoCircuits(bb, options));
    expect(outcome.status).toBe('rejected');
    const error = (outcome as PromiseRejectedResult).reason;
    expect(error).toBeInstanceOf(BbError);
    expect(error.message).toBe(INTERRUPTED_MESSAGE);
    expect(bb.stopReads).toBe(1);
    expect((await answerUntilSettled(bb, proveTwoCircuits(bb, options))).status).toBe('fulfilled');
  });

  it('starts a prove() issued right after an abort only once the aborted one has fenced', async () => {
    const bb = new FakeBb();
    const releaseFence = holdFence(bb);
    const first = new AbortController();
    const aborted = proveTwoCircuits(bb, { signal: first.signal });
    await bb.answer(2);
    first.abort();
    const next = proveTwoCircuits(bb);
    await bb.answerAll();
    await until(() => bb.stopReads === 1);
    await nextMacrotask();
    expect(bb.issued).toEqual([...PIPELINE, 'chonkStop']);
    releaseFence();
    await expect(aborted).rejects.toBe(first.signal.reason);
    expect((await answerUntilSettled(bb, next)).status).toBe('fulfilled');
    expect(bb.issued).toEqual([...PIPELINE, 'chonkStop', ...PIPELINE, 'chonkVerify']);
  });

  it('rejects a prove() aborted while it waits for its turn at once, and still passes the turn on in order', async () => {
    const bb = new FakeBb();
    const releaseFence = holdFence(bb);
    const first = new AbortController();
    const aborted = proveTwoCircuits(bb, { signal: first.signal });
    first.abort();
    const second = new AbortController();
    const waiting = proveTwoCircuits(bb, { signal: second.signal });
    const third = proveTwoCircuits(bb);
    second.abort();
    await expect(waiting).rejects.toBe(second.signal.reason);
    await bb.answerAll();
    await until(() => bb.stopReads === 1);
    await nextMacrotask();
    expect(bb.issued).toEqual([...PIPELINE, 'chonkStop']);
    releaseFence();
    await expect(aborted).rejects.toBe(first.signal.reason);
    expect((await answerUntilSettled(bb, third)).status).toBe('fulfilled');
    expect(bb.issued).toEqual([...PIPELINE, 'chonkStop', ...PIPELINE, 'chonkVerify']);
  });

  it('ignores an abort after prove() settled and leaves no listener behind', async () => {
    const bb = new FakeBb();
    const controller = new AbortController();
    const proving = proveTwoCircuits(bb, { signal: controller.signal });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
    await bb.answerAll();
    await expect(proving).resolves.toBeDefined();
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    controller.abort();
    await nextMacrotask();
    expect(bb.interrupts).toBe(0);
    expect(bb.issued).toEqual([...PIPELINE, 'chonkVerify']);
  });

  it('on a backend that cannot interrupt, issues one command at a time, stops between them and warns once', async () => {
    const bb = new FakeBb({ interruptible: false });
    const controller = new AbortController();
    const proving = proveTwoCircuits(bb, { signal: controller.signal });
    expect(bb.issued).toEqual(['chonkStart']);
    await bb.answer();
    await until(() => bb.pending > 0);
    expect(bb.issued).toEqual(['chonkStart', 'chonkLoad']);
    controller.abort();
    await bb.answer();
    await expect(proving).rejects.toBe(controller.signal.reason);
    expect(bb.issued).toEqual(['chonkStart', 'chonkLoad', 'chonkStop']);
    expect(bb.interrupts).toBe(0);

    const again = new AbortController();
    const second = proveTwoCircuits(bb, { signal: again.signal });
    again.abort();
    await bb.answer();
    await expect(second).rejects.toBe(again.signal.reason);
    expect(bb.logs.filter(line => line.includes('cannot stop a running command'))).toHaveLength(1);
  });

  it.each([
    { during: 'chonkProve', issued: PIPELINE },
    { during: 'chonkVerify', issued: [...PIPELINE, 'chonkVerify'] },
    { during: 'chonkCompressProof', issued: [...PIPELINE, 'chonkVerify', 'chonkCompressProof'] },
  ])(
    'on a backend that answers synchronously, an abort from a timer set during $during skips what follows',
    async ({ during, issued }) => {
      const bb = new FakeBb({ interruptible: false, synchronous: true });
      const controller = new AbortController();
      const reason = new Error('cancelled');
      // A timer set while a direct wasm call blocks the thread fires only once the event loop runs again.
      bb.onIssue = command => {
        if (command === during) {
          setTimeout(() => controller.abort(reason), 0);
        }
      };
      await expect(proveTwoCircuits(bb, { signal: controller.signal, compress: true })).rejects.toBe(reason);
      expect(bb.issued).toEqual([...issued, 'chonkStop']);
    },
  );

  it('fulfils only if no abort came before it settled, wherever among the last steps the abort lands', async () => {
    const outcomes = new Set<string>();
    for (let abortAt = 0; abortAt < ABORT_SWEEP; abortAt++) {
      const bb = new FakeBb();
      const controller = new AbortController();
      let tick = 0;
      let observedAt: number | undefined;
      const proving = proveTwoCircuits(bb, { signal: controller.signal, compress: true });
      void proving.then(
        () => (observedAt = tick),
        () => {},
      );
      await bb.answer(PIPELINE.length + 1);
      // Answers the compression, the last step, then counts microtasks in step with prove()'s own continuations.
      const answered = bb.answer();
      for (tick = 0; tick < 2 * ABORT_SWEEP; tick++) {
        if (tick === abortAt) {
          controller.abort();
        }
        await Promise.resolve();
      }
      await answered;
      const [result] = await Promise.allSettled([proving]);
      outcomes.add(result.status);
      if (result.status === 'fulfilled') {
        // A fulfilment is seen one microtask after it settles, so at most the one microtask holding the abort can
        // come between them.
        expect(observedAt).toBeLessThanOrEqual(abortAt);
      } else {
        expect(result.reason).toBe(controller.signal.reason);
      }
    }
    expect([...outcomes].sort()).toEqual(['fulfilled', 'rejected']);
  });
});

/** Microtask positions an abort is tried at: well past the few between the last answer and prove() settling. */
const ABORT_SWEEP = 20;
