import { EcdsaKAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { CallAuthorizationRequest } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Fq } from '@aztec/foundation/curves/bn254';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { type TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AuthWitTestContract, AuthWitTestContractArtifact } from '@aztec/noir-test-contracts.js/AuthWitTest';
import { GenericProxyContract } from '@aztec/noir-test-contracts.js/GenericProxy';
import { PendingNoteHashesContract } from '@aztec/noir-test-contracts.js/PendingNoteHashes';
import { type AbiDecoded, decodeFromAbi, getFunctionArtifact } from '@aztec/stdlib/abi';
import { computeOuterAuthWitHash } from '@aztec/stdlib/auth-witness';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';

import { simulateThroughAuthwitProxy } from '../../fixtures/authwit_proxy.js';
import { deployToken } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';
import { deployAmmWithTokens } from '../token/token_test_helpers.js';

/*
 * Demonstrates the capability of simulating a transaction without executing the kernels, allowing
 * the bypass of many checks and a healthy improvement in speed. Kernelless simulations should aim
 * to be as close as possible to reality, so their output can be used to calculate gas usage
 *
 * Uses a single automine node with three funded accounts (admin, liquidityProvider, swapper),
 * an AMM with two token pairs, and various test contracts deployed in beforeAll.
 */
describe('automine/simulation/kernelless_simulation', () => {
  let teardown: () => Promise<void>;

  let logger: Logger;

  let wallet: TestWallet;
  let aztecNode: AztecNode;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;
  let swapperAddress: AztecAddress;

  let token0: TokenContract;
  let token1: TokenContract;

  let amm: AMMContract;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      aztecNode,
      teardown,
      wallet,
      accounts: [adminAddress, liquidityProviderAddress, swapperAddress],
      logger,
    } = (await AutomineTestContext.setup({ numberOfAccounts: 3 })).context);

    ({ token0, token1, amm } = await deployAmmWithTokens(wallet, adminAddress, deployToken, {
      liquidityProviders: [liquidityProviderAddress],
      swapper: swapperAddress,
      initialBalance: INITIAL_TOKEN_BALANCE,
      logger,
    }));
  });

  afterAll(() => teardown());

  // Covers authwit-request discovery via kernelless simulation, gas estimation comparison between
  // kernelless and with-kernels paths, and fee payer identity propagation.
  describe('Authwits and gas', () => {
    type Balance = {
      token0: bigint;
      token1: bigint;
    };

    async function getWalletBalances(lpAddress: AztecAddress): Promise<Balance> {
      return {
        token0: (await token0.methods.balance_of_private(lpAddress).simulate({ from: lpAddress })).result,
        token1: (await token1.methods.balance_of_private(lpAddress).simulate({ from: lpAddress })).result,
      };
    }

    async function getAmmBalances(): Promise<Balance> {
      return {
        token0: (await token0.methods.balance_of_public(amm.address).simulate({ from: adminAddress })).result,
        token1: (await token1.methods.balance_of_public(amm.address).simulate({ from: adminAddress })).result,
      };
    }

    // Simulates add_liquidity in kernelless-override mode, captures the two offchain authwit
    // requests, derives and verifies authwit hashes, then sends the real tx with authwitnesses
    // created from the offchain effect inner hashes.
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

      wallet.setSimulationMode('kernelless-override');

      const { offchainEffects } = await addLiquidityInteraction.simulate({
        from: liquidityProviderAddress,
        includeMetadata: true,
      });

      expect(offchainEffects.length).toBe(2);

      const [token0AuthwitRequest, token1AuthwitRequest] = offchainEffects;

      // The contract that generates the authwit request
      expect(token0AuthwitRequest.contractAddress).toEqual(token0.address);
      expect(token1AuthwitRequest.contractAddress).toEqual(token1.address);

      // Authwit selector + inner_hash + on_behalf_of + msg_sender + function_selector + args_hash + args (4)
      expect(token0AuthwitRequest.data).toHaveLength(10);
      expect(token1AuthwitRequest.data).toHaveLength(10);

      const token0CallAuthorizationRequest = await CallAuthorizationRequest.fromFields(token0AuthwitRequest.data);
      const token1CallAuthorizationRequest = await CallAuthorizationRequest.fromFields(token1AuthwitRequest.data);

      expect(token0CallAuthorizationRequest.selector).toEqual(token1CallAuthorizationRequest.selector);
      expect(token0CallAuthorizationRequest.onBehalfOf).toEqual(liquidityProviderAddress);
      expect(token1CallAuthorizationRequest.onBehalfOf).toEqual(liquidityProviderAddress);
      expect(token0CallAuthorizationRequest.msgSender).toEqual(amm.address);
      expect(token1CallAuthorizationRequest.msgSender).toEqual(amm.address);

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

    // Simulates a swap in both kernelless-override and full modes and asserts L2Gas and DA gas
    // estimates match. Also verifies feePayer is identical between the two paths.
    it('produces matching gas estimates and fee payer between kernelless and with-kernels simulation', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      const amountIn = swapperBalancesBefore.token0 / 10n;

      const nonceForAuthwits = Fr.random();

      const { result: amountOutMin } = await amm.methods
        .get_amount_out_for_exact_in(ammBalancesBefore.token0, ammBalancesBefore.token1, amountIn)
        .simulate({ from: swapperAddress });

      const swapExactTokensInteraction = amm.methods.swap_exact_tokens_for_tokens(
        token0.address,
        token1.address,
        amountIn,
        amountOutMin,
        nonceForAuthwits,
      );

      const simulateTxSpy = jest.spyOn(wallet, 'simulateTx');

      wallet.setSimulationMode('kernelless-override');
      const kernellessResult = await swapExactTokensInteraction.simulate({
        from: swapperAddress,
        includeMetadata: true,
      });
      const swapKernellessGas = kernellessResult.gasUsed!;

      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public(swapperAddress, amm.address, amountIn, nonceForAuthwits),
      });

      wallet.setSimulationMode('full');
      const withKernelsResult = await swapExactTokensInteraction.simulate({
        from: swapperAddress,
        includeMetadata: true,
        authWitnesses: [swapAuthwit],
      });
      const swapWithKernelsGas = withKernelsResult.gasUsed!;

      logger.info(`Kernelless gas: L2=${swapKernellessGas.totalGas.l2Gas} DA=${swapKernellessGas.totalGas.daGas}`);
      logger.info(`With kernels gas: L2=${swapWithKernelsGas.totalGas.l2Gas} DA=${swapWithKernelsGas.totalGas.daGas}`);

      expect(swapKernellessGas.totalGas.daGas).toEqual(swapWithKernelsGas.totalGas.daGas);
      expect(swapKernellessGas.totalGas.l2Gas).toEqual(swapWithKernelsGas.totalGas.l2Gas);

      expect(simulateTxSpy).toHaveBeenCalledTimes(2);
      const kernellessTxResult = await (simulateTxSpy.mock.results[0].value as ReturnType<typeof wallet.simulateTx>);
      const withKernelsTxResult = await (simulateTxSpy.mock.results[1].value as ReturnType<typeof wallet.simulateTx>);
      const kernellessFeePayer = kernellessTxResult.publicInputs.feePayer;
      const withKernelsFeePayer = withKernelsTxResult.publicInputs.feePayer;
      expect(kernellessFeePayer).toEqual(withKernelsFeePayer);
      expect(kernellessFeePayer).toEqual(swapperAddress);

      simulateTxSpy.mockRestore();
    });
  });

  // Verifies that kernelless simulation correctly models note squashing (transient create+nullify
  // patterns) and produces the same gas estimates as the full-kernels path.
  describe('Note squashing', () => {
    let pendingNoteHashesContract: PendingNoteHashesContract;

    beforeAll(async () => {
      ({ contract: pendingNoteHashesContract } = await PendingNoteHashesContract.deploy(wallet).send({
        from: adminAddress,
      }));
    });

    // Simulates test_insert_then_get_then_nullify_all_in_nested_calls in both modes; checks that
    // L2Gas and DA gas estimates are identical between kernelless and full paths.
    it('squashing produces same gas estimates as with-kernels path', async () => {
      const mintAmount = 42n;

      const interaction = pendingNoteHashesContract.methods.test_insert_then_get_then_nullify_all_in_nested_calls(
        mintAmount,
        adminAddress,
        adminAddress,
        await pendingNoteHashesContract.methods.insert_note.selector(),
        await pendingNoteHashesContract.methods.get_then_nullify_note.selector(),
      );

      wallet.setSimulationMode('kernelless-override');
      const kernellessGas = (
        await interaction.simulate({
          from: adminAddress,
          includeMetadata: true,
        })
      ).gasUsed!;

      wallet.setSimulationMode('full');
      const withKernelsGas = (
        await interaction.simulate({
          from: adminAddress,
          includeMetadata: true,
        })
      ).gasUsed!;

      logger.info(`Kernelless gas: L2=${kernellessGas.totalGas.l2Gas} DA=${kernellessGas.totalGas.daGas}`);
      logger.info(`With kernels gas: L2=${withKernelsGas.totalGas.l2Gas} DA=${withKernelsGas.totalGas.daGas}`);

      expect(kernellessGas.totalGas.daGas).toEqual(withKernelsGas.totalGas.daGas);
      expect(kernellessGas.totalGas.l2Gas).toEqual(withKernelsGas.totalGas.l2Gas);
    });
  });

  // Verifies that the #[authorize_once] macro correctly serializes struct parameters into the
  // offchain CallAuthorizationRequest, including field count and decoded argument values.
  describe('authorize_once with multi-field struct parameters', () => {
    let authWitTestContract: AuthWitTestContract;
    let proxy: GenericProxyContract;

    beforeAll(async () => {
      [{ contract: authWitTestContract }, { contract: proxy }] = await Promise.all([
        AuthWitTestContract.deploy(wallet).send({ from: adminAddress }),
        GenericProxyContract.deploy(wallet).send({ from: adminAddress }),
      ]);
    });

    // Simulates auth_with_struct via a proxy in kernelless mode; asserts that the emitted
    // offchain effect has 6 serialized fields and decodes to the correct 4-parameter call args.
    it('emits offchain effect with correct serialized args length for struct parameters', async () => {
      const structData = { a: Fr.random(), b: Fr.random(), c: Fr.random() };
      const amount = Fr.random();
      const nonce = Fr.random();

      // This function uses a struct with 3 fields as parameter, and the #[authorize_once] macro should correctly
      // account for this and emit a CallAuthorizationRequest with the correct serialized length, rather than
      // just the arguments length
      const interaction = authWitTestContract.methods.auth_with_struct(adminAddress, structData, amount, nonce);

      wallet.setSimulationMode('kernelless-override');
      const { offchainEffects } = await simulateThroughAuthwitProxy(proxy, interaction, {
        from: adminAddress,
        includeMetadata: true,
      });

      expect(offchainEffects.length).toBe(1);

      const callAuthRequest = await CallAuthorizationRequest.fromFields(offchainEffects[0].data);

      expect(offchainEffects[0].contractAddress).toEqual(authWitTestContract.address);

      // The macro should emit 6 arguments in total before decoding: from (1) + struct (3) + amount (1) + nonce (1)
      expect(callAuthRequest.args).toHaveLength(6);

      expect(callAuthRequest.onBehalfOf).toEqual(adminAddress);
      expect(callAuthRequest.msgSender).toEqual(proxy.address);

      const functionAbi = await getFunctionArtifact(AuthWitTestContractArtifact, callAuthRequest.functionSelector);
      const decodedArgs = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        callAuthRequest.args,
      ) as AbiDecoded[];

      expect(decodedArgs).toHaveLength(4);
      expect(decodedArgs[0]).toEqual(adminAddress);
      expect(decodedArgs[1]).toEqual({
        a: structData.a.toBigInt(),
        b: structData.b.toBigInt(),
        c: structData.c.toBigInt(),
      });
      expect(decodedArgs[2]).toEqual(amount.toBigInt());
      expect(decodedArgs[3]).toEqual(nonce.toBigInt());
    });
  });

  // Verifies that kernelless simulation resolves settled note-hash read requests against the
  // on-chain note hash tree via findLeavesIndexes.
  describe('read request verification', () => {
    let pendingNoteHashesContract: PendingNoteHashesContract;

    beforeAll(async () => {
      ({ contract: pendingNoteHashesContract } = await PendingNoteHashesContract.deploy(wallet).send({
        from: adminAddress,
      }));
    });

    // Inserts a note with full kernels, then simulates get_then_nullify_note in kernelless mode
    // and checks that findLeavesIndexes was called to look up the settled note hash.
    it('verifies settled read requests against the note hash tree', async () => {
      const mintAmount = 100n;

      // Insert a note with real kernels so it lands on-chain
      wallet.setSimulationMode('full');
      await pendingNoteHashesContract.methods.insert_note(mintAmount, adminAddress, adminAddress).send({
        from: adminAddress,
      });

      // Spy on the node API that generateSimulatedProvingResult uses to verify settled read requests
      const findLeavesIndexesSpy = jest.spyOn(aztecNode, 'findLeavesIndexes');

      wallet.setSimulationMode('kernelless-override');
      await expect(
        pendingNoteHashesContract.methods.get_then_nullify_note(mintAmount, adminAddress).simulate({
          from: adminAddress,
        }),
      ).resolves.toBeDefined();

      expect(findLeavesIndexesSpy).toHaveBeenCalledWith(
        expect.anything(),
        MerkleTreeId.NOTE_HASH_TREE,
        expect.anything(),
      );
      findLeavesIndexesSpy.mockRestore();
    });
  });

  // Checks that kernelless simulation produces the same gas estimates as the full-kernels path for
  // Schnorr and ECDSA account contract deployments.
  describe('account contract deployment', () => {
    // Creates a fresh Schnorr account manager, simulates its deploy in both kernelless and full
    // modes, and asserts L2Gas and DA gas limits are identical.
    it('simulates Schnorr account deployment and gas matches with-kernels counterpart', async () => {
      const signingKey = Fq.random();
      const accountManager = await wallet.createAccount({
        secret: Fr.random(),
        salt: Fr.random(),
        contract: new SchnorrAccountContract(signingKey),
        type: 'schnorr',
      });
      const deployMethod = await accountManager.getDeployMethod();
      const deployOptions = { from: NO_FROM, skipClassPublication: true };

      wallet.setSimulationMode('kernelless-override');
      const kernellessResult = await deployMethod.simulate(deployOptions);
      const kernellessGas = kernellessResult.gasUsed!;

      wallet.setSimulationMode('full');
      const withKernelsResult = await deployMethod.simulate(deployOptions);
      const withKernelsGas = withKernelsResult.gasUsed!;

      logger.info(`Schnorr kernelless gas: L2=${kernellessGas.totalGas.l2Gas} DA=${kernellessGas.totalGas.daGas}`);
      logger.info(`Schnorr with kernels gas: L2=${withKernelsGas.totalGas.l2Gas} DA=${withKernelsGas.totalGas.daGas}`);

      expect(kernellessGas.totalGas.daGas).toEqual(withKernelsGas.totalGas.daGas);
      expect(kernellessGas.totalGas.l2Gas).toEqual(withKernelsGas.totalGas.l2Gas);
    });

    // Creates a fresh EcdsaK account manager, simulates its deploy in both kernelless and full
    // modes, and asserts L2Gas and DA gas limits are identical.
    it('simulates ECDSA account deployment and gas matches with-kernels counterpart', async () => {
      const signingKey = randomBytes(32);
      const accountManager = await wallet.createAccount({
        secret: Fr.random(),
        salt: Fr.random(),
        contract: new EcdsaKAccountContract(signingKey),
        type: 'ecdsasecp256k1',
      });
      const deployMethod = await accountManager.getDeployMethod();
      const deployOptions = { from: NO_FROM, skipClassPublication: true };

      wallet.setSimulationMode('kernelless-override');
      const kernellessResult = await deployMethod.simulate(deployOptions);
      const kernellessGas = kernellessResult.gasUsed!;

      wallet.setSimulationMode('full');
      const withKernelsResult = await deployMethod.simulate(deployOptions);
      const withKernelsGas = withKernelsResult.gasUsed!;

      logger.info(`ECDSA kernelless gas: L2=${kernellessGas.totalGas.l2Gas} DA=${kernellessGas.totalGas.daGas}`);
      logger.info(`ECDSA with kernels gas: L2=${withKernelsGas.totalGas.l2Gas} DA=${withKernelsGas.totalGas.daGas}`);

      expect(kernellessGas.totalGas.daGas).toEqual(withKernelsGas.totalGas.daGas);
      expect(kernellessGas.totalGas.l2Gas).toEqual(withKernelsGas.totalGas.l2Gas);
    });
  });
});
