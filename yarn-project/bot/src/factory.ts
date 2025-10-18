import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import {
  AztecAddress,
  BatchCall,
  ContractBase,
  ContractFunctionInteraction,
  type DeployMethod,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  L1FeeJuicePortalManager,
  type L2AmountClaim,
  createLogger,
  waitForL1ToL2MessageReady,
} from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { Timer } from '@aztec/foundation/timer';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { GasSettings } from '@aztec/stdlib/gas';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { TestWallet } from '@aztec/test-wallet/server';

import { type BotConfig, SupportedTokenContracts } from './config.js';
import type { BotStore } from './store/index.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const MINT_BALANCE = 1e12;
const MIN_BALANCE = 1e3;

export class BotFactory {
  private log = createLogger('bot');

  constructor(
    private readonly config: BotConfig,
    private readonly wallet: TestWallet,
    private readonly store: BotStore,
    private readonly aztecNode: AztecNode,
    private readonly aztecNodeAdmin?: AztecNodeAdmin,
  ) {}

  /**
   * Initializes a new bot by setting up the sender account, registering the recipient,
   * deploying the token contract, and minting tokens if necessary.
   */
  public async setup() {
    const recipient = (await this.wallet.createAccount()).address;
    const defaultAccountAddress = await this.setupAccount();
    const token = await this.setupToken(defaultAccountAddress);
    await this.mintTokens(token, defaultAccountAddress);
    return { wallet: this.wallet, defaultAccountAddress, token, node: this.aztecNode, recipient };
  }

  public async setupAmm() {
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
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey!),
    };
    const accountManager = await this.wallet.createAccount(accountData);
    const isInit = (await this.wallet.getContractMetadata(accountManager.address)).isContractInitialized;
    if (isInit) {
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
      const maxFeesPerGas = (await this.aztecNode.getCurrentBaseFees()).mul(1 + this.config.baseFeePadding);
      const gasSettings = GasSettings.default({ maxFeesPerGas });
      const sentTx = deployMethod.send({ from: AztecAddress.ZERO, fee: { gasSettings, paymentMethod } });
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx for account deployment with hash ${txHash.toString()}`);
      await this.withNoMinTxsPerBlock(() => sentTx.wait({ timeout: this.config.txMinedWaitSeconds }));
      this.log.info(`Account deployed at ${address}`);

      // Clean up the consumed bridge claim
      await this.store.deleteBridgeClaim(address);

      return accountManager.address;
    }
  }

  private async setupTestAccount() {
    const [initialAccountData] = await getInitialTestAccountsData();
    const accountData = {
      secret: initialAccountData.secret,
      salt: initialAccountData.salt,
      contract: new SchnorrAccountContract(initialAccountData.signingKey),
    };
    const accountManager = await this.wallet.createAccount(accountData);
    return accountManager.address;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupToken(sender: AztecAddress): Promise<TokenContract | PrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | PrivateTokenContract>;
    const deployOpts: DeployOptions = {
      from: sender,
      contractAddressSalt: this.config.tokenSalt,
      universalDeploy: true,
    };
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(this.wallet, sender, 'BotToken', 'BOT', 18);
    } else if (this.config.contract === SupportedTokenContracts.PrivateTokenContract) {
      deploy = PrivateTokenContract.deploy(this.wallet, MINT_BALANCE, sender);
      deployOpts.skipInstancePublication = true;
      deployOpts.skipClassPublication = true;
      deployOpts.skipInitialization = false;
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.wallet.getContractMetadata(address)).isContractPublished) {
      this.log.info(`Token at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying token contract at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx for token setup with hash ${txHash.toString()}`);
      return this.withNoMinTxsPerBlock(() => sentTx.deployed({ timeout: this.config.txMinedWaitSeconds }));
    }
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private setupTokenContract(
    deployer: AztecAddress,
    contractAddressSalt: Fr,
    name: string,
    ticker: string,
    decimals = 18,
  ): Promise<TokenContract> {
    const deployOpts: DeployOptions = { from: deployer, contractAddressSalt, universalDeploy: true };
    const deploy = TokenContract.deploy(this.wallet, deployer, name, ticker, decimals);
    return this.registerOrDeployContract('Token - ' + name, deploy, deployOpts);
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
    const amm = await this.registerOrDeployContract('AMM', deploy, deployOpts);

    this.log.info(`AMM deployed at ${amm.address}`);
    const minterTx = lpToken.methods.set_minter(amm.address, true).send({ from: deployer });
    this.log.info(`Set LP token minter to AMM txHash=${(await minterTx.getTxHash()).toString()}`);
    await minterTx.wait({ timeout: this.config.txMinedWaitSeconds });
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
        token0.methods.balance_of_private(liquidityProvider).simulate({ from: liquidityProvider }),
        token1.methods.balance_of_private(liquidityProvider).simulate({ from: liquidityProvider }),
        lpToken.methods.balance_of_private(liquidityProvider).simulate({ from: liquidityProvider }),
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

    const mintTx = new BatchCall(this.wallet, [
      token0.methods.mint_to_private(liquidityProvider, MINT_BALANCE),
      token1.methods.mint_to_private(liquidityProvider, MINT_BALANCE),
    ]).send({ from: liquidityProvider });

    this.log.info(`Sent mint tx: ${(await mintTx.getTxHash()).toString()}`);
    await mintTx.wait({ timeout: this.config.txMinedWaitSeconds });

    const addLiquidityTx = amm.methods
      .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, authwitNonce)
      .send({
        from: liquidityProvider,
        authWitnesses: [token0Authwit, token1Authwit],
      });

    this.log.info(`Sent tx to add liquidity to the AMM: ${(await addLiquidityTx.getTxHash()).toString()}`);
    await addLiquidityTx.wait({ timeout: this.config.txMinedWaitSeconds });
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
  ): Promise<T> {
    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.wallet.getContractMetadata(address)).isContractPublished) {
      this.log.info(`Contract ${name} at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying contract ${name} at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent contract ${name} setup tx with hash ${txHash.toString()}`);
      return this.withNoMinTxsPerBlock(() => sentTx.deployed({ timeout: this.config.txMinedWaitSeconds }));
    }
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
    const sentTx = new BatchCall(token.wallet, calls).send({ from: minter });
    const txHash = await sentTx.getTxHash();
    this.log.info(`Sent token mint tx with hash ${txHash.toString()}`);
    await this.withNoMinTxsPerBlock(() => sentTx.wait({ timeout: this.config.txMinedWaitSeconds }));
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
            forPublicConsumption: false,
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
        forPublicConsumption: false,
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
