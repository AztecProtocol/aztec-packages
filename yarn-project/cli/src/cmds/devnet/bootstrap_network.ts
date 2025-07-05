import { getInitialTestAccountsManagers } from '@aztec/accounts/testing';
import {
  AztecAddress,
  BatchCall,
  EthAddress,
  Fr,
  L1FeeJuicePortalManager,
  type PXE,
  type WaitForProvenOpts,
  type WaitOpts,
  type Wallet,
  createCompatibleClient,
  retryUntil,
  waitForProven,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import {
  type ContractArtifacts,
  type ExtendedViemWalletClient,
  createEthereumChain,
  createExtendedL1Client,
  deployL1Contract,
} from '@aztec/ethereum';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { getContract } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

type ContractDeploymentInfo = {
  address: AztecAddress;
  initHash: Fr;
  salt: Fr;
};

const waitOpts: WaitOpts = {
  timeout: 120,
  interval: 1,
};

const provenWaitOpts: WaitForProvenOpts = {
  provenTimeout: 4800,
  interval: 1,
};

export async function bootstrapNetwork(
  pxeUrl: string,
  l1Urls: string[],
  l1ChainId: string,
  l1PrivateKey: `0x${string}` | undefined,
  l1Mnemonic: string,
  addressIndex: number,
  json: boolean,
  log: LogFn,
  debugLog: Logger,
) {
  const pxe = await createCompatibleClient(pxeUrl, debugLog);

  // We assume here that the initial test accounts were prefunded with deploy-l1-contracts, and deployed with setup-l2-contracts
  // so all we need to do is register them to our pxe.
  const [accountManager] = await getInitialTestAccountsManagers(pxe);
  await accountManager.register();

  const wallet = await accountManager.getWallet();

  const l1Client = createExtendedL1Client(
    l1Urls,
    l1PrivateKey
      ? privateKeyToAccount(l1PrivateKey)
      : // We need to use a different account that the main "deployer" account because the "deployer" account creates transactions that send blobs.
        // Note that this account needs to be funded on L1 !
        mnemonicToAccount(l1Mnemonic, { addressIndex }),
    createEthereumChain(l1Urls, +l1ChainId).chainInfo,
  );

  const { erc20Address, portalAddress } = await deployERC20(l1Client);

  const { token, bridge } = await deployToken(wallet, portalAddress);

  await initPortal(pxe, l1Client, erc20Address, portalAddress, bridge.address);

  const fpcAdmin = wallet.getAddress();
  const fpc = await deployFPC(wallet, token.address, fpcAdmin);

  const counter = await deployCounter(wallet);

  await fundFPC(pxe, counter.address, wallet, l1Client, fpc.address, debugLog);

  if (json) {
    log(
      JSON.stringify(
        {
          devCoinL1: erc20Address.toString(),
          devCoinPortalL1: portalAddress.toString(),
          devCoin: {
            address: token.address.toString(),
            initHash: token.initHash.toString(),
            salt: token.salt.toString(),
          },
          devCoinBridge: {
            address: bridge.address.toString(),
            initHash: bridge.initHash.toString(),
            salt: bridge.salt.toString(),
          },
          devCoinFpc: {
            address: fpc.address.toString(),
            initHash: fpc.initHash.toString(),
            salt: fpc.salt.toString(),
          },
          counter: {
            address: counter.address.toString(),
            initHash: counter.initHash.toString(),
            salt: counter.salt.toString(),
          },
        },
        null,
        2,
      ),
    );
  } else {
    log(`DevCoin L1: ${erc20Address}`);
    log(`DevCoin L1 Portal: ${portalAddress}`);
    log(`DevCoin L2: ${token.address}`);
    log(`DevCoin L2 init hash: ${token.initHash}`);
    log(`DevCoin L2 salt: ${token.salt}`);
    log(`DevCoin L2 Bridge: ${bridge.address}`);
    log(`DevCoin L2 Bridge init hash: ${bridge.initHash}`);
    log(`DevCoin L2 Bridge salt: ${bridge.salt}`);
    log(`DevCoin FPC: ${fpc.address}`);
    log(`DevCoin FPC init hash: ${fpc.initHash}`);
    log(`DevCoin FPC salt: ${fpc.salt}`);
    log(`Counter: ${counter.address}`);
    log(`Counter init hash: ${counter.initHash}`);
    log(`Counter salt: ${counter.salt}`);
  }
}

/**
 * Step 1. Deploy the L1 contracts, but don't initialize
 */
async function deployERC20(l1Client: ExtendedViemWalletClient) {
  const { TestERC20Abi, TestERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } = await import('@aztec/l1-artifacts');

  const erc20: ContractArtifacts = {
    contractAbi: TestERC20Abi,
    contractBytecode: TestERC20Bytecode,
  };
  const portal: ContractArtifacts = {
    contractAbi: TokenPortalAbi,
    contractBytecode: TokenPortalBytecode,
  };

  const { address: erc20Address } = await deployL1Contract(l1Client, erc20.contractAbi, erc20.contractBytecode, [
    'DevCoin',
    'DEV',
    l1Client.account.address,
  ]);
  const { address: portalAddress } = await deployL1Contract(l1Client, portal.contractAbi, portal.contractBytecode);

  return {
    erc20Address,
    portalAddress,
  };
}

/**
 * Step 2. Deploy the L2 contracts
 */
async function deployToken(
  wallet: Wallet,
  l1Portal: EthAddress,
): Promise<{ token: ContractDeploymentInfo; bridge: ContractDeploymentInfo }> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { TokenContract } = await import('@aztec/noir-contracts.js/Token');
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { TokenBridgeContract } = await import('@aztec/noir-contracts.js/TokenBridge');
  const devCoin = await TokenContract.deploy(wallet, wallet.getAddress(), 'DevCoin', 'DEV', 18)
    .send({ universalDeploy: true })
    .deployed(waitOpts);
  const bridge = await TokenBridgeContract.deploy(wallet, devCoin.address, l1Portal)
    .send({ universalDeploy: true })
    .deployed(waitOpts);

  await new BatchCall(wallet, [
    devCoin.methods.set_minter(bridge.address, true),
    devCoin.methods.set_admin(bridge.address),
  ])
    .send()
    .wait(waitOpts);

  return {
    token: {
      address: devCoin.address,
      initHash: devCoin.instance.initializationHash,
      salt: devCoin.instance.salt,
    },
    bridge: {
      address: bridge.address,
      initHash: bridge.instance.initializationHash,
      salt: bridge.instance.salt,
    },
  };
}

