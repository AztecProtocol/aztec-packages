import { Barretenberg } from '../barretenberg/index.js';
import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { BarretenbergWasm } from '../barretenberg_wasm/index.js';
import { Timer } from '../benchmark/timer.js';
import { serializeBufferArrayToVector } from '../serialize/serialize.js';
import { Fr, Point } from '../types/index.js';

describe('pedersen', () => {
  let api: Barretenberg;

  beforeAll(async () => {
    api = await Barretenberg.new(1);
  }, 30000);

  afterAll(async () => {
    await api.destroy();
  });

  it('pedersenHashWithHashIndex', async () => {
    const result = await api.pedersenHashWithHashIndex([new Fr(4n), new Fr(8n)], 7);
    expect(result).toEqual(new Fr(2152386650411553803409271316104075950536496387580531018130718456431861859990n));
  });

  it('pedersenCommit', async () => {
    const result = await api.pedersenCommit([new Fr(4n), new Fr(8n), new Fr(12n)]);
    expect(result).toEqual(
      new Point(
        new Fr(18374309251862457296563484909553154519357910650678202211610516068880120638872n),
        new Fr(2572141322478528249692953821523229170092797347760799983831061874108357705739n),
      ),
    );
  });
});

describe('pedersen sync', () => {
  function pedersenCommitWasm(wasm: BarretenbergWasmMain, inputs: Uint8Array[]) {
    const data = serializeBufferArrayToVector(inputs);

    // WASM gives us 1024 bytes of scratch space which we can use without
    // needing to allocate/free it ourselves. This can be useful for when we need to pass in several small variables
    // when calling functions on the wasm, however it's important to not overrun this scratch space as otherwise
    // the written data will begin to corrupt the stack.
    //
    // Using this scratch space isn't particularly safe if we have multiple threads interacting with the wasm however,
    // each thread could write to the same pointer address simultaneously.
    const SCRATCH_SPACE_SIZE = 1024;

    // For pedersen hashing, the case of hashing two inputs is the most common.
    // so ideally we want to optimize for that. This will use 64 bytes of memory and
    // can thus be optimized by checking if the input buffer is smaller than the scratch space.
    let inputPtr = 0;
    if (inputs.length >= SCRATCH_SPACE_SIZE) {
      inputPtr = wasm.call('bbmalloc', data.length);
    }
    wasm.writeMemory(inputPtr, data);

    // Since the output is 32 bytes, instead of allocating memory
    // we can reuse the scratch space to store the result.
    const outputPtr = 0;

    wasm.call('pedersen__commit', inputPtr, outputPtr);
    const hashOutput = wasm.getMemorySlice(0, 64);

    if (inputPtr !== 0) {
      wasm.call('bbfree', inputPtr);
    }

    return [Buffer.from(hashOutput.slice(0, 32)), Buffer.from(hashOutput.slice(32, 64))];
  }

  it('pedersenCommit pure sync', async () => {
    const bb = new BarretenbergWasmMain();
    await bb.init(1);
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random().toBuffer());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      pedersenCommitWasm(bb, [fields[i * 2], fields[i * 2 + 1]]);
    }
    console.log(t.us() / loops);
  });

  it('pedersenCommit sync', async () => {
    const api = await Barretenberg.newSync();
    const loops = 1000;
    const fields = Array.from({ length: loops * 2 }).map(() => Fr.random());
    const t = new Timer();
    for (let i = 0; i < loops; ++i) {
      await api.pedersenCommit([fields[i * 2], fields[i * 2 + 1]]);
    }
    console.log(t.us() / loops);
  });
});
