import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  BatchCall,
  ContractBase,
  ContractFunctionInteraction,
  type DeployMethod,
  type DeployOptions,
  NO_WAIT,
} from '@aztec/aztec.js/contracts';
import type { L2AmountClaim } from '@aztec/aztec.js/ethereum';
import { L1FeeJuicePortalManager } from '@aztec/aztec.js/ethereum';
import { FeeJuicePaymentMethodWithClaim } from '@aztec/aztec.js/fee';
import { deriveKeys } from '@aztec/aztec.js/keys';
import { createLogger } from '@aztec/aztec.js/log';
import { waitForL1ToL2MessageReady } from '@aztec/aztec.js/messaging';
import { waitForTx } from '@aztec/aztec.js/node';
import { getFeeJuiceBalance } from '@aztec/aztec.js/utils';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { BlockTag } from '@aztec/stdlib/block';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

import { type BotConfig, SupportedTokenContracts } from './config.js';
import { seedL1ToL2Message } from './l1_to_l2_seeding.js';
import type { BotStore } from './store/index.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const MINT_BALANCE = 1e12;
const MIN_BALANCE = 1e3;
const FEE_JUICE_TOP_UP_THRESHOLD = 100n * 10n ** 18n;

export class BotFactory {
  private log = createLogger('bot');

  constructor(
    private readonly config: BotConfig,
    private readonly wallet: EmbeddedWallet,
    private readonly store: BotStore,
    private readonly aztecNode: AztecNode,
    private readonly aztecNodeAdmin?: AztecNodeAdmin,
    private readonly syncChainTip?: BlockTag,
  ) {
    // Set fee padding on the wallet so that all transactions during setup
    // (token deploy, minting, etc.) use the configured padding, not the default.
    this.wallet.setMinFeePadding(config.minFeePadding);
  }

  /**
   * Initializes a new bot by setting up the sender account, registering the recipient,
   * deploying the token contract, and minting tokens if necessary.
   */
  public async setup(): Promise<{
    wallet: EmbeddedWallet;
    defaultAccountAddress: AztecAddress;
    token: TokenContract | PrivateTokenContract;
    node: AztecNode;
    recipient: AztecAddress;
  }> {
    const defaultAccountAddress = await this.setupAccount();
    const recipient = (await this.wallet.createSchnorrAccount(Fr.random(), Fr.random(), GrumpkinScalar.random()))
      .address;
    await this.ensureFeeJuiceBalance(defaultAccountAddress);
    const token = await this.setupToken(defaultAccountAddress);
    await this.mintTokens(token, defaultAccountAddress);
    return { wallet: this.wallet, defaultAccountAddress, token, node: this.aztecNode, recipient };
  }

  public async setupAmm(): Promise<{
    wallet: EmbeddedWallet;
    defaultAccountAddress: AztecAddress;
    amm: AMMContract;
    token0: TokenContract;
    token1: TokenContract;
    node: AztecNode;
  }> {
    const defaultAccountAddress = await this.setupAccount();
    await this.ensureFeeJuiceBalance(defaultAccountAddress);
    const token0 = await this.setupTokenContract(defaultAccountAddress, this.config.tokenSalt, 'BotToken0', 'BOT0');
    const token1 = await this.setupTokenContract(defaultAccountAddress, this.config.tokenSalt, 'BotToken1', 'BOT1');
    const liquidityToken = await this.setupTokenContract(
      defaultAccountAddress,
      this.config.tokenSalt,
      'BotLPToken',
      'BOTLP',
    );
    const amm = await this.setupAmmContract(
      defaultAccountAddress,
      this.config.tokenSalt,
      token0,
      token1,
      liquidityToken,
    );

    await this.fundAmm(defaultAccountAddress, defaultAccountAddress, amm, token0, token1, liquidityToken);
    this.log.info(`AMM initialized and funded`);

    return { wallet: this.wallet, defaultAccountAddress, amm, token0, token1, node: this.aztecNode };
  }

