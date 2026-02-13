import { AztecAddress } from '@aztec/aztec.js/addresses';
import { CallAuthorizationRequest } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { type TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { PendingNoteHashesContract } from '@aztec/noir-test-contracts.js/PendingNoteHashes';
import { type AbiDecoded, decodeFromAbi, getFunctionArtifact } from '@aztec/stdlib/abi';
import { computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';

/*
 * Demonstrates the capability of simulating a transaction without executing the kernels, allowing
 * the bypass of many checks and a healthy improvement in speed. Kernelless simulations should aim
 * to be as close as possible to reality, so their output can be used to calculate gas usage
 */
describe('Kernelless simulation', () => {
  let teardown: () => Promise<void>;

  let logger: Logger;

  let wallet: TestWallet;
  let aztecNode: AztecNode;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;
  let swapperAddress: AztecAddress;

  let token0: TokenContract;
  let token1: TokenContract;
  let liquidityToken: TokenContract;

  let amm: AMMContract;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      aztecNode,
      teardown,
      wallet,
      accounts: [adminAddress, liquidityProviderAddress, swapperAddress],
      logger,
    } = await setup(3));

    ({ contract: token0 } = await deployToken(wallet, adminAddress, 0n, logger));
    ({ contract: token1 } = await deployToken(wallet, adminAddress, 0n, logger));
    ({ contract: liquidityToken } = await deployToken(wallet, adminAddress, 0n, logger));

    amm = await AMMContract.deploy(wallet, token0.address, token1.address, liquidityToken.address).send({
      from: adminAddress,
    });

    await liquidityToken.methods.set_minter(amm.address, true).send({ from: adminAddress });

    // We mint the tokens to the liquidity provider
    await mintTokensToPrivate(token0, adminAddress, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminAddress, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);

    // Note that the swapper only holds token0, not token1
    await mintTokensToPrivate(token0, adminAddress, swapperAddress, INITIAL_TOKEN_BALANCE);
  });

  afterAll(() => teardown());

  describe('Authwits and gas', () => {
    type Balance = {
      token0: bigint;
      token1: bigint;
    };

    async function getWalletBalances(lpAddress: AztecAddress): Promise<Balance> {
      return {
        token0: await token0.methods.balance_of_private(lpAddress).simulate({ from: lpAddress }),
        token1: await token1.methods.balance_of_private(lpAddress).simulate({ from: lpAddress }),
      };
    }

    async function getAmmBalances(): Promise<Balance> {
      return {
        token0: await token0.methods.balance_of_public(amm.address).simulate({ from: adminAddress }),
        token1: await token1.methods.balance_of_public(amm.address).simulate({ from: adminAddress }),
      };
    }

    it('adds liquidity without authwits', async () => {
      const lpBalancesBefore = await getWalletBalances(liquidityProviderAddress);

      const amount0Max = lpBalancesBefore.token0;
      const amount0Min = lpBalancesBefore.token0 / 2n;
      const amount1Max = lpBalancesBefore.token1;
      const amount1Min = lpBalancesBefore.token1 / 2n;

      const nonceForAuthwits = Fr.random();

      // This interaction requires 2 authwitnesses, one for each token so they can be transferred from the provider's
      // private balance to the AMM's public balance. Using the stub account, we collect the request hashes
      // for later comparison
      const addLiquidityInteraction = amm.methods.add_liquidity(
        amount0Max,
        amount1Max,
        amount0Min,
        amount1Min,
        nonceForAuthwits,
      );

      wallet.enableSimulatedSimulations();

      const { offchainEffects } = await addLiquidityInteraction.simulate({
        from: liquidityProviderAddress,
        includeMetadata: true,
      });

      expect(offchainEffects.length).toBe(2);

      const [token0AuthwitRequest, token1AuthwitRequest] = offchainEffects;

      // The contract that generates the authwit request
      expect(token0AuthwitRequest.contractAddress).toEqual(token0.address);
      expect(token1AuthwitRequest.contractAddress).toEqual(token1.address);

      // Authwit selector + inner_hash + msg_sender + function_selector + args_hash + args (4)
      expect(token0AuthwitRequest.data).toHaveLength(9);
      expect(token1AuthwitRequest.data).toHaveLength(9);

      const token0CallAuthorizationRequest = await CallAuthorizationRequest.fromFields(token0AuthwitRequest.data);
      const token1CallAuthorizationRequest = await CallAuthorizationRequest.fromFields(token1AuthwitRequest.data);

      expect(token0CallAuthorizationRequest.selector).toEqual(token1CallAuthorizationRequest.selector);

      const functionAbi = await getFunctionArtifact(
        TokenContractArtifact,
        token0CallAuthorizationRequest.functionSelector,
      );
      const token0CallArgs = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        token0CallAuthorizationRequest.args,
      ) as AbiDecoded[];

      expect(token0CallArgs).toHaveLength(4);
      expect(token0CallArgs[0]).toEqual(liquidityProviderAddress);
      expect(token0CallArgs[1]).toEqual(amm.address);
      expect(token0CallArgs[2]).toEqual(amount0Max);
      expect(token0CallArgs[3]).toEqual(nonceForAuthwits.toBigInt());

      const token1CallArgs = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        token1CallAuthorizationRequest.args,
      ) as AbiDecoded[];

      expect(token1CallArgs).toHaveLength(4);
      expect(token1CallArgs[0]).toEqual(liquidityProviderAddress);
      expect(token1CallArgs[1]).toEqual(amm.address);
      expect(token1CallArgs[2]).toEqual(amount1Max);
      expect(token1CallArgs[3]).toEqual(nonceForAuthwits.toBigInt());

      // Compute the real authwitness
      const token0Authwit = await wallet.createAuthWit(liquidityProviderAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProviderAddress,
          amm.address,
          amount0Max,
          nonceForAuthwits,
        ),
      });

      const token1Authwit = await wallet.createAuthWit(liquidityProviderAddress, {
        caller: amm.address,
        action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProviderAddress,
          amm.address,
          amount1Max,
          nonceForAuthwits,
        ),
      });

      const { l1ChainId: chainId, rollupVersion: version } = await aztecNode.getNodeInfo();

      const token0AuthwitHash = await computeOuterAuthWitHash(
        token0.address,
        new Fr(chainId),
        new Fr(version),
        token0CallAuthorizationRequest.innerHash,
      );

      const token1AuthwitHash = await computeOuterAuthWitHash(
        token1.address,
        new Fr(chainId),
        new Fr(version),
        token1CallAuthorizationRequest.innerHash,
      );

      expect(token0AuthwitHash).toEqual(token0Authwit.requestHash);
      expect(token1AuthwitHash).toEqual(token1Authwit.requestHash);

      const token0AuthwitFromOffchainEffect = await wallet.createAuthWit(liquidityProviderAddress, {
        consumer: token0.address,
        innerHash: token0CallAuthorizationRequest.innerHash,
      });

      const token1AuthwitFromOffchainEffect = await wallet.createAuthWit(liquidityProviderAddress, {
        consumer: token1.address,
        innerHash: token1CallAuthorizationRequest.innerHash,
      });

      await expect(
        addLiquidityInteraction.send({
          from: liquidityProviderAddress,
          authWitnesses: [token0AuthwitFromOffchainEffect, token1AuthwitFromOffchainEffect],
        }),
      ).resolves.toBeDefined();
    });

    it('produces matching gas estimates between kernelless and with-kernels simulation', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      const amountIn = swapperBalancesBefore.token0 / 10n;

      const nonceForAuthwits = Fr.random();

      const amountOutMin = await amm.methods
        .get_amount_out_for_exact_in(ammBalancesBefore.token0, ammBalancesBefore.token1, amountIn)
        .simulate({ from: swapperAddress });

      const swapExactTokensInteraction = amm.methods.swap_exact_tokens_for_tokens(
        token0.address,
        token1.address,
        amountIn,
        amountOutMin,
        nonceForAuthwits,
      );

      wallet.enableSimulatedSimulations();
      const { estimatedGas: swapKernellessGas } = await swapExactTokensInteraction.simulate({
        from: swapperAddress,
        includeMetadata: true,
      });

      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public(swapperAddress, amm.address, amountIn, nonceForAuthwits),
      });

      wallet.disableSimulatedSimulations();
      const { estimatedGas: swapWithKernelsGas } = await swapExactTokensInteraction.simulate({
        from: swapperAddress,
        includeMetadata: true,
        authWitnesses: [swapAuthwit],
      });

      logger.info(`Kernelless gas: L2=${swapKernellessGas.gasLimits.l2Gas} DA=${swapKernellessGas.gasLimits.daGas}`);
      logger.info(
        `With kernels gas: L2=${swapWithKernelsGas.gasLimits.l2Gas} DA=${swapWithKernelsGas.gasLimits.daGas}`,
      );

      expect(swapKernellessGas.gasLimits.daGas).toEqual(swapWithKernelsGas.gasLimits.daGas);
      expect(swapKernellessGas.gasLimits.l2Gas).toEqual(swapWithKernelsGas.gasLimits.l2Gas);
    });
  });

  describe('Note squashing', () => {
    let pendingNoteHashesContract: PendingNoteHashesContract;

    beforeAll(async () => {
      pendingNoteHashesContract = await PendingNoteHashesContract.deploy(wallet).send({ from: adminAddress });
    });

    it('squashing produces same gas estimates as with-kernels path', async () => {
      const mintAmount = 42n;

      const interaction = pendingNoteHashesContract.methods.test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        adminAddress,
        adminAddress,
        await pendingNoteHashesContract.methods.insert_note.selector(),
        await pendingNoteHashesContract.methods.get_then_nullify_note.selector(),
      );

      wallet.enableSimulatedSimulations();
      const { estimatedGas: kernellessGas } = await interaction.simulate({
        from: adminAddress,
        includeMetadata: true,
      });

      wallet.disableSimulatedSimulations();
      const { estimatedGas: withKernelsGas } = await interaction.simulate({
        from: adminAddress,
        includeMetadata: true,
      });

      logger.info(`Kernelless gas: L2=${kernellessGas.gasLimits.l2Gas} DA=${kernellessGas.gasLimits.daGas}`);
      logger.info(`With kernels gas: L2=${withKernelsGas.gasLimits.l2Gas} DA=${withKernelsGas.gasLimits.daGas}`);

      expect(kernellessGas.gasLimits.daGas).toEqual(withKernelsGas.gasLimits.daGas);
      expect(kernellessGas.gasLimits.l2Gas).toEqual(withKernelsGas.gasLimits.l2Gas);
    });
  });

  describe('read request verification', () => {
    let pendingNoteHashesContract: PendingNoteHashesContract;

    beforeAll(async () => {
      pendingNoteHashesContract = await PendingNoteHashesContract.deploy(wallet).send({ from: adminAddress });
    });

    it('verifies settled read requests against the note hash tree', async () => {
      const mintAmount = 100n;

      // Insert a note with real kernels so it lands on-chain
      wallet.disableSimulatedSimulations();
      await pendingNoteHashesContract.methods.insert_note(mintAmount, adminAddress, adminAddress).send({
        from: adminAddress,
      });

      // Kernelless simulation of reading + nullifying that settled note produces a settled
      // read request that gets verified against the note hash tree at the anchor block
      wallet.enableSimulatedSimulations();
      await expect(
        pendingNoteHashesContract.methods.get_then_nullify_note(mintAmount, adminAddress).simulate({
          from: adminAddress,
        }),
      ).resolves.toBeDefined();
    });
  });
});
