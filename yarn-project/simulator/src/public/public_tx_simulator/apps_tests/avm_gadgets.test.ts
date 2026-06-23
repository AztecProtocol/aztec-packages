import { randomInt } from '@aztec/foundation/crypto/random';
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
    const deployer = AztecAddress.fromNumberUnsafe(42);

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

    it('sha256_hash_test_vector', async () => {
      // sha256([0x00, 0x01, ..., 0x09]) = 1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3
      const input = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/sha256_hash_10',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'sha256_hash_10',
            args: [input],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
      const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
      const expected = [...Buffer.from('1f825aa2f0020ef7cf91dfa30da4668d791c5d4824fc8e41354b89ec05795ab3', 'hex')];
      expect(outputBytes).toEqual(expected);
    });

    it('sha256_hash_test_vector_255bytes', async () => {
      // 255 bytes exceeds the sha256 block size (64 bytes), triggering multi-block compression.
      // sha256([0x00, 0x01, ..., 0xfe]) = 3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe
      const input = Array.from({ length: 255 }, (_, i) => i);
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/sha256_hash_255',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'sha256_hash_255',
            args: [input],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
      const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
      const expected = [...Buffer.from('3f8591112c6bbe5c963965954e293108b7208ed2af893e500d859368c654eabe', 'hex')];
      expect(outputBytes).toEqual(expected);
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

    it('keccak_hash_test_vector', async () => {
      // keccak256([0x00, 0x01, ..., 0x09]) = f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0
      const input = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09];
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_hash',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash',
            args: [input],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
      const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
      const expected = [...Buffer.from('f0ae86a6257e615bce8b0fe73794934deda00c13d58f80b466a9354e306c9eb0', 'hex')];
      expect(outputBytes).toEqual(expected);
    });

    it('keccak_hash_test_vector_300bytes', async () => {
      // 300 bytes exceeds the keccak256 rate (136 bytes), triggering multi-block permutation.
      // keccak256([0x00, 0x01, ..., 0x2b, 0x00, 0x01, ..., 0x2b, ...]) for 300 bytes
      const input = Array.from({ length: 300 }, (_, i) => i % 256);
      const result = await tester.executeTxWithLabel(
        /*txLabel=*/ 'AvmGadgetsTest/keccak_hash_300',
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash_300',
            args: [input],
          },
        ],
      );
      expect(result.revertCode.isOK()).toBe(true);
      const outputBytes = result.getAppLogicReturnValues()?.[0]?.values?.map(fr => Number(fr.toBigInt()));
      const expected = [...Buffer.from('a679e749a6af300c36e7ff2255d220864eab27b382f9cfdc5aa4d13563ba36ff', 'hex')];
      expect(outputBytes).toEqual(expected);
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
            args: [/*input=*/ Array.from({ length: 1400 }, () => randomInt(2 ** 8))],
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
