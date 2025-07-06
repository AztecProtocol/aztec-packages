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
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';
import { computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';
import type { CompleteAddress, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { SimulationOverrides, TxSimulationResult } from '@aztec/stdlib/tx';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

/*
 * An AccountWallet that copies the address of another account, and then
 * uses the simulation overrides feature to execute different contract code under
 * the copied address. This is used to bypass authwit verification entirely
 * (`is_valid` always returns `true`). It also emits the required authwit hashes as offchain effects
 * so they can later be compared to the ones that would actually be verified by the real
 * account contract.
 */
export class CopyCatWallet extends AccountWallet {
  constructor(
    pxe: PXE,
    account: AccountInterface,
    private originalAddress: CompleteAddress,
    private originalContractClassId: Fr,
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
    const instance = await getContractInstanceFromInstantiationParams(SimulatedAccountContractArtifact, {});
    return new CopyCatWallet(
      pxe,
      accountInterface,
      originalAddress,
      originalContractClassId,
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
    const contractOverrides = {
      [this.originalAddress.address.toString()]: { instance: this.instance, artifact: this.artifact },
    };
    return this.pxe.simulateTx(txRequest, simulatePublic, skipTxValidation, skipFeeEnforcement, {
      contracts: contractOverrides,
    });
  }
}

/*
 * Demonstrates the capability of simulating a transaction without executing the kernels, allowing
 * the bypass of many checks and a healthy improvement in speed. Kernelless simulations should aim
 * to be as close as possible to reality, so their output can be used to calculate gas usage
 */
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

      const { offchainEffects } = await addLiquidityInteraction.simulate({ includeMetadata: true });

      expect(offchainEffects.length).toBe(2);

      const [token0AuthwitRequest, token1AuthwitRequest] = offchainEffects;

      // The contract that generates the authwit request
      expect(token0AuthwitRequest.contractAddress).toEqual(token0.address);
      expect(token1AuthwitRequest.contractAddress).toEqual(token1.address);

      expect(token0AuthwitRequest.data).toHaveLength(2);
      expect(token1AuthwitRequest.data).toHaveLength(2);

      const [_selector0, token0AuthwitInnerHash] = token0AuthwitRequest.data;
      const [_selector1, token1AuthwitInnerHash] = token1AuthwitRequest.data;

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

      const { l1ChainId: chainId, rollupVersion: version } = await pxe.getNodeInfo();

      const token0AuthwitHash = await computeOuterAuthWitHash(
        token0.address,
        new Fr(chainId),
        new Fr(version),
        token0AuthwitInnerHash,
      );

      const token1AuthwitHash = await computeOuterAuthWitHash(
        token1.address,
        new Fr(chainId),
        new Fr(version),
        token1AuthwitInnerHash,
      );

      expect(token0AuthwitHash).toEqual(token0Authwit.requestHash);
      expect(token1AuthwitHash).toEqual(token1Authwit.requestHash);
    });
  });
});
