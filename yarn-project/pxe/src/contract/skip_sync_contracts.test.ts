import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { STANDARD_AUTH_REGISTRY_ADDRESS } from '@aztec/standard-contracts/auth-registry/constants';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import { STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS } from '@aztec/standard-contracts/multi-call-entrypoint/constants';
import { STANDARD_PUBLIC_CHECKS_ADDRESS } from '@aztec/standard-contracts/public-checks/constants';
import type { FunctionCall } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { ContractStore } from '../storage/contract_store/contract_store.js';
import type { ContractClassService } from './contract_class_service.js';
import { syncScope } from './helpers.js';
import { isSkipSyncContract } from './skip_sync_contracts.js';

describe('isSkipSyncContract', () => {
  it('skips the protocol contracts, the auth registry, the multicall entrypoint and the public checks', () => {
    const skipped = [
      ...Object.values(ProtocolContractAddress),
      STANDARD_AUTH_REGISTRY_ADDRESS,
      STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
      STANDARD_PUBLIC_CHECKS_ADDRESS,
    ];
    for (const address of skipped) {
      expect(isSkipSyncContract(address)).toBe(true);
    }
  });

  it('does not skip contracts that hold private state', async () => {
    // The handshake registry declares a note, so its private state must still be synced.
    expect(isSkipSyncContract(STANDARD_HANDSHAKE_REGISTRY_ADDRESS)).toBe(false);
    expect(isSkipSyncContract(await AztecAddress.random())).toBe(false);
  });
});

describe('syncScope', () => {
  let contractStore: MockProxy<ContractStore>;
  let contractClassService: MockProxy<ContractClassService>;
  let utilityExecutor: jest.Mock<(call: FunctionCall, scopes: AztecAddress[]) => Promise<any>>;

  beforeEach(() => {
    contractStore = mock<ContractStore>();
    contractClassService = mock<ContractClassService>();
    utilityExecutor = jest.fn<(call: FunctionCall, scopes: AztecAddress[]) => Promise<any>>();
  });

  it('does not run sync_state for a skipped contract', async () => {
    await syncScope(
      STANDARD_MULTI_CALL_ENTRYPOINT_ADDRESS,
      contractStore,
      contractClassService,
      mock<BlockHeader>(),
      null,
      utilityExecutor,
      await AztecAddress.random(),
    );

    expect(contractClassService.getCurrentClassId).not.toHaveBeenCalled();
    expect(utilityExecutor).not.toHaveBeenCalled();
  });
});
