import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester } from './avm_proving_tester.js';

// Regression for the AVM-transpiled MSM zero-scalar invalid-point gap, exercised through the full bb-prover
// proving path.
//
// The hand-written MSM procedure (avm-transpiler/src/procedures/msm.rs) used to skip a term as soon as both
// scalar limbs were zero, before validating the corresponding point. Native Brillig/BN254 `multi_scalar_mul`
// validates every input point regardless of its scalar, and there is a native test that rejects
// (x=1, y=1, is_infinite=false) even with a zero scalar
// (noir/noir-repo/acvm-repo/bn254_blackbox_solver/src/embedded_curve_ops.rs). The fix forces an on-curve
// ECADD check for every input point before the zero-scalar skip, so this off-curve point must now revert in
// the public AVM proving path instead of silently returning the point at infinity.
//
// The AvmTestContract `variable_base_msm_with_point` function takes the point coordinates as arguments, so
// we can hand it the off-curve point (1, 1) directly without patching bytecode.

describe('AVM MSM zero-scalar invalid-point regression', () => {
  let tester: AvmProvingTester;
  let worldStateService: NativeWorldStateService;

  const sender = AztecAddress.fromNumberUnsafe(42);
  let contract: ContractInstanceWithAddress;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    // FULL PROVING (not check-circuit) so the gap is exercised through the real bb-prover path.
    tester = await AvmProvingTester.new(worldStateService, /*checkCircuitOnly=*/ false, /*globals=*/ defaultGlobals());
    contract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      sender,
      /*contractArtifact=*/ AvmTestContractArtifact,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('reverts on an off-curve point even when its scalar is zero', async () => {
    await tester.simProveVerifyAppLogic(
      {
        address: contract.address,
        fnName: 'variable_base_msm_with_point',
        // Off-curve point (1, 1) with a zero scalar: the term contributes nothing but must still be validated.
        args: [/*px=*/ 1, /*py=*/ 1, /*scalar_lo=*/ 0, /*scalar_hi=*/ 0, /*scalar2_lo=*/ 20, /*scalar2_hi=*/ 0],
      },
      /*expectRevert=*/ true,
      /*txLabel=*/ 'msm-zero-scalar-invalid-point',
    );
  }, 180_000);
});
