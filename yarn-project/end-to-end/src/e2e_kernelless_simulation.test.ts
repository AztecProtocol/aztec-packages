import { DefaultAccountInterface } from '@aztec/accounts/defaults';
import {
  type AccountInterface,
  AccountWallet,
  AuthWitness,
  type ContractArtifact,
  Fr,
  type Logger,
  type PXE,
  TxExecutionRequest,
  type Wallet,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { CompleteAddress, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { SimulationOverrides, TxSimulationResult } from '@aztec/stdlib/tx';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

export class CopyCatWallet extends AccountWallet {
  constructor(
    pxe: PXE,
    account: AccountInterface,
    private originalContractClassId: Fr,
    private originalAddress: CompleteAddress,
    private artifact: ContractArtifact,
    private instance: ContractInstanceWithAddress,
  ) {
    super(pxe, account);
  }

  static async create(pxe: PXE, originalAccount: AccountWallet): Promise<CopyCatWallet> {
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
      SimulatedAccountContractArtifact,
      instance,
    );
  }

  override getCompleteAddress(): CompleteAddress {
    return this.originalAddress;
  }

  override simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    skipTxValidation?: boolean,
    skipFeeEnforcement?: boolean,
    _overrides?: SimulationOverrides,
  ): Promise<TxSimulationResult> {
    const instanceOverrides = new Map();
    const artifactOverrides = new Map();
    instanceOverrides.set(this.originalAddress.toString(), this.instance);
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
  let liquidityProvider: AccountWallet;

  let token0: TokenContract;
  let token1: TokenContract;
  let liquidityToken: TokenContract;

  let amm: AMMContract;

  let pxe: PXE;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      pxe,
      teardown,
      wallets: [adminWallet, liquidityProvider],
      logger,
    } = await setup(2));

    token0 = await deployToken(adminWallet, 0n, logger);
    token1 = await deployToken(adminWallet, 0n, logger);
    liquidityToken = await deployToken(adminWallet, 0n, logger);

    amm = await AMMContract.deploy(adminWallet, token0.address, token1.address, liquidityToken.address)
      .send()
      .deployed();

    await liquidityToken.methods.set_minter(amm.address, true).send().wait();

    // We mint the tokens to the liquidity provider
    await mintTokensToPrivate(token0, adminWallet, liquidityProvider.getAddress(), INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminWallet, liquidityProvider.getAddress(), INITIAL_TOKEN_BALANCE);
  });

  afterAll(() => teardown());

  describe('AMM', () => {
    type Balance = {
      token0: bigint;
      token1: bigint;
    };

    async function getWalletBalances(lp: Wallet): Promise<Balance> {
      return {
        token0: await token0.withWallet(lp).methods.balance_of_private(lp.getAddress()).simulate(),
        token1: await token1.withWallet(lp).methods.balance_of_private(lp.getAddress()).simulate(),
      };
    }

    it('adds liquidity without authwits', async () => {
      const copyCat = await CopyCatWallet.create(pxe, liquidityProvider);

      const lpBalancesBefore = await getWalletBalances(copyCat);

      const amount0Max = lpBalancesBefore.token0;
      const amount0Min = lpBalancesBefore.token0 / 2n;
      const amount1Max = lpBalancesBefore.token1;
      const amount1Min = lpBalancesBefore.token1 / 2n;

      const nonceForAuthwits = Fr.random();

      // This interaction requires 2 authwitnesses, one for each token so they can be transfered from the provider's
      // private balance to the AMM's public balance. Using the copycat wallet, we collect the request hashes
      // for later comparison

      const addLiquidityInteraction = amm
        .withWallet(copyCat)
        .methods.add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits);

      const { offchainMessages } = await addLiquidityInteraction.simulate({ includeMetadata: true });

      expect(offchainMessages.length).toBe(2);

      const [token0AuthwitRequest, token1AuthwitRequest] = offchainMessages;

      // We reuse the offchain message's recipient to also emit the address of the contract that requires the authwit
      expect(token0AuthwitRequest.recipient).toEqual(token0.address);
      expect(token1AuthwitRequest.recipient).toEqual(token1.address);
      // The account contract that generates the authwit request
      expect(token0AuthwitRequest.contractAddress).toEqual(liquidityProvider.getAddress());
      expect(token1AuthwitRequest.contractAddress).toEqual(liquidityProvider.getAddress());

      expect(token0AuthwitRequest.message).toHaveLength(1);
      expect(token1AuthwitRequest.message).toHaveLength(1);

      const [token0AuthwitHash] = token0AuthwitRequest.message;
      const [token1AuthwitHash] = token1AuthwitRequest.message;

      // Compute the real authwitness
      const token0Authwit = await liquidityProvider.createAuthWit({
        caller: amm.address,
        action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProvider.getAddress(),
          amm.address,
          amount0Max,
          nonceForAuthwits,
        ),
      });

      const token1Authwit = await liquidityProvider.createAuthWit({
        caller: amm.address,
        action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProvider.getAddress(),
          amm.address,
          amount1Max,
          nonceForAuthwits,
        ),
      });

      expect(token0AuthwitHash).toEqual(token0Authwit.requestHash);
      expect(token1AuthwitHash).toEqual(token1Authwit.requestHash);
    });
  });
});
