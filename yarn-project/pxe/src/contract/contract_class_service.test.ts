import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, blockParameterHash } from '@aztec/stdlib/block';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import { ContractClassService } from './contract_class_service.js';

describe('ContractClassService', () => {
  let node: ReturnType<typeof mock<AztecNode>>;
  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let service: ContractClassService;

  const address = AztecAddress.fromBigIntUnsafe(0x1234n);
  const originalClassId = new Fr(0xaaaan);

  /** A header that anchors queries on `hash` at height `number`, as the node receives them. */
  const anchorWithHash = (hash: BlockHash, number: BlockNumber = BlockNumber(1)): BlockHeader => {
    const header = mock<BlockHeader>();
    header.hash.mockResolvedValue(hash);
    header.toBlockParameter.mockResolvedValue({ number, hash });
    return header;
  };

  beforeEach(() => {
    node = mock<AztecNode>();
    contractStore = mock<ContractStore>();
    contractStore.getContractInstance.mockResolvedValue({
      address,
      originalContractClassId: originalClassId,
    } as ContractInstanceWithAddress);
    service = new ContractClassService(node, contractStore);
  });

  it('resolves the node-reported current class at the anchor block', async () => {
    const hash = new BlockHash(new Fr(1n));
    const currentClassId = new Fr(0xbbbbn);
    node.getContract.mockResolvedValue({ currentContractClassId: currentClassId } as ContractInstanceWithAddress);

    expect(await service.getCurrentClassId(address, anchorWithHash(hash))).toEqual(currentClassId);
    expect(node.getContract).toHaveBeenCalledWith(address, { number: BlockNumber(1), hash });
  });

  it('resolves the node-reported current class even when no local instance is registered', async () => {
    const currentClassId = new Fr(0xbbbbn);
    contractStore.getContractInstance.mockResolvedValue(undefined);
    node.getContract.mockResolvedValue({ currentContractClassId: currentClassId } as ContractInstanceWithAddress);

    expect(await service.getCurrentClassId(address, anchorWithHash(new BlockHash(new Fr(1n))))).toEqual(currentClassId);
    expect(contractStore.getContractInstance).not.toHaveBeenCalled();
  });

  it('returns different classes for different anchors and does not bleed across them', async () => {
    const hashA = new BlockHash(new Fr(1n));
    const hashB = new BlockHash(new Fr(2n));
    const classAtA = new Fr(0xa1n);
    const classAtB = new Fr(0xb2n);
    node.getContract.mockImplementation((_addr, refBlock) =>
      Promise.resolve({
        currentContractClassId: blockParameterHash(refBlock!)?.equals(hashA) ? classAtA : classAtB,
      } as ContractInstanceWithAddress),
    );

    expect(await service.getCurrentClassId(address, anchorWithHash(hashA))).toEqual(classAtA);
    expect(await service.getCurrentClassId(address, anchorWithHash(hashB))).toEqual(classAtB);
  });

  it('falls back to the original class when the node does not know the instance', async () => {
    node.getContract.mockResolvedValue(undefined);

    expect(await service.getCurrentClassId(address, anchorWithHash(new BlockHash(new Fr(1n))))).toEqual(
      originalClassId,
    );
  });

  it('short-circuits protocol contracts to their original class without querying the node', async () => {
    const protocolAddress = ProtocolContractAddress.ContractInstanceRegistry;
    const protocolClassId = new Fr(0xccccn);
    contractStore.getContractInstance.mockResolvedValue({
      address: protocolAddress,
      originalContractClassId: protocolClassId,
    } as ContractInstanceWithAddress);

    expect(await service.getCurrentClassId(protocolAddress, anchorWithHash(new BlockHash(new Fr(1n))))).toEqual(
      protocolClassId,
    );
    expect(node.getContract).not.toHaveBeenCalled();
  });

  it('returns undefined when neither the node nor the store knows the instance', async () => {
    contractStore.getContractInstance.mockResolvedValue(undefined);
    node.getContract.mockResolvedValue(undefined);

    expect(await service.getCurrentClassId(address, anchorWithHash(new BlockHash(new Fr(1n))))).toBeUndefined();
  });
});
