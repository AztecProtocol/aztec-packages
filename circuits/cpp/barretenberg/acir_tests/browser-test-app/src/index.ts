import createDebug from "debug";
import { inflate } from "pako";

createDebug.enable("*");
const debug = createDebug("simple_test");

async function runTest(
  bytecode: Uint8Array,
  witness: Uint8Array,
  threads?: number
) {
  const { Barretenberg, RawBuffer, Crs } = await import("@aztec/bb.js");
  const CIRCUIT_SIZE = 2 ** 19;

  debug("starting test...");
  const api = await Barretenberg.new(threads);

  // Important to init slab allocator as first thing, to ensure maximum memory efficiency.
  await api.commonInitSlabAllocator(CIRCUIT_SIZE);

  // Plus 1 needed!
  const crs = await Crs.new(CIRCUIT_SIZE + 1);
  await api.srsInitSrs(
    new RawBuffer(crs.getG1Data()),
    crs.numPoints,
    new RawBuffer(crs.getG2Data())
  );

  const acirComposer = await api.acirNewAcirComposer(CIRCUIT_SIZE);
  const proof = await api.acirCreateProof(
    acirComposer,
    bytecode,
    witness,
    true
  );
  debug(`verifying...`);
  const verified = await api.acirVerifyProof(acirComposer, proof, true);
  debug(`verified: ${verified}`);

  await api.destroy();

  debug("test complete.");
  return verified;
}

(window as any).runTest = runTest;