/**
 * Step 3. Initialize DevCoin's L1 portal
 */
async function initPortal(
  pxe: PXE,
  l1Client: ExtendedViemWalletClient,
  erc20: EthAddress,
  portal: EthAddress,
  bridge: AztecAddress,
) {
  const { TokenPortalAbi } = await import('@aztec/l1-artifacts');
  const {
    l1ContractAddresses: { registryAddress },
  } = await pxe.getNodeInfo();

  const contract = getContract({
    abi: TokenPortalAbi,
    address: portal.toString(),
    client: l1Client,
  });

  const hash = await contract.write.initialize([registryAddress.toString(), erc20.toString(), bridge.toString()]);

  await l1Client.waitForTransactionReceipt({ hash });
}

async function deployFPC(
  wallet: Wallet,
  tokenAddress: AztecAddress,
  admin: AztecAddress,
): Promise<ContractDeploymentInfo> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FPCContract } = await import('@aztec/noir-contracts.js/FPC');
  const fpc = await FPCContract.deploy(wallet, tokenAddress, admin).send({ universalDeploy: true }).deployed(waitOpts);
  const info: ContractDeploymentInfo = {
    address: fpc.address,
    initHash: fpc.instance.initializationHash,
    salt: fpc.instance.salt,
  };
  return info;
}

async function deployCounter(wallet: Wallet): Promise<ContractDeploymentInfo> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { CounterContract } = await import('@aztec/noir-test-contracts.js/Counter');
  const counter = await CounterContract.deploy(wallet, 1, wallet.getAddress())
    .send({ universalDeploy: true })
    .deployed(waitOpts);
  const info: ContractDeploymentInfo = {
    address: counter.address,
    initHash: counter.instance.initializationHash,
    salt: counter.instance.salt,
  };
  return info;
}

// NOTE: Disabling for now in order to get devnet running
async function fundFPC(
  pxe: PXE,
  counterAddress: AztecAddress,
  wallet: Wallet,
  l1Client: ExtendedViemWalletClient,
  fpcAddress: AztecAddress,
  debugLog: Logger,
) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FeeJuiceContract } = await import('@aztec/noir-contracts.js/FeeJuice');
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { CounterContract } = await import('@aztec/noir-test-contracts.js/Counter');
  const {
    protocolContractAddresses: { feeJuice },
  } = await wallet.getPXEInfo();

  const feeJuiceContract = await FeeJuiceContract.at(feeJuice, wallet);

  const feeJuicePortal = await L1FeeJuicePortalManager.new(wallet, l1Client, debugLog);

  const { claimAmount, claimSecret, messageLeafIndex, messageHash } = await feeJuicePortal.bridgeTokensAsMinter(
    fpcAddress,
    FEE_FUNDING_FOR_TESTER_ACCOUNT,
  );

  await retryUntil(async () => await pxe.isL1ToL2MessageSynced(Fr.fromHexString(messageHash)), 'message sync', 600, 1);

  const counter = await CounterContract.at(counterAddress, wallet);

  debugLog.info('Incrementing Counter');

  // TODO (alexg) remove this once sequencer builds blocks continuously
  // advance the chain
  await counter.methods.increment(wallet.getAddress(), wallet.getAddress()).send().wait(waitOpts);
  await counter.methods.increment(wallet.getAddress(), wallet.getAddress()).send().wait(waitOpts);

  debugLog.info('Claiming FPC');

  const receipt = await feeJuiceContract.methods
    .claim(fpcAddress, claimAmount, claimSecret, messageLeafIndex)
    .send()
    .wait({ ...waitOpts });

  await waitForProven(pxe, receipt, provenWaitOpts);

  debugLog.info('Finished claiming FPC');
}
