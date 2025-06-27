import { CopyCatAccountWallet } from '@aztec/accounts/copy-cat';
import { type AccountWallet, CallAuthwitWithPreimage, Fr, type Logger, type PXE, type Wallet } from '@aztec/aztec.js';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { type TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { type AbiDecoded, decodeFromAbi, getFunctionArtifact } from '@aztec/stdlib/abi';
import { computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

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
      const copyCat = await CopyCatAccountWallet.create(pxe, liquidityProvider);

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

      // Authwit selector + inner_hash + msg_sender + function_selector + args_hash + args (4)
      expect(token0AuthwitRequest.data).toHaveLength(9);
      expect(token1AuthwitRequest.data).toHaveLength(9);

      const token0AuthwitPreimage = await CallAuthwitWithPreimage.fromFields(token0AuthwitRequest.data);
      const token1AuthwitPreimage = await CallAuthwitWithPreimage.fromFields(token0AuthwitRequest.data);

      expect(token0AuthwitPreimage.selector).toEqual(token1AuthwitPreimage.selector);

      const functionAbi = await getFunctionArtifact(TokenContractArtifact, token0AuthwitPreimage.functionSelector);
      const token0CallArgs = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        token0AuthwitPreimage.args,
      ) as AbiDecoded[];

      expect(token0CallArgs).toHaveLength(4);
      expect(token0CallArgs[0]).toEqual(liquidityProvider.getAddress());
      expect(token0CallArgs[1]).toEqual(amm.address);
      expect(token0CallArgs[2]).toEqual(amount0Max);
      expect(token0CallArgs[3]).toEqual(nonceForAuthwits.toBigInt());

      const token1CallArgs = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        token0AuthwitPreimage.args,
      ) as AbiDecoded[];

      expect(token1CallArgs).toHaveLength(4);
      expect(token1CallArgs[0]).toEqual(liquidityProvider.getAddress());
      expect(token1CallArgs[1]).toEqual(amm.address);
      expect(token1CallArgs[2]).toEqual(amount1Max);
      expect(token1CallArgs[3]).toEqual(nonceForAuthwits.toBigInt());

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
        token0AuthwitPreimage.innerHash,
      );

      const token1AuthwitHash = await computeOuterAuthWitHash(
        token1.address,
        new Fr(chainId),
        new Fr(version),
        token1AuthwitPreimage.innerHash,
      );

      expect(token0AuthwitHash).toEqual(token0Authwit.requestHash);
      expect(token1AuthwitHash).toEqual(token1Authwit.requestHash);
    });
  });
});
