import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicTxSimulationTester, defaultGlobals } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: gadgets', () => {
  describe.each([
    { useCppSimulator: false, simulatorName: 'TS Simulator' },
    { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
  ])('Public TX simulator apps tests: gadgets (via $simulatorName)', ({ useCppSimulator }) => {
    const deployer = AztecAddress.fromNumber(42);

    let worldStateService: NativeWorldStateService;
    let tester: PublicTxSimulationTester;
    let avmGadgetsTestContract: ContractInstanceWithAddress;

    beforeEach(async () => {
      worldStateService = await NativeWorldStateService.tmp();
      tester = await PublicTxSimulationTester.create(
        worldStateService,
        defaultGlobals(),
        /*metrics=*/ undefined,
        useCppSimulator,
      );
      avmGadgetsTestContract = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
      );
    });

    afterEach(async () => {
      await worldStateService.close();
    });

    describe.each(
      // sha sizes
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 255, 256, 511, 512, 1024, 1536],
    )('sha256_hash_%s', (length: number) => {
      it(`sha256_hash_${length}`, async () => {
        const result = await tester.executeTxWithLabel(
          /*txLabel=*/ `AvmGadgetsTest/sha256_hash_${length}`,
          /*sender=*/ deployer,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            {
              address: avmGadgetsTestContract.address,
              fnName: `sha256_hash_${length}`,
              args: [/*input=*/ Array.from({ length: length }, () => randomInt(2 ** 8))],
            },
          ],
        );
        expect(result.revertCode.isOK()).toBe(true);
      });
    });

    it('keccak_hash', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_hash',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => randomInt(2 ** 8))],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('keccak_hash_1400', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_hash_1400',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash_1400',
            args: [/*input=*/ Array.from({ length: 2400 }, () => randomInt(2 ** 8))],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('keccak_f1600', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_f1600',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_f1600',
            args: [/*input=*/ Array.from({ length: 25 }, () => randomInt(2 ** 32))],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('poseidon2_hash', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/poseidon2_hash',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'poseidon2_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('poseidon2_hash_1000fields', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/poseidon2_hash_1000fields',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'poseidon2_hash_1000fields',
            args: [/*input=*/ Array.from({ length: 1000 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/pedersen_hash',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash_with_index', async () => {
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/pedersen_hash_with_index',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash_with_index',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
    });
  });
});
