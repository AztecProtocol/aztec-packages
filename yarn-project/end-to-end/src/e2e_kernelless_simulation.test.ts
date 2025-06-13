import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  type AccountInterface,
  AccountWallet,
  AuthWitness,
  AztecAddress,
  type ContractArtifact,
  Fr,
  type Logger,
  type PXE,
  TxExecutionRequest,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
  loadContractArtifact,
} from '@aztec/aztec.js';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type {
  CompleteAddress,
  ContractClass,
  ContractClassWithId,
  ContractInstance,
  ContractInstanceWithAddress,
} from '@aztec/stdlib/contract';
import type { SimulationOverrides, TxSimulationResult } from '@aztec/stdlib/tx';

import { deployToken } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const INITIAL_TOKEN_BALANCE = 100n;

export class CopyCatWallet extends AccountWallet {
  constructor(
    pxe: PXE,
    account: AccountInterface,
    private originalContractClassId: Fr,
    private originalAddress: CompleteAddress,
    private additionalAddresses: AztecAddress[],
    private artifact: ContractArtifact,
    private instance: ContractInstanceWithAddress,
  ) {
    super(pxe, account);
  }

  static async create(
    pxe: PXE,
    originalAccount: AccountWallet,
    additionalAccounts: AztecAddress[],
  ): Promise<CopyCatWallet> {
    const simulatedAuthWitnessProvider = {
      createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        return Promise.resolve(new AuthWitness(messageHash, []));
      },
    };
    const nodeInfo = await pxe.getNodeInfo();
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const { currentContractClassId: originalContractClassId } = contractInstance;
    const accountInterface = new DefaultAccountInterface(simulatedAuthWitnessProvider, originalAddress, nodeInfo);
    const { SimulatedAccountContractArtifact } = await import('@aztec/noir-contracts.js/SimulatedAccount');
    const instance = await getContractInstanceFromDeployParams(SimulatedAccountContractArtifact, {});
    return new CopyCatWallet(
      pxe,
      accountInterface,
      originalContractClassId,
      originalAddress,
      additionalAccounts,
      SimulatedAccountContractArtifact,
      instance,
    );
  }

  override getCompleteAddress(): CompleteAddress {
    return this.originalAddress;
  }

  override async simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
    _overrides?: SimulationOverrides,
  ): Promise<TxSimulationResult> {
    const instanceOverrides = new Map();
    const artifactOverrides = new Map();
    for (const address of [this.originalAddress.address, ...this.additionalAddresses]) {
      instanceOverrides.set(address.toString(), this.instance);
    }
    artifactOverrides.set(this.originalContractClassId.toString(), this.artifact);
    return this.pxe.simulateTx(txRequest, simulatePublic, skipTxValidation, skipFeeEnforcement, {
      contracts: { instances: instanceOverrides, artifacts: artifactOverrides },
    });
  }
}

describe('Kernelless simulation', () => {
  let teardown: () => Promise<void>;

  let logger: Logger;

  let adminWallet: AccountWallet;
  let recipientWallet: AccountWallet;

  let token: TokenContract;

  let pxe: PXE;

  beforeAll(async () => {
    ({
      pxe,
      teardown,
      wallets: [adminWallet, recipientWallet],
      logger,
    } = await setup(2));

    token = await deployToken(adminWallet, INITIAL_TOKEN_BALANCE, logger);
  });

  afterAll(() => teardown());
  it('transfer on behalf of other', async () => {
    const balance0 = await token.methods.balance_of_private(adminWallet.getAddress()).simulate();
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    const copyCat = await CopyCatWallet.create(pxe, recipientWallet, [adminWallet.getAddress()]);

    const { offchainMessages } = await token
      .withWallet(copyCat)
      .methods.transfer_in_private(adminWallet.getAddress(), recipientWallet.getAddress(), amount, authwitNonce)
      .simulate({ includeMetadata: true });

    expect(offchainMessages.length).toBe(1);

    const [authwitRequest] = offchainMessages;

    expect(authwitRequest.recipient).toEqual(token.address);
    expect(authwitRequest.contractAddress).toEqual(adminWallet.getAddress());

    expect(authwitRequest.message).toHaveLength(1);

    const [authwitHash] = authwitRequest.message;

    // Compute the real authwitness
    const action = token
      .withWallet(recipientWallet)
      .methods.transfer_in_private(adminWallet.getAddress(), recipientWallet.getAddress(), amount, authwitNonce);
    const witness = await adminWallet.createAuthWit({ caller: recipientWallet.getAddress(), action });

    expect(authwitHash).toEqual(witness.requestHash);
  });
});
