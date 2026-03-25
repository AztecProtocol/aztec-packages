import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
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
import { ContractInitializationStatus } from '@aztec/aztec.js/wallet';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Timer } from '@aztec/foundation/timer';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
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

export class BotFactory {
  private log = createLogger('bot');

  constructor(
    private readonly config: BotConfig,
    private readonly wallet: EmbeddedWallet,
    private readonly store: BotStore,
    private readonly aztecNode: AztecNode,
    private readonly aztecNodeAdmin?: AztecNodeAdmin,
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
    const recipient = (await this.wallet.createSchnorrAccount(Fr.random(), Fr.random())).address;
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

    // Deploy TestContract
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
    const deployOpts: DeployOptions = {
      from: deployer,
      contractAddressSalt: this.config.tokenSalt,
      universalDeploy: true,
    };
    const deploy = TestContract.deploy(this.wallet);
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

  private async setupAccountWithPrivateKey(secret: Fr) {
    const salt = this.config.senderSalt ?? Fr.ONE;
    const signingKey = deriveSigningKey(secret);
    const accountManager = await this.wallet.createSchnorrAccount(secret, salt, signingKey);
    const metadata = await this.wallet.getContractMetadata(accountManager.address);
    if (metadata.initializationStatus === ContractInitializationStatus.INITIALIZED) {
      this.log.info(`Account at ${accountManager.address.toString()} already initialized`);
      const timer = new Timer();
      const address = accountManager.address;
      this.log.info(`Account at ${address} registered. duration=${timer.ms()}`);
      await this.store.deleteBridgeClaim(address);
      return address;
    } else {
      const address = accountManager.address;
      this.log.info(`Deploying account at ${address}`);

      const claim = await this.getOrCreateBridgeClaim(address);

      const paymentMethod = new FeeJuicePaymentMethodWithClaim(accountManager.address, claim);
      const deployMethod = await accountManager.getDeployMethod();

      await this.withNoMinTxsPerBlock(async () => {
        const { txHash } = await deployMethod.send({
          from: NO_FROM,
          fee: { paymentMethod },
          wait: NO_WAIT,
        });
        this.log.info(`Sent tx for account deployment with hash ${txHash.toString()}`);
        return waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
      });
      this.log.info(`Account deployed at ${address}`);

      // Clean up the consumed bridge claim
      await this.store.deleteBridgeClaim(address);

      return accountManager.address;
    }
  }

  private async setupTestAccount() {
    const [initialAccountData] = await getInitialTestAccountsData();
    const accountManager = await this.wallet.createSchnorrAccount(
      initialAccountData.secret,
      initialAccountData.salt,
      initialAccountData.signingKey,
    );
    return accountManager.address;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupToken(sender: AztecAddress): Promise<TokenContract | PrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | PrivateTokenContract>;
    let tokenInstance: ContractInstanceWithAddress | undefined;
    const deployOpts: DeployOptions = {
      from: sender,
      contractAddressSalt: this.config.tokenSalt,
      universalDeploy: true,
    };
    let token: TokenContract | PrivateTokenContract;
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(this.wallet, sender, 'BotToken', 'BOT', 18);
      tokenInstance = await deploy.getInstance(deployOpts);
      token = TokenContract.at(tokenInstance.address, this.wallet);
    } else if (this.config.contract === SupportedTokenContracts.PrivateTokenContract) {
      // Generate keys for the contract since PrivateToken uses SinglePrivateMutable which requires keys
      const tokenSecretKey = Fr.random();
      const tokenPublicKeys = (await deriveKeys(tokenSecretKey)).publicKeys;
      deploy = PrivateTokenContract.deployWithPublicKeys(tokenPublicKeys, this.wallet, MINT_BALANCE, sender);
      deployOpts.skipInstancePublication = true;
      deployOpts.skipClassPublication = true;
      deployOpts.skipInitialization = false;

      // Register the contract with the secret key before deployment
      tokenInstance = await deploy.getInstance(deployOpts);
      token = PrivateTokenContract.at(tokenInstance.address, this.wallet);
      await this.wallet.registerContract(tokenInstance, PrivateTokenContract.artifact, tokenSecretKey);
      // The contract constructor initializes private storage vars that need the contract's own nullifier key.
      deployOpts.additionalScopes = [tokenInstance.address];
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = tokenInstance?.address ?? (await deploy.getInstance(deployOpts)).address;
    const metadata = await this.wallet.getContractMetadata(address);
    if (metadata.isContractPublished) {
      this.log.info(`Token at ${address.toString()} already deployed`);
      await deploy.register();
    } else {
      this.log.info(`Deploying token contract at ${address.toString()}`);
      const { txHash } = await deploy.send({ ...deployOpts, wait: NO_WAIT });
      this.log.info(`Sent tx for token setup with hash ${txHash.toString()}`);
      await this.withNoMinTxsPerBlock(async () => {
        await waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
        return token;
      });
    }
    return token;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupTokenContract(
    deployer: AztecAddress,
    contractAddressSalt: Fr,
    name: string,
    ticker: string,
    decimals = 18,
  ): Promise<TokenContract> {
    const deployOpts: DeployOptions = { from: deployer, contractAddressSalt, universalDeploy: true };
    const deploy = TokenContract.deploy(this.wallet, deployer, name, ticker, decimals);
    const instance = await this.registerOrDeployContract('Token - ' + name, deploy, deployOpts);
    return TokenContract.at(instance.address, this.wallet);
  }

  private async setupAmmContract(
    deployer: AztecAddress,
    contractAddressSalt: Fr,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<AMMContract> {
    const deployOpts: DeployOptions = { from: deployer, contractAddressSalt, universalDeploy: true };
    const deploy = AMMContract.deploy(this.wallet, token0.address, token1.address, lpToken.address);
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
    const instance = await deploy.getInstance(deployOpts);
    const address = instance.address;
    const metadata = await this.wallet.getContractMetadata(address);
    if (metadata.isContractPublished) {
      this.log.info(`Contract ${name} at ${address.toString()} already deployed`);
      await deploy.register();
    } else {
      this.log.info(`Deploying contract ${name} at ${address.toString()}`);
      await this.withNoMinTxsPerBlock(async () => {
        const { txHash } = await deploy.send({ ...deployOpts, wait: NO_WAIT });
        this.log.info(`Sent contract ${name} setup tx with hash ${txHash.toString()}`);
        return waitForTx(this.aztecNode, txHash, { timeout: this.config.txMinedWaitSeconds });
      });
    }
    return instance;
  }

  /**
   * Mints private and public tokens for the sender if their balance is below the minimum.
   * @param token - Token contract.
   */
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
   * Gets or creates a bridge claim for the recipient.
   * Checks if a claim already exists in the store and reuses it if valid.
   * Only creates a new bridge if fee juice balance is below threshold.
   */
  private async getOrCreateBridgeClaim(recipient: AztecAddress): Promise<L2AmountClaim> {
    // Check if we have an existing claim in the store
    const existingClaim = await this.store.getBridgeClaim(recipient);
    if (existingClaim) {
      this.log.info(`Found existing bridge claim for ${recipient.toString()}, checking validity...`);

      // Check if the message is ready on L2
      try {
        const messageHash = Fr.fromHexString(existingClaim.claim.messageHash);
        await this.withNoMinTxsPerBlock(() =>
          waitForL1ToL2MessageReady(this.aztecNode, messageHash, {
            timeoutSeconds: this.config.l1ToL2MessageTimeoutSeconds,
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
