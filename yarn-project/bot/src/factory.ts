import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getDeployedTestAccountsWallets, getInitialTestAccounts } from '@aztec/accounts/testing';
import {
  type AccountWallet,
  AztecAddress,
  BatchCall,
  ContractBase,
  ContractFunctionInteraction,
  type DeployMethod,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  L1FeeJuicePortalManager,
  type PXE,
  createLogger,
  createPXEClient,
  retryUntil,
} from '@aztec/aztec.js';
import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { Timer } from '@aztec/foundation/timer';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { PrivateTokenContract } from '@aztec/noir-contracts.js/PrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { makeTracedFetch } from '@aztec/telemetry-client';

import { type BotConfig, SupportedTokenContracts, getVersions } from './config.js';
import { getBalances, getPrivateBalance, isStandardTokenContract } from './utils.js';

const MINT_BALANCE = 1e12;
const MIN_BALANCE = 1e3;

export class BotFactory {
  private pxe: PXE;
  private node?: AztecNode;
  private nodeAdmin?: AztecNodeAdmin;
  private log = createLogger('bot');

  constructor(
    private readonly config: BotConfig,
    dependencies: { pxe?: PXE; nodeAdmin?: AztecNodeAdmin; node?: AztecNode },
  ) {
    if (config.flushSetupTransactions && !dependencies.nodeAdmin) {
      throw new Error(
        `Either a node admin client or node admin url must be provided if transaction flushing is requested`,
      );
    }
    if (config.senderPrivateKey && config.senderPrivateKey.getValue() && !dependencies.node) {
      throw new Error(
        `Either a node client or node url must be provided for bridging L1 fee juice to deploy an account with private key`,
      );
    }
    if (!dependencies.pxe && !config.pxeUrl) {
      throw new Error(`Either a PXE client or a PXE URL must be provided`);
    }

    this.node = dependencies.node;
    this.nodeAdmin = dependencies.nodeAdmin;

    if (dependencies.pxe) {
      this.log.info(`Using local PXE`);
      this.pxe = dependencies.pxe;
      return;
    }
    this.log.info(`Using remote PXE at ${config.pxeUrl!}`);
    this.pxe = createPXEClient(config.pxeUrl!, getVersions(), makeTracedFetch([1, 2, 3], false));
  }

  /**
   * Initializes a new bot by setting up the sender account, registering the recipient,
   * deploying the token contract, and minting tokens if necessary.
   */
  public async setup() {
    const recipient = await this.registerRecipient();
    const wallet = await this.setupAccount();
    const defaultAccountAddress = wallet.getAddress();
    const token = await this.setupToken(wallet, defaultAccountAddress);
    await this.mintTokens(token, defaultAccountAddress);
    return { wallet, defaultAccountAddress, token, pxe: this.pxe, recipient };
  }

  public async setupAmm() {
    const wallet = await this.setupAccount();
    const defaultAccountAddress = wallet.getAddress();
    const token0 = await this.setupTokenContract(
      wallet,
      wallet.getAddress(),
      this.config.tokenSalt,
      'BotToken0',
      'BOT0',
    );
    const token1 = await this.setupTokenContract(
      wallet,
      wallet.getAddress(),
      this.config.tokenSalt,
      'BotToken1',
      'BOT1',
    );
    const liquidityToken = await this.setupTokenContract(
      wallet,
      wallet.getAddress(),
      this.config.tokenSalt,
      'BotLPToken',
      'BOTLP',
    );
    const amm = await this.setupAmmContract(
      wallet,
      wallet.getAddress(),
      this.config.tokenSalt,
      token0,
      token1,
      liquidityToken,
    );

    await this.fundAmm(wallet, wallet.getAddress(), amm, token0, token1, liquidityToken);
    this.log.info(`AMM initialized and funded`);

    return { wallet, defaultAccountAddress, amm, token0, token1, pxe: this.pxe };
  }

  /**
   * Checks if the sender account contract is initialized, and initializes it if necessary.
   * @returns The sender wallet.
   */
  private async setupAccount() {
    const privateKey = this.config.senderPrivateKey?.getValue();
    if (privateKey) {
      return await this.setupAccountWithPrivateKey(privateKey);
    } else {
      return await this.setupTestAccount();
    }
  }

  private async setupAccountWithPrivateKey(privateKey: Fr) {
    const salt = this.config.senderSalt ?? Fr.ONE;
    const signingKey = deriveSigningKey(privateKey);
    const account = await getSchnorrAccount(this.pxe, privateKey, signingKey, salt);
    const isInit = (await this.pxe.getContractMetadata(account.getAddress())).isContractInitialized;
    if (isInit) {
      this.log.info(`Account at ${account.getAddress().toString()} already initialized`);
      const timer = new Timer();
      const wallet = await account.register();
      this.log.info(`Account at ${account.getAddress()} registered. duration=${timer.ms()}`);
      return wallet;
    } else {
      const address = account.getAddress();
      this.log.info(`Deploying account at ${address}`);

      const claim = await this.bridgeL1FeeJuice(address);

      // docs:start:claim_and_deploy
      const wallet = await account.getWallet();
      const paymentMethod = new FeeJuicePaymentMethodWithClaim(wallet, claim);
      const sentTx = account.deploy({ fee: { paymentMethod } });
      const txHash = await sentTx.getTxHash();
      // docs:end:claim_and_deploy
      this.log.info(`Sent tx for account deployment with hash ${txHash.toString()}`);
      await this.withNoMinTxsPerBlock(() => sentTx.wait({ timeout: this.config.txMinedWaitSeconds }));
      this.log.info(`Account deployed at ${address}`);
      return wallet;
    }
  }

