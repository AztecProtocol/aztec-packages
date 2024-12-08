import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { BatchCall, type PXE, type WaitOpts, type Wallet, createCompatibleClient, retryUntil } from '@aztec/aztec.js';
import { L1FeeJuicePortalManager } from '@aztec/aztec.js';
import { type AztecAddress, type EthAddress, FEE_FUNDING_FOR_TESTER_ACCOUNT, Fq, Fr } from '@aztec/circuits.js';
import {
  type ContractArtifacts,
  type L1Clients,
  createEthereumChain,
  createL1Clients,
  deployL1Contract,
} from '@aztec/ethereum';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

type ContractDeploymentInfo = {
  address: AztecAddress;
  initHash: Fr;
  salt: Fr;
};

const waitOpts: WaitOpts = {
  timeout: 120,
  provenTimeout: 1200,
  interval: 1,
};

export async function bootstrapNetwork(
  pxeUrl: string,
  l1Url: string,
  l1ChainId: string,
  l1PrivateKey: `0x${string}` | undefined,
  l1Mnemonic: string,
  json: boolean,
  log: LogFn,
  debugLog: DebugLogger,
) {
  const pxe = await createCompatibleClient(pxeUrl, debugLog);

  // setup a one-off account contract
  const account = getSchnorrAccount(pxe, Fr.random(), Fq.random(), Fr.random());
  const wallet = await account.deploy().getWallet();

  const l1Clients = createL1Clients(
    l1Url,
    l1PrivateKey ? privateKeyToAccount(l1PrivateKey) : l1Mnemonic,
    createEthereumChain(l1Url, +l1ChainId).chainInfo,
  );

  const { erc20Address, portalAddress } = await deployERC20(l1Clients);

  const { token, bridge } = await deployToken(wallet, portalAddress);

  await initPortal(pxe, l1Clients, erc20Address, portalAddress, bridge.address);

  const feeRecipient = wallet.getAddress();
  const fpc = await deployFPC(wallet, token.address, feeRecipient);

  const counter = await deployCounter(wallet);
  // NOTE: Disabling for now in order to get devnet running
  await fundFPC(counter.address, wallet, l1Clients, fpc.address, debugLog);

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
async function deployERC20({ walletClient, publicClient }: L1Clients) {
  const { TestERC20Abi, TestERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } = await import('@aztec/l1-artifacts');

  const erc20: ContractArtifacts = {
    contractAbi: TestERC20Abi,
    contractBytecode: TestERC20Bytecode,
  };
  const portal: ContractArtifacts = {
    contractAbi: TokenPortalAbi,
    contractBytecode: TokenPortalBytecode,
  };

  const { address: erc20Address } = await deployL1Contract(
    walletClient,
    publicClient,
    erc20.contractAbi,
    erc20.contractBytecode,
    ['DevCoin', 'DEV', walletClient.account.address],
  );
  const { address: portalAddress } = await deployL1Contract(
    walletClient,
    publicClient,
    portal.contractAbi,
    portal.contractBytecode,
  );

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
  const { TokenContract, TokenBridgeContract } = await import('@aztec/noir-contracts.js');
  const devCoin = await TokenContract.deploy(wallet, wallet.getAddress(), 'DevCoin', 'DEV', 18)
    .send({ universalDeploy: true })
    .deployed(waitOpts);
  const bridge = await TokenBridgeContract.deploy(wallet, devCoin.address, l1Portal)
    .send({ universalDeploy: true })
    .deployed(waitOpts);

  await new BatchCall(wallet, [
    await devCoin.methods.set_minter(bridge.address, true).request(),
    await devCoin.methods.set_admin(bridge.address).request(),
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
  { walletClient, publicClient }: L1Clients,
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
    client: walletClient,
  });

  const hash = await contract.write.initialize([registryAddress.toString(), erc20.toString(), bridge.toString()]);

  await publicClient.waitForTransactionReceipt({ hash });
}

async function deployFPC(
  wallet: Wallet,
  tokenAddress: AztecAddress,
  feeRecipient: AztecAddress,
): Promise<ContractDeploymentInfo> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FPCContract } = await import('@aztec/noir-contracts.js');
  const fpc = await FPCContract.deploy(wallet, tokenAddress, feeRecipient)
    .send({ universalDeploy: true })
    .deployed(waitOpts);
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
  const { CounterContract } = await import('@aztec/noir-contracts.js');
  const counter = await CounterContract.deploy(wallet, 1, wallet.getAddress(), wallet.getAddress())
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
  counterAddress: AztecAddress,
  wallet: Wallet,
  l1Clients: L1Clients,
  fpcAddress: AztecAddress,
  debugLog: DebugLogger,
) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { FeeJuiceContract, CounterContract } = await import('@aztec/noir-contracts.js');
  const {
    protocolContractAddresses: { feeJuice },
  } = await wallet.getPXEInfo();

  const feeJuiceContract = await FeeJuiceContract.at(feeJuice, wallet);

  const feeJuicePortal = await L1FeeJuicePortalManager.new(
    wallet,
    l1Clients.publicClient,
    l1Clients.walletClient,
    debugLog,
  );

  const amount = FEE_FUNDING_FOR_TESTER_ACCOUNT;
  const { claimAmount, claimSecret, messageLeafIndex, messageHash } = await feeJuicePortal.bridgeTokensPublic(
    fpcAddress,
    amount,
    true,
  );

  await retryUntil(async () => await wallet.isL1ToL2MessageSynced(Fr.fromString(messageHash)), 'message sync', 600, 1);

  const counter = await CounterContract.at(counterAddress, wallet);

  // TODO (alexg) remove this once sequencer builds blocks continuously
  // advance the chain
  await counter.methods.increment(wallet.getAddress(), wallet.getAddress()).send().wait(waitOpts);
  await counter.methods.increment(wallet.getAddress(), wallet.getAddress()).send().wait(waitOpts);

  await feeJuiceContract.methods
    .claim(fpcAddress, claimAmount, claimSecret, messageLeafIndex)
    .send()
    .wait({ ...waitOpts, proven: true });
}
