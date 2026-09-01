import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { defaultGlobals } from '@aztec/simulator/public/fixtures';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state';

import { AvmProvingTester } from './avm_proving_tester.js';

// Native Brillig/BN254 `multi_scalar_mul` rejects any scalar whose limbs combine to a value >= the Grumpkin
// scalar field modulus (noir/noir-repo/acvm-repo/bn254_blackbox_solver/src/embedded_curve_ops.rs). The
// hand-written MSM procedure (avm-transpiler/src/procedures/msm.rs) decomposes the limbs to 126/128
// bits and double-and-add without ever comparing the combined scalar against the modulus, so public AVM
// execution silently treated a large scalar as the group-order multiple.
//
// The AvmTestContract `variable_base_msm` function takes the scalar limbs as arguments, so we can hand it the
// modulus limbs directly without patching bytecode.

// Grumpkin scalar field modulus (= BN254 base field modulus), split into 128-bit limbs.
const GRUMPKIN_MODULUS_LO = 0x97816a916871ca8d3c208c16d87cfd47n;
const GRUMPKIN_MODULUS_HI = 0x30644e72e131a029b85045b68181585dn;

describe('AVM MSM scalar close to modulus', () => {
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
    await tester.close();
    await worldStateService.close();
  });

  it('reverts on a scalar equal to the Grumpkin scalar field modulus', async () => {
    await tester.simProveVerifyAppLogic(
      {
        address: contract.address,
        fnName: 'variable_base_msm',
        args: [
          /*scalar_lo=*/ GRUMPKIN_MODULUS_LO,
          /*scalar_hi=*/ GRUMPKIN_MODULUS_HI,
          /*scalar2_lo=*/ 1,
          /*scalar2_hi=*/ 0,
        ],
      },
      /*expectRevert=*/ true,
      /*txLabel=*/ 'msm-scalar-at-modulus',
    );
  }, 240_000);

  it('accepts the largest canonical scalar (modulus - 1)', async () => {
    await tester.simProveVerifyAppLogic(
      {
        address: contract.address,
        fnName: 'variable_base_msm',
        args: [
          /*scalar_lo=*/ GRUMPKIN_MODULUS_LO - 1n,
          /*scalar_hi=*/ GRUMPKIN_MODULUS_HI,
          /*scalar2_lo=*/ 1,
          /*scalar2_hi=*/ 0,
        ],
      },
      /*expectRevert=*/ false,
      /*txLabel=*/ 'msm-scalar-below-modulus',
    );
  }, 240_000);
});
