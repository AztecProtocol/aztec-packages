import { Fr } from '@aztec/foundation/curves/bn254';
import { type ContractArtifact, FunctionType } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import { PublicKeys } from '@aztec/stdlib/keys';
import { OFFCHAIN_MESSAGE_IDENTIFIER, type OffchainEffect } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { TxSimulationResultWithAppOffset } from '../wallet/tx_simulation_result_with_app_offset.js';
import type { Wallet } from '../wallet/wallet.js';
import type { ContractBase } from './contract_base.js';
import { DeployMethod } from './deploy_method.js';

describe('DeployMethod', () => {
  let wallet: MockProxy<Wallet>;

  const artifact: ContractArtifact = {
    name: 'TestContract',
    functions: [
      {
        name: 'constructor',
        isInitializer: true,
        functionType: FunctionType.PRIVATE,
        isOnlySelf: false,
        isStatic: false,
        debugSymbols: '',
        parameters: [],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfa),
        verificationKey: Buffer.alloc(4064).toString('base64'),
      },
      {
        name: 'public_dispatch',
        isInitializer: false,
        isStatic: false,
        functionType: FunctionType.PUBLIC,
        isOnlySelf: false,
        parameters: [{ name: 'selector', type: { kind: 'field' }, visibility: 'public' }],
        returnTypes: [],
        errorTypes: {},
        bytecode: Buffer.alloc(8, 0xfb),
        debugSymbols: '',
      },
    ],
    nonDispatchPublicFunctions: [],
    outputs: { structs: {}, globals: {} },
    fileMap: {},
    storageLayout: {},
  };

  beforeEach(() => {
    wallet = mock<Wallet>();
    wallet.registerContract.mockResolvedValue({} as ContractInstanceWithAddress);
    wallet.getContractClassMetadata.mockResolvedValue({ isContractClassPubliclyRegistered: true } as any);
    wallet.getContractMetadata.mockResolvedValue({ isContractPubliclyDeployed: true } as any);
  });

  it('should extract offchain messages with anchor block timestamp on simulate', async () => {
    const recipient = await AztecAddress.random();
    const contractAddress = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 42000n;

    const offchainEffects: OffchainEffect[] = [
      {
        data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), ...msgPayload],
        contractAddress,
      },
    ];

    const txSimResult = mock<TxSimulationResultWithAppOffset>();
    Object.defineProperty(txSimResult, 'offchainEffects', { value: offchainEffects });
    Object.defineProperty(txSimResult, 'publicInputs', {
      value: {
        constants: { anchorBlockHeader: { globalVariables: { timestamp: anchorBlockTimestamp } } },
      },
    });
    Object.defineProperty(txSimResult, 'stats', { value: {} });
    Object.defineProperty(txSimResult, 'gasUsed', {
      value: { totalGas: Gas.empty(), teardownGas: Gas.empty() },
    });

    wallet.simulateTx.mockResolvedValue(txSimResult);

    const deployMethod = new DeployMethod(
      PublicKeys.default(),
      wallet,
      artifact,
      (instance, w) => ({ instance, wallet: w }) as unknown as ContractBase,
      [],
    );

    const result = await deployMethod.simulate({ from: await AztecAddress.random() });

    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload: msgPayload,
      contractAddress,
      anchorBlockTimestamp,
    });
    expect(result.offchainEffects).toEqual([]);
  });
});
