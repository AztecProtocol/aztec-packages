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
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js/EasyPrivateToken';
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
    const token = await this.setupToken(wallet);
    await this.mintTokens(token);
    return { wallet, token, pxe: this.pxe, recipient };
  }

  public async setupAmm() {
    const wallet = await this.setupAccount();
    const token0 = await this.setupTokenContract(wallet, this.config.tokenSalt, 'BotToken0', 'BOT0');
    const token1 = await this.setupTokenContract(wallet, this.config.tokenSalt, 'BotToken1', 'BOT1');
    const liquidityToken = await this.setupTokenContract(wallet, this.config.tokenSalt, 'BotLPToken', 'BOTLP');
    const amm = await this.setupAmmContract(wallet, this.config.tokenSalt, token0, token1, liquidityToken);

    await this.fundAmm(wallet, amm, token0, token1, liquidityToken);
    this.log.info(`AMM initialized and funded`);

    return { wallet, amm, token0, token1, pxe: this.pxe };
  }

  /**
   * Checks if the sender account contract is initialized, and initializes it if necessary.
   * @returns The sender wallet.
   */
  private async setupAccount() {
    const privateKey = this.config.senderPrivateKey.getValue();
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
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      await this.tryFlushTxs();
      this.log.verbose('Waiting for account deployment to settle');
      await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
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
  private async setupToken(wallet: AccountWallet): Promise<TokenContract | EasyPrivateTokenContract> {
    let deploy: DeployMethod<TokenContract | EasyPrivateTokenContract>;
    const deployOpts: DeployOptions = { contractAddressSalt: this.config.tokenSalt, universalDeploy: true };
    if (this.config.contract === SupportedTokenContracts.TokenContract) {
      deploy = TokenContract.deploy(wallet, wallet.getAddress(), 'BotToken', 'BOT', 18);
    } else if (this.config.contract === SupportedTokenContracts.EasyPrivateTokenContract) {
      deploy = EasyPrivateTokenContract.deploy(wallet, MINT_BALANCE, wallet.getAddress());
      deployOpts.skipPublicDeployment = true;
      deployOpts.skipClassRegistration = true;
      deployOpts.skipInitialization = false;
    } else {
      throw new Error(`Unsupported token contract type: ${this.config.contract}`);
    }

    const address = (await deploy.getInstance(deployOpts)).address;
    if ((await this.pxe.getContractMetadata(address)).isContractPubliclyDeployed) {
      this.log.info(`Token at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying token contract at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      await this.tryFlushTxs();
      this.log.verbose('Waiting for token setup to settle');
      return sentTx.deployed({ timeout: this.config.txMinedWaitSeconds });
    }
  }

  /**
   * Checks if the token contract is deployed and deploys it if necessary.
   * @param wallet - Wallet to deploy the token contract from.
   * @returns The TokenContract instance.
   */
  private setupTokenContract(
    wallet: AccountWallet,
    contractAddressSalt: Fr,
    name: string,
    ticker: string,
    decimals = 18,
  ): Promise<TokenContract> {
    const deployOpts: DeployOptions = { contractAddressSalt, universalDeploy: true };
    const deploy = TokenContract.deploy(wallet, wallet.getAddress(), name, ticker, decimals);
    return this.registerOrDeployContract('Token - ' + name, deploy, deployOpts);
  }

  private async setupAmmContract(
    wallet: AccountWallet,
    contractAddressSalt: Fr,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<AMMContract> {
    const deployOpts: DeployOptions = { contractAddressSalt, universalDeploy: true };
    const deploy = AMMContract.deploy(wallet, token0.address, token1.address, lpToken.address);
    const amm = await this.registerOrDeployContract('AMM', deploy, deployOpts);

    this.log.info(`AMM deployed at ${amm.address}`);
    const minterTx = lpToken.methods.set_minter(amm.address, true).send();
    this.log.info(`Set LP token minter to AMM txHash=${await minterTx.getTxHash()}`);
    await minterTx.wait({ timeout: this.config.txMinedWaitSeconds });
    this.log.info(`Liquidity token initialized`);

    return amm;
  }

  private async fundAmm(
    wallet: AccountWallet,
    amm: AMMContract,
    token0: TokenContract,
    token1: TokenContract,
    lpToken: TokenContract,
  ): Promise<void> {
    const getPrivateBalances = () =>
      Promise.all([
        token0.methods.balance_of_private(wallet.getAddress()).simulate(),
        token1.methods.balance_of_private(wallet.getAddress()).simulate(),
        lpToken.methods.balance_of_private(wallet.getAddress()).simulate(),
      ]);

    const authwitNonce = Fr.random();

    // keep some tokens for swapping
    const amount0Max = MINT_BALANCE / 2;
    const amount0Min = MINT_BALANCE / 4;
    const amount1Max = MINT_BALANCE / 2;
    const amount1Min = MINT_BALANCE / 4;

    const [t0Bal, t1Bal, lpBal] = await getPrivateBalances();

    this.log.info(
      `Minting ${MINT_BALANCE} tokens of each BotToken0 and BotToken1. Current private balances of ${wallet.getAddress()}: token0=${t0Bal}, token1=${t1Bal}, lp=${lpBal}`,
    );

    // Add authwitnesses for the transfers in AMM::add_liquidity function
    const token0Authwit = await wallet.createAuthWit({
      caller: amm.address,
      action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
        wallet.getAddress(),
        amm.address,
        amount0Max,
        authwitNonce,
      ),
    });
    const token1Authwit = await wallet.createAuthWit({
      caller: amm.address,
      action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
        wallet.getAddress(),
        amm.address,
        amount1Max,
        authwitNonce,
      ),
    });

    const mintTx = new BatchCall(wallet, [
      token0.methods.mint_to_private(wallet.getAddress(), wallet.getAddress(), MINT_BALANCE),
      token1.methods.mint_to_private(wallet.getAddress(), wallet.getAddress(), MINT_BALANCE),
    ]).send();

    this.log.info(`Sent mint tx: ${await mintTx.getTxHash()}`);
    await mintTx.wait({ timeout: this.config.txMinedWaitSeconds });

    const addLiquidityTx = amm.methods
      .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, authwitNonce)
      .send({
        authWitnesses: [token0Authwit, token1Authwit],
      });

    this.log.info(`Sent tx to add liquidity to the AMM: ${await addLiquidityTx.getTxHash()}`);
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
    if ((await this.pxe.getContractMetadata(address)).isContractPubliclyDeployed) {
      this.log.info(`Contract ${name} at ${address.toString()} already deployed`);
      return deploy.register();
    } else {
      this.log.info(`Deploying contract ${name} at ${address.toString()}`);
      const sentTx = deploy.send(deployOpts);
      const txHash = await sentTx.getTxHash();
      this.log.info(`Sent tx with hash ${txHash.toString()}`);
      await this.tryFlushTxs();
      this.log.verbose(`Waiting for contract ${name} setup to settle`);
      return sentTx.deployed({ timeout: this.config.txMinedWaitSeconds });
    }
  }

  /**
   * Mints private and public tokens for the sender if their balance is below the minimum.
   * @param token - Token contract.
   */
  private async mintTokens(token: TokenContract | EasyPrivateTokenContract) {
    const sender = token.wallet.getAddress();
    const isStandardToken = isStandardTokenContract(token);
    let privateBalance = 0n;
    let publicBalance = 0n;

    if (isStandardToken) {
      ({ privateBalance, publicBalance } = await getBalances(token, sender));
    } else {
      privateBalance = await getPrivateBalance(token, sender);
    }

    const calls: ContractFunctionInteraction[] = [];
    if (privateBalance < MIN_BALANCE) {
      this.log.info(`Minting private tokens for ${sender.toString()}`);

      const from = sender; // we are setting from to sender here because we need a sender to calculate the tag
      calls.push(
        isStandardToken
          ? token.methods.mint_to_private(from, sender, MINT_BALANCE)
          : token.methods.mint(MINT_BALANCE, sender),
      );
    }
    if (isStandardToken && publicBalance < MIN_BALANCE) {
      this.log.info(`Minting public tokens for ${sender.toString()}`);
      calls.push(token.methods.mint_to_public(sender, MINT_BALANCE));
    }
    if (calls.length === 0) {
      this.log.info(`Skipping minting as ${sender.toString()} has enough tokens`);
      return;
    }
    const sentTx = new BatchCall(token.wallet, calls).send();
    const txHash = await sentTx.getTxHash();
    this.log.info(`Sent tx with hash ${txHash.toString()}`);
    await this.tryFlushTxs();
    this.log.verbose('Waiting for token mint to settle');
    await sentTx.wait({ timeout: this.config.txMinedWaitSeconds });
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

  private async advanceL2Block() {
    const initialBlockNumber = await this.node!.getBlockNumber();
    await this.tryFlushTxs();
    await retryUntil(async () => (await this.node!.getBlockNumber()) >= initialBlockNumber + 1);
  }

  private async tryFlushTxs() {
    if (this.config.flushSetupTransactions) {
      this.log.verbose('Flushing transactions');
      try {
        await this.nodeAdmin!.flushTxs();
      } catch (err) {
        this.log.error(`Failed to flush transactions: ${err}`);
      }
    }
  }
}
