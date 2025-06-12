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
    private completeAddress: CompleteAddress,
    private contractClass: ContractClassWithId,
    private instance: ContractInstanceWithAddress,
  ) {
    super(pxe, account);
  }

  static async from(pxe: PXE, account: AccountWallet): Promise<CopyCatWallet> {
    const simulatedAuthWitnessProvider = {
      createAuthWit(messageHash: Fr): Promise<AuthWitness> {
        return Promise.resolve(new AuthWitness(messageHash, []));
      },
    };
    const nodeInfo = await pxe.getNodeInfo();
    const accountInterface = new DefaultAccountInterface(
      simulatedAuthWitnessProvider,
      account.getCompleteAddress(),
      nodeInfo,
    );
    const { SimulatedAccountContractArtifact } = await import('@aztec/noir-contracts.js/SimulatedAccount');
    const contractClass = await getContractClassFromArtifact(SimulatedAccountContractArtifact);
    const instance = await getContractInstanceFromDeployParams(SimulatedAccountContractArtifact, {});
    return new CopyCatWallet(pxe, accountInterface, account.getCompleteAddress(), contractClass, instance);
  }

  override getCompleteAddress(): CompleteAddress {
    return this.completeAddress;
  }

  override async simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
    _overrides?: SimulationOverrides,
  ): Promise<TxSimulationResult> {
    const contractOverrides = new Map();
    contractOverrides.set(this.completeAddress.address.toString(), {
      instance: this.instance,
      contractClass: this.contractClass,
    });
    return this.pxe.simulateTx(txRequest, simulatePublic, skipTxValidation, skipFeeEnforcement, {
      contracts: contractOverrides,
      msgSender: this.completeAddress.address,
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

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = token
      .withWallet(recipientWallet)
      .methods.transfer_in_private(adminWallet.getAddress(), recipientWallet.getAddress(), amount, authwitNonce);

    const witness = await adminWallet.createAuthWit({ caller: recipientWallet.getAddress(), action });

    const copyCat = await CopyCatWallet.from(pxe, recipientWallet);
    const { offchainMessages } = await token
      .withWallet(copyCat)
      .methods.transfer_in_private(adminWallet.getAddress(), recipientWallet.getAddress(), amount, authwitNonce)
      .simulate({ includeMetadata: true });

    expect(offchainMessages.length).toBe(1);

    const [authwitRequest] = offchainMessages;
    expect(authwitRequest.recipient).toBe(recipientWallet.getAddress());
    expect(authwitRequest.contractAddress).toBe(token.address);

    expect(authwitRequest.message).toHaveLength(1);

    const [authwitHash] = authwitRequest.message;
    expect(authwitHash).toBe(witness.requestHash);
  });
});