  /**
   * Initializes the cross-chain bot by deploying TestContract, creating an L1 client,
   * seeding initial L1→L2 messages, and waiting for the first to be ready.
   */
  public async setupCrossChain(): Promise<{
    wallet: EmbeddedWallet;
    defaultAccountAddress: AztecAddress;
    contract: TestContract;
    node: AztecNode;
    l1Client: ExtendedViemWalletClient;
    rollupVersion: bigint;
  }> {
    const defaultAccountAddress = await this.setupAccount();
    await this.ensureFeeJuiceBalance(defaultAccountAddress);

    // Create L1 client (same pattern as bridgeL1FeeJuice)
    const l1RpcUrls = this.config.l1RpcUrls;
    if (!l1RpcUrls?.length) {
      throw new Error('L1 RPC URLs required for cross-chain bot');
    }
    const mnemonicOrPrivateKey = this.config.l1PrivateKey?.getValue() ?? this.config.l1Mnemonic?.getValue();
    if (!mnemonicOrPrivateKey) {
      throw new Error('L1 mnemonic or private key required for cross-chain bot');
    }
    const { l1ChainId, l1ContractAddresses } = await this.aztecNode.getNodeInfo();
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const l1Client = createExtendedL1Client(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

    // Fetch Rollup version (needed for Inbox L2Actor struct)
    const rollupContract = new RollupContract(l1Client, l1ContractAddresses.rollupAddress.toString());
    const rollupVersion = await rollupContract.getVersion();

    // Deploy TestContract (pays from the standing balance funded above).
    const contract = await this.setupTestContract(defaultAccountAddress);

    // Recover any pending messages from store (clean up stale ones first)
    await this.store.cleanupOldPendingMessages();
    const pendingMessages = await this.store.getUnconsumedL1ToL2Messages();

    // Seed initial L1→L2 messages if pipeline is empty
    const seedCount = Math.max(0, this.config.l1ToL2SeedCount - pendingMessages.length);
    for (let i = 0; i < seedCount; i++) {
      await seedL1ToL2Message(
        l1Client,
        EthAddress.fromString(l1ContractAddresses.inboxAddress.toString()),
        contract.address,
        rollupVersion,
        this.store,
        this.log,
      );
    }

    // Block until at least one message is ready
    const allMessages = await this.store.getUnconsumedL1ToL2Messages();
    if (allMessages.length > 0) {
      this.log.info(`Waiting for first L1→L2 message to be ready...`);
      const firstMsg = allMessages[0];
      await waitForL1ToL2MessageReady(this.aztecNode, Fr.fromHexString(firstMsg.msgHash), {
        timeoutSeconds: this.config.l1ToL2MessageTimeoutSeconds,
        chainTip: this.syncChainTip,
      });
      this.log.info(`First L1→L2 message is ready`);
    }

    return {
      wallet: this.wallet,
      defaultAccountAddress,
      contract,
      node: this.aztecNode,
      l1Client,
      rollupVersion,
    };
  }

  private async setupTestContract(deployer: AztecAddress): Promise<TestContract> {
    const deployOpts: DeployOptions = { from: deployer };
    const deploy = TestContract.deploy(this.wallet, { salt: this.config.tokenSalt, universalDeploy: true });
    const instance = await this.registerOrDeployContract('TestContract', deploy, deployOpts);
    return TestContract.at(instance.address, this.wallet);
  }

  /**
   * Checks if the sender account contract is initialized, and initializes it if necessary.
   * @returns The sender wallet.
   */
  private async setupAccount() {
    const privateKey = this.config.senderPrivateKey?.getValue();
    if (privateKey) {
      this.log.info(`Setting up account with provided private key`);
      return await this.setupAccountWithPrivateKey(privateKey);
    } else {
      this.log.info(`Setting up test account`);
      return await this.setupTestAccount();
    }
  }

  /**
   * Keyless fallback for tests and local dev: reuses the first genesis test account, whose address is
   * pre-funded with fee juice via `initialFundedAccounts`. The test accounts are initializerless, so this
   * must create an initializerless account for the address to match the funded one. Production bots set a
   * sender private key and fund the resulting initializerless account from L1 instead; see
   * setupAccountWithPrivateKey.
   */
  private async setupTestAccount() {
    const [initialAccountData] = await getInitialTestAccountsData();
    const accountManager = await this.wallet.createSchnorrInitializerlessAccount(
      initialAccountData.secret,
      initialAccountData.salt,
      initialAccountData.signingKey,
    );
    return accountManager.address;
  }

  private async setupAccountWithPrivateKey(secret: Fr) {
    const salt = this.config.senderSalt ?? Fr.ONE;
    const signingKey = deriveSigningKey(secret);
    const accountManager = await this.wallet.createSchnorrInitializerlessAccount(secret, salt, signingKey);
    return accountManager.address;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * Uses a bridge claim for deploy when balance is below threshold to avoid failing before refuel.
   * @param sender - Aztec address to deploy the token contract from.
   * @param existingToken - Optional token instance when called from setupTokenWithOptionalEarlyRefuel.
   * @returns The TokenContract or PrivateTokenContract instance.
   */
  private async setupToken(sender: AztecAddress): Promise<TokenContract | PrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | PrivateTokenContract>;
    const salt = this.config.tokenSalt;
    const deployOpts: DeployOptions = { from: sender };
    let token: TokenContract | PrivateTokenContract;
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(this.wallet, sender, 'BotToken', 'BOT', 18, { salt, universalDeploy: true });
      const instance = await deploy.getInstance();
      token = TokenContract.at(instance.address, this.wallet);
    } else if (this.config.contract === SupportedTokenContracts.PrivateTokenContract) {
      // Generate keys for the contract since PrivateToken uses SinglePrivateMutable which requires keys
      const tokenSecretKey = Fr.random();
      const tokenPublicKeys = (await deriveKeys(tokenSecretKey)).publicKeys;
      deploy = PrivateTokenContract.deploy(this.wallet, MINT_BALANCE, sender, {
        salt,
        universalDeploy: true,
        publicKeys: tokenPublicKeys,
      });
      deployOpts.skipInstancePublication = true;
      deployOpts.skipClassPublication = true;
      deployOpts.skipInitialization = false;

      // Register the contract with the secret key before deployment
      const tokenInstance = await deploy.getInstance();
      token = PrivateTokenContract.at(tokenInstance.address, this.wallet);
      await this.wallet.registerContract(tokenInstance, PrivateTokenContract.artifact, tokenSecretKey);
      // The contract constructor initializes private storage vars that need the contract's own nullifier key.
      deployOpts.additionalScopes = [tokenInstance.address];
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    await this.registerOrDeployContract('token', deploy, deployOpts);
    return token;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupTokenContract(
    deployer: AztecAddress,
    salt: Fr,
    name: string,
    ticker: string,
    decimals = 18,
  ): Promise<TokenContract> {
    const deployOpts: DeployOptions = { from: deployer };
    const deploy = TokenContract.deploy(this.wallet, deployer, name, ticker, decimals, { salt, universalDeploy: true });
    const instance = await this.registerOrDeployContract('Token - ' + name, deploy, deployOpts);
    return TokenContract.at(instance.address, this.wallet);
  }

  private async setupAmmContract(
    deployer: AztecAddress,
    salt: Fr,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<AMMContract> {
    const deployOpts: DeployOptions = { from: deployer };
    const deploy = AMMContract.deploy(this.wallet, token0.address, token1.address, lpToken.address, {
      salt,
      universalDeploy: true,
    });
    const instance = await this.registerOrDeployContract('AMM', deploy, deployOpts);
    const amm = AMMContract.at(instance.address, this.wallet);

    this.log.info(`AMM deployed at ${amm.address}`);
    const setMinterInteraction = lpToken.methods.set_minter(amm.address, true);
    const { receipt: minterReceipt } = await setMinterInteraction.send({
      from: deployer,
      wait: { timeout: this.config.txMinedWaitSeconds },
    });
    this.log.info(`Set LP token minter to AMM txHash=${minterReceipt.txHash.toString()}`);
    this.log.info(`Liquidity token initialized`);

    return amm;
  }

  private async fundAmm(
    defaultAccountAddress: AztecAddress,
    liquidityProvider: AztecAddress,
    amm: AMMContract,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<void> {
    const getPrivateBalances = () =>
      Promise.all([
        token0.methods
          .balance_of_private(liquidityProvider)
          .simulate({ from: liquidityProvider })
          .then(r => r.result),
        token1.methods
          .balance_of_private(liquidityProvider)
          .simulate({ from: liquidityProvider })
          .then(r => r.result),
        lpToken.methods
          .balance_of_private(liquidityProvider)
          .simulate({ from: liquidityProvider })
          .then(r => r.result),
      ]);

    const authwitNonce = Fr.random();

    // keep some tokens for swapping
    const amount0Max = MINT_BALANCE / 2;
    const amount0Min = MINT_BALANCE / 4;
    const amount1Max = MINT_BALANCE / 2;
    const amount1Min = MINT_BALANCE / 4;

    const [t0Bal, t1Bal, lpBal] = await getPrivateBalances();

    this.log.info(
      `Minting ${MINT_BALANCE} tokens of each BotToken0 and BotToken1. Current private balances of ${liquidityProvider}: token0=${t0Bal}, token1=${t1Bal}, lp=${lpBal}`,
    );

    // Add authwitnesses for the transfers in AMM::add_liquidity function
    const token0Authwit = await this.wallet.createAuthWit(defaultAccountAddress, {
      caller: amm.address,
      call: await token0.methods
        .transfer_to_public_and_prepare_private_balance_increase(
          liquidityProvider,
          amm.address,
          amount0Max,
          authwitNonce,
        )
        .getFunctionCall(),
    });
    const token1Authwit = await this.wallet.createAuthWit(defaultAccountAddress, {
      caller: amm.address,
      call: await token1.methods
        .transfer_to_public_and_prepare_private_balance_increase(
          liquidityProvider,
          amm.address,
          amount1Max,
          authwitNonce,
        )
        .getFunctionCall(),
    });

    const mintBatch = new BatchCall(this.wallet, [
      token0.methods.mint_to_private(liquidityProvider, MINT_BALANCE),
      token1.methods.mint_to_private(liquidityProvider, MINT_BALANCE),
    ]);
    const { receipt: mintReceipt } = await mintBatch.send({
      from: liquidityProvider,
      wait: { timeout: this.config.txMinedWaitSeconds },
    });

    this.log.info(`Sent mint tx: ${mintReceipt.txHash.toString()}`);

    const addLiquidityInteraction = amm.methods.add_liquidity(
      amount0Max,
      amount1Max,
      amount0Min,
      amount1Min,
      authwitNonce,
    );
    const { receipt: addLiquidityReceipt } = await addLiquidityInteraction.send({
      from: liquidityProvider,
      authWitnesses: [token0Authwit, token1Authwit],
      wait: { timeout: this.config.txMinedWaitSeconds },
    });

    this.log.info(`Sent tx to add liquidity to the AMM: ${addLiquidityReceipt.txHash.toString()}`);
    this.log.info(`Liquidity added`);

    const [newT0Bal, newT1Bal, newLPBal] = await getPrivateBalances();
    this.log.info(
      `Updated private balances of ${defaultAccountAddress} after minting and funding AMM: token0=${newT0Bal}, token1=${newT1Bal}, lp=${newLPBal}`,
    );
  }

  private async registerOrDeployContract<T extends ContractBase>(
    name: string,
    deploy: DeployMethod<T>,
    deployOpts: DeployOptions,
  ): Promise<ContractInstanceWithAddress> {
    const instance = await deploy.getInstance();
    const address = instance.address;
    const metadata = await this.wallet.getContractMetadata(address);
    if (metadata.isContractPublished) {
      this.log.info(`Contract ${name} at ${address.toString()} already deployed`);
      await deploy.register();
      return instance;
    }

    // Setup always runs ensureFeeJuiceBalance before any deploy, so the account pays from its standing
    // balance here. No manual gas estimation: the embedded wallet simulates before sending and derives
    // the gas limits and padded maxFeesPerGas itself.
    this.log.info(`Deploying contract ${name} at ${address.toString()}`);
    await this.withNoMinTxsPerBlock(async () => {
      const { txHash } = await deploy.send({ ...deployOpts, wait: NO_WAIT });
      this.log.info(`Sent contract ${name} deploy tx ${txHash.toString()}`);
      return waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
    });

    return instance;
  }

  /** True when the config allows bridging fee juice from L1 (fee_juice mode, an L1 RPC, and an L1 key). */
  private isL1BridgingConfigured(): boolean {
    const mnemonicOrPrivateKey = this.config.l1PrivateKey?.getValue() ?? this.config.l1Mnemonic?.getValue();
    return this.config.feePaymentMethod === 'fee_juice' && !!this.config.l1RpcUrls?.length && !!mnemonicOrPrivateKey;
  }

  /**
   * Ensures the account holds enough fee juice before any other setup step. The account starts empty
   * (initializerless accounts have no deployment tx) and the runtime loop pays fees from this balance and
   * never refuels itself, so every flow funds the account up front. Bridges claims from L1 and consumes
   * each with a claim-only tx until the balance clears the threshold, working from a zero (fresh run) or
   * drained (restart) balance. Each bridge mints a fixed amount well above the threshold, so this is a
   * single bridge in practice. No-op when L1 bridging is not configured or the balance is already above
   * the threshold.
   */
  private async ensureFeeJuiceBalance(account: AztecAddress): Promise<void> {
    if (!this.isL1BridgingConfigured()) {
      return;
    }

    let balance = await getFeeJuiceBalance(account, this.aztecNode);
    if (balance >= FEE_JUICE_TOP_UP_THRESHOLD) {
      this.log.info(`Fee juice balance ${balance} above threshold ${FEE_JUICE_TOP_UP_THRESHOLD}, skipping top-up`);
      return;
    }

    this.log.info(`Fee juice balance ${balance} below threshold ${FEE_JUICE_TOP_UP_THRESHOLD}, bridging from L1`);

    while (balance < FEE_JUICE_TOP_UP_THRESHOLD) {
      // Persist the claim before consuming it: if the top-up tx fails or the bot crashes mid-loop, the
      // next run reuses the pending claim instead of bridging again (and wasting the bridged funds).
      const claim = await this.getOrCreateBridgeClaim(account);
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(account, claim);

      await this.withNoMinTxsPerBlock(async () => {
        const executionPayload = await paymentMethod.getExecutionPayload();
        const { txHash } = await this.wallet.sendTx(executionPayload, { from: account, wait: NO_WAIT });
        this.log.info(`Sent fee juice top-up tx ${txHash.toString()}`);
        return waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
      });
      await this.store.deleteBridgeClaim(account);
      balance = await getFeeJuiceBalance(account, this.aztecNode);
      this.log.info(`Fee juice balance after top-up: ${balance}`);
    }
    this.log.info(`Fee juice top-up complete for ${account.toString()}`);
  }

  private async mintTokens(token: TokenContract | PrivateTokenContract, minter: AztecAddress) {
    const isStandardToken = isStandardTokenContract(token);
    let privateBalance = 0n;
    let publicBalance = 0n;

    if (isStandardToken) {
      ({ privateBalance, publicBalance } = await getBalances(token, minter));
    } else {
      privateBalance = await getPrivateBalance(token, minter);
    }

    const calls: ContractFunctionInteraction[] = [];
    if (privateBalance < MIN_BALANCE) {
      this.log.info(`Minting private tokens for ${minter.toString()}`);

      calls.push(
        isStandardToken
          ? token.methods.mint_to_private(minter, MINT_BALANCE)
          : token.methods.mint(MINT_BALANCE, minter),
      );
    }
    if (isStandardToken && publicBalance < MIN_BALANCE) {
      this.log.info(`Minting public tokens for ${minter.toString()}`);
      calls.push(token.methods.mint_to_public(minter, MINT_BALANCE));
    }
    if (calls.length === 0) {
      this.log.info(`Skipping minting as ${minter.toString()} has enough tokens`);
      return;
    }

    // PrivateToken's mint accesses contract-level private storage vars (admin, total_supply).
    const additionalScopes = isStandardToken ? undefined : [token.address];
    const mintBatch = new BatchCall(token.wallet, calls);
    await this.withNoMinTxsPerBlock(async () => {
      const { txHash } = await mintBatch.send({
        from: minter,
        additionalScopes,
        wait: NO_WAIT,
      });
      this.log.info(`Sent token mint tx with hash ${txHash.toString()}`);
      return waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
    });
  }

  /**
   * Returns a usable bridge claim for the recipient, reusing a persisted one when its L1→L2 message is
   * still available (resuming a top-up that failed or crashed before the claim was consumed) and bridging
   * a fresh claim otherwise. The caller deletes the claim from the store once it has been consumed.
   */
  private async getOrCreateBridgeClaim(recipient: AztecAddress): Promise<L2AmountClaim> {
    const existingClaim = await this.store.getBridgeClaim(recipient);
    if (existingClaim) {
      this.log.info(`Found existing bridge claim for ${recipient.toString()}, checking validity...`);
      try {
        const messageHash = Fr.fromHexString(existingClaim.claim.messageHash);
        await this.withNoMinTxsPerBlock(() =>
          waitForL1ToL2MessageReady(this.aztecNode, messageHash, {
            timeoutSeconds: this.config.l1ToL2MessageTimeoutSeconds,
            chainTip: this.syncChainTip,
          }),
        );
        return existingClaim.claim;
      } catch (err) {
        this.log.warn(`Failed to verify existing claim, creating new one: ${err}`);
        await this.store.deleteBridgeClaim(recipient);
      }
    }

    const claim = await this.bridgeL1FeeJuice(recipient);
    await this.store.saveBridgeClaim(recipient, claim);
    return claim;
  }

  private async bridgeL1FeeJuice(recipient: AztecAddress): Promise<L2AmountClaim> {
    const l1RpcUrls = this.config.l1RpcUrls;
    if (!l1RpcUrls?.length) {
      throw new Error('L1 Rpc url is required to bridge the fee juice to fund the deployment of the account.');
    }
    const mnemonicOrPrivateKey = this.config.l1PrivateKey?.getValue() ?? this.config.l1Mnemonic?.getValue();
    if (!mnemonicOrPrivateKey) {
      throw new Error(
        'Either a mnemonic or private key of an L1 account is required to bridge the fee juice to fund the deployment of the account.',
      );
    }

    const { l1ChainId } = await this.aztecNode.getNodeInfo();
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const extendedClient = createExtendedL1Client(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

    const portal = await L1FeeJuicePortalManager.new(this.aztecNode, extendedClient, this.log);
    const mintAmount = await portal.getTokenManager().getMintAmount();
    const claim = await portal.bridgeTokensPublic(recipient, mintAmount, true /* mint */);

    await this.withNoMinTxsPerBlock(() =>
      waitForL1ToL2MessageReady(this.aztecNode, Fr.fromHexString(claim.messageHash), {
        timeoutSeconds: this.config.l1ToL2MessageTimeoutSeconds,
        chainTip: this.syncChainTip,
      }),
    );

    this.log.info(`Created a claim for ${mintAmount} L1 fee juice to ${recipient}.`, claim);

    return claim as L2AmountClaim;
  }

  private async withNoMinTxsPerBlock<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.aztecNodeAdmin || !this.config.flushSetupTransactions) {
      this.log.verbose(`No node admin client or flushing not requested (not setting minTxsPerBlock to 0)`);
      return fn();
    }
    const { minTxsPerBlock } = await this.aztecNodeAdmin.getConfig();
    this.log.warn(`Setting sequencer minTxsPerBlock to 0 from ${minTxsPerBlock} to flush setup transactions`);
    await this.aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    try {
      return await fn();
    } finally {
      this.log.warn(`Restoring sequencer minTxsPerBlock to ${minTxsPerBlock}`);
      await this.aztecNodeAdmin.setConfig({ minTxsPerBlock });
    }
  }
}
