import { createLogger } from '@aztec/foundation/log';
import { defaultGlobals, deployBitwiseSha256ErrorRowCollisionContracts } from '@aztec/simulator/public/fixtures';
import { AvmCircuitInputs } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester } from './avm_proving_tester.js';

describe('AVM completeness — bitwise/sha256 error row collision (regression guard)', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;
  const logger = createLogger('avm-completeness-bitwise-sha256');

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly=*/ true, /*globals=*/ defaultGlobals());
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  // Guards against regression of the completeness bug where an honest tx whose inner call
  // emits a bitwise error row (XOR with tag mismatch) and whose outer call runs
  // SHA256COMPRESSION with sigma0(w[1]=0) → XOR(U32(0), U32(0)) could not be proven: the
  // sha256 bitwise lookup collided with the inner's error row on the 5-tuple
  // (0, 0, 0, XOR, U32), violating BITW_NO_EXTERNAL_START_ON_ERROR. The fix adds a second
  // input tag to the bitwise lookup from keccakf1600.pil/sha256.pil so the caller passes
  // (u32_tag, u32_tag) while error rows have (tag_a, tag_b) with tag_a != tag_b, making
  // the collision impossible.
  it('proves honest tx with sha256 XOR(U32(0), U32(0)) after inner bitwise error', async () => {
    const { innerContract, outerContract } = await deployBitwiseSha256ErrorRowCollisionContracts(tester);
    const sender = AztecAddress.fromNumberUnsafe(42);

    // Inner call reverts (tag mismatch), outer runs SHA256, outer RETURNs OK.
    const simRes = await tester.simulateTx(
      sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [{ address: outerContract.address, args: [innerContract.address.toField()] }],
    );
    expect(simRes.revertCode.isOK()).toBe(true);

    const avmCircuitInputs = new AvmCircuitInputs(simRes.hints!, simRes.publicInputs!);
    logger.info('Checking AVM circuit for bitwise/sha256 collision regression');
    await tester.prove(avmCircuitInputs, 'bitwise-sha256-collision');
  }, 180_000);
});
