import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import {
  DELAYED_PUBLIC_MUTABLE_VALUES_LEN,
  DelayedPublicMutableValuesWithHash,
} from '@aztec/stdlib/delayed-public-mutable';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

import { type MockProxy, mock } from 'jest-mock-extended';

import { fastForwardContractUpdate } from './fastforward_contract_update.js';

describe('fastForwardContractUpdate', () => {
  let node: MockProxy<AztecNode>;
  let instanceAddress: AztecAddress;
  let originalClassId: Fr;
  let newClassId: Fr;

  beforeEach(async () => {
    node = mock<AztecNode>();
    instanceAddress = await AztecAddress.random();
    originalClassId = Fr.random();
    newClassId = Fr.random();

    const instance = (
      await SerializableContractInstance.random({
        currentContractClassId: originalClassId,
        originalContractClassId: originalClassId,
      })
    ).withAddress(instanceAddress);

    node.getContract.mockResolvedValue(instance);
    node.getContractClass.mockResolvedValue({
      id: newClassId,
      artifactHash: Fr.random(),
      packedBytecodeCommitments: [],
      privateFunctionsRoot: Fr.random(),
      publicBytecodeCommitment: Fr.random(),
      version: 1,
      privateFunctions: [],
      utilityFunctions: [],
      publicFunctions: [],
      packedBytecode: Buffer.alloc(0),
    } as any);
  });

  it('produces overrides with bumped currentContractClassId and registry storage writes', async () => {
    const { stateOverrides, contractOverrides } = await fastForwardContractUpdate({
      instanceAddress,
      newClassId,
      node,
    });

    expect(contractOverrides).toHaveLength(1);
    expect(contractOverrides[0].address).toEqual(instanceAddress);
    expect(contractOverrides[0].currentContractClassId).toEqual(newClassId);
    expect(contractOverrides[0].originalContractClassId).toEqual(originalClassId);

    const expectedSlots = await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(instanceAddress);
    expect(stateOverrides.publicStorage).toHaveLength(DELAYED_PUBLIC_MUTABLE_VALUES_LEN + 1);
    for (const entry of stateOverrides.publicStorage!) {
      expect(entry.contract).toEqual(ProtocolContractAddress.ContractInstanceRegistry);
    }
    const baseSlot = expectedSlots.delayedPublicMutableSlot;
    expect(stateOverrides.publicStorage![0].slot).toEqual(baseSlot);
    expect(stateOverrides.publicStorage![stateOverrides.publicStorage!.length - 1].slot).toEqual(
      expectedSlots.delayedPublicMutableHashSlot,
    );
  });

  it('throws when the instance is not deployed', async () => {
    node.getContract.mockResolvedValue(undefined);
    await expect(fastForwardContractUpdate({ instanceAddress, newClassId, node })).rejects.toThrow(/not deployed/);
  });

  it('throws when the new class is not registered', async () => {
    node.getContractClass.mockResolvedValue(undefined);
    await expect(fastForwardContractUpdate({ instanceAddress, newClassId, node })).rejects.toThrow(/not registered/);
  });

  it('throws when the instance is already on the target class', async () => {
    const sameClassInstance = (
      await SerializableContractInstance.random({
        currentContractClassId: newClassId,
        originalContractClassId: originalClassId,
      })
    ).withAddress(instanceAddress);
    node.getContract.mockResolvedValue(sameClassInstance);

    await expect(fastForwardContractUpdate({ instanceAddress, newClassId, node })).rejects.toThrow(/already on class/);
  });
});