  private async setupTestAccount() {
    let [wallet] = await getDeployedTestAccountsWallets(this.pxe);
    if (wallet) {
      this.log.info(`Using funded test account: ${wallet.getAddress()}`);
    } else {
      this.log.info('Registering funded test account');
      const [account] = await getInitialTestAccounts();
      const manager = await getSchnorrAccount(this.pxe, account.secret, account.signingKey, account.salt);
      wallet = await manager.register();
      this.log.info(`Funded test account registered: ${wallet.getAddress()}`);
    }
    return wallet;
  }

  /**
   * Registers the recipient for txs in the pxe.
   */
  private async registerRecipient() {
    const recipient = await this.pxe.registerAccount(this.config.recipientEncryptionSecret.getValue(), Fr.ONE);
    return recipient.address;
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private async setupToken(wallet: AccountWallet, sender: AztecAddress): Promise<TokenContract | PrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | PrivateTokenContract>;
    const deployOpts: DeployOptions = {
      from: sender,
      contractAddressSalt: this.config.tokenSalt,
      universalDeploy: true,
    };
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(wallet, sender, 'BotToken', 'BOT', 18);
    } else if (this.config.contract === SupportedTokenContracts.PrivateTokenContract) {
      deploy = PrivateTokenContract.deploy(wallet, MINT_BALANCE, sender);
      deployOpts.skipInstancePublication = true;
      deployOpts.skipClassPublication = true;
      deployOpts.skipInitialization = false;
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.pxe.getContractMetadata(address)).isContractPublished) {
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
    wallet: AccountWallet,
    deployer: AztecAddress,
    contractAddressSalt: Fr,
    name: string,
    ticker: string,
    decimals = 18,
  ): Promise<TokenContract> {
    const deployOpts: DeployOptions = { from: deployer, contractAddressSalt, universalDeploy: true };
    const deploy = TokenContract.deploy(wallet, deployer, name, ticker, decimals);
    return this.registerOrDeployContract('Token - ' + name, deploy, deployOpts);
  }

  private async setupAmmContract(
    wallet: AccountWallet,
    deployer: AztecAddress,
    contractAddressSalt: Fr,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<AMMContract> {
    const deployOpts: DeployOptions = { from: deployer, contractAddressSalt, universalDeploy: true };
    const deploy = AMMContract.deploy(wallet, token0.address, token1.address, lpToken.address);
    const amm = await this.registerOrDeployContract('AMM', deploy, deployOpts);

    this.log.info(`AMM deployed at ${amm.address}`);
    const minterTx = lpToken.methods.set_minter(amm.address, true).send({ from: deployer });
    this.log.info(`Set LP token minter to AMM txHash=${(await minterTx.getTxHash()).toString()}`);
    await minterTx.wait({ timeout: this.config.txMinedWaitSeconds });
    this.log.info(`Liquidity token initialized`);

    return amm;
  }

  private async fundAmm(
    wallet: AccountWallet,
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
    const token0Authwit = await wallet.createAuthWit({
      caller: amm.address,
      action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
        liquidityProvider,
        amm.address,
        amount0Max,
        authwitNonce,
      ),
    });
    const token1Authwit = await wallet.createAuthWit({
      caller: amm.address,
      action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
        liquidityProvider,
        amm.address,
        amount1Max,
        authwitNonce,
      ),
    });

    const mintTx = new BatchCall(wallet, [
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
      `Updated private balances of ${wallet.getAddress()} after minting and funding AMM: token0=${newT0Bal}, token1=${newT1Bal}, lp=${newLPBal}`,
    );
  }

  private async registerOrDeployContract<T extends ContractBase>(
    name: string,
    deploy: DeployMethod<T>,
    deployOpts: DeployOptions,
  ): Promise<T> {
    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.pxe.getContractMetadata(address)).isContractPublished) {
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

  private async bridgeL1FeeJuice(recipient: AztecAddress) {
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

    const { l1ChainId } = await this.pxe.getNodeInfo();
    const chain = createEthereumChain(l1RpcUrls, l1ChainId);
    const extendedClient = createExtendedL1Client(chain.rpcUrls, mnemonicOrPrivateKey, chain.chainInfo);

    const portal = await L1FeeJuicePortalManager.new(this.pxe, extendedClient, this.log);
    const mintAmount = await portal.getTokenManager().getMintAmount();
    const claim = await portal.bridgeTokensPublic(recipient, mintAmount, true /* mint */);

    const isSynced = async () => await this.pxe.isL1ToL2MessageSynced(Fr.fromHexString(claim.messageHash));
    await retryUntil(isSynced, `message ${claim.messageHash} sync`, this.config.l1ToL2MessageTimeoutSeconds, 1);

    this.log.info(`Created a claim for ${mintAmount} L1 fee juice to ${recipient}.`, claim);

    // Progress by 2 L2 blocks so that the l1ToL2Message added above will be available to use on L2.
    await this.advanceL2Block();
    await this.advanceL2Block();

    return claim;
  }

  private async withNoMinTxsPerBlock<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.nodeAdmin || !this.config.flushSetupTransactions) {
      return fn();
    }
    const { minTxsPerBlock } = await this.nodeAdmin.getConfig();
    await this.nodeAdmin.setConfig({ minTxsPerBlock: 0 });
    try {
      return await fn();
    } finally {
      await this.nodeAdmin.setConfig({ minTxsPerBlock });
    }
  }

  private async advanceL2Block() {
    await this.withNoMinTxsPerBlock(async () => {
      const initialBlockNumber = await this.node!.getBlockNumber();
      await retryUntil(async () => (await this.node!.getBlockNumber()) >= initialBlockNumber + 1);
    });
  }
}
