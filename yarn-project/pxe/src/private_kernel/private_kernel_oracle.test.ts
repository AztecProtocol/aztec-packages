import { PUBLIC_DATA_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { SiblingPath } from '@aztec/foundation/trees';
import type { KeyStore } from '@aztec/key-store';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { DelayedPublicMutableValuesWithHash } from '@aztec/stdlib/delayed-public-mutable';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { PublicDataTreeLeaf, PublicDataTreeLeafPreimage, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import { PrivateKernelOracle } from './private_kernel_oracle.js';

describe('PrivateKernelOracle', () => {
  let oracle: PrivateKernelOracle;
  let node: ReturnType<typeof mock<AztecNode>>;

  beforeEach(() => {
    node = mock<AztecNode>();
    oracle = new PrivateKernelOracle(mock<ContractStore>(), mock<KeyStore>(), node, BlockHeader.empty());
  });

  describe('getUpdatedClassIdHints', () => {
    it('skips storage reads when contract class was never updated', async () => {
      const contractAddress = await AztecAddress.random();
      const hashLeafSlot = await getHashLeafSlot(contractAddress);

      // Non-matching slot simulates a low-leaf witness (slot was never written)
      const unrelatedSlot = new Fr(hashLeafSlot.toBigInt() - 1n);
      node.getPublicDataWitness.mockResolvedValue(makeWitness(unrelatedSlot));

      const result = await oracle.getUpdatedClassIdHints(contractAddress);

      expect(result.updatedClassIdValues.isEmpty()).toBe(true);
      expect(node.getPublicStorageAt).not.toHaveBeenCalled();
    });

    it('reads storage when contract class was updated', async () => {
      const contractAddress = await AztecAddress.random();
      const hashLeafSlot = await getHashLeafSlot(contractAddress);

      // Matching slot means the contract class was updated
      node.getPublicDataWitness.mockResolvedValue(makeWitness(hashLeafSlot, Fr.random()));
      node.getPublicStorageAt.mockResolvedValue(new Fr(42));

      const result = await oracle.getUpdatedClassIdHints(contractAddress);

      expect(result.updatedClassIdValues.isEmpty()).toBe(false);
      expect(node.getPublicStorageAt).toHaveBeenCalled();
    });
  });

  async function getHashLeafSlot(contractAddress: AztecAddress) {
    const { delayedPublicMutableHashSlot } =
      await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(contractAddress);
    return computePublicDataTreeLeafSlot(
      ProtocolContractAddress.ContractInstanceRegistry,
      delayedPublicMutableHashSlot,
    );
  }

  function makeWitness(slot: Fr, value: Fr = Fr.ZERO) {
    return new PublicDataWitness(
      0n,
      new PublicDataTreeLeafPreimage(new PublicDataTreeLeaf(slot, value), Fr.ZERO, 0n),
      SiblingPath.random(PUBLIC_DATA_TREE_HEIGHT),
    );
  }
});
