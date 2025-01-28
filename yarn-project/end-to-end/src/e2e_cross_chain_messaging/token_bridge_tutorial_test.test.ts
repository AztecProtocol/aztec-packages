import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  EthAddress,
  Fr,
  L1TokenManager,
  L1TokenPortalManager,
  createLogger,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { deployL1Contract } from '@aztec/ethereum';
import { TestERC20Abi, TestERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

describe('e2e_cross_chain_messaging token_bridge_private', () => {});

export const MNEMONIC = 'test test test test test test test test test test test junk';

const walletClient = getL1WalletClient(foundry.rpcUrls.default.http[0], 0);
const ownerEthAddress = walletClient.account.address;

const publicClient = createPublicClient({
  chain: foundry,
  transport: http('http://127.0.0.1:8545'),
});

const setupSandbox = async () => {
  const { PXE_URL = 'http://localhost:8080' } = process.env;
  // eslint-disable-next-line @typescript-eslint/await-thenable
  const pxe = await createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  return pxe;
};

async function deployTestERC20(): Promise<EthAddress> {
  const constructorArgs = ['Test Token', 'TEST', walletClient.account.address];

  return await deployL1Contract(walletClient, publicClient, TestERC20Abi, TestERC20Bytecode, constructorArgs).then(
    ({ address }) => address,
  );
}

async function deployTokenPortal(): Promise<EthAddress> {
  return await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode, []).then(
    ({ address }) => address,
  );
}

// from here: https://github.com/AztecProtocol/aztec-packages/blob/ecbd59e58006533c8885a8b2fadbd9507489300c/yarn-project/end-to-end/src/fixtures/utils.ts#L534
function getL1WalletClient(rpcUrl: string, index: number) {
  const hdAccount = mnemonicToAccount(MNEMONIC, { addressIndex: index });
  return createWalletClient({
    account: hdAccount,
    chain: foundry,
    transport: http(rpcUrl),
  });
}

describe('e2e_cross_chain_messaging token_bridge_private', async () => {
  // Setup

  const logger = createLogger('aztec:token-bridge-tutorial');
  const amount = BigInt(100);

  const pxe = await setupSandbox();
  const wallets = await getInitialTestAccountsWallets(pxe);
  const ownerWallet = wallets[0];
  const ownerAztecAddress = wallets[0].getAddress();
  const l1ContractAddresses = (await pxe.getNodeInfo()).l1ContractAddresses;

  // Deploy L2 token contract

  const l2TokenContract = await TokenContract.deploy(ownerWallet, ownerAztecAddress, 'L2 Token', 'L2', 18)
    .send()
    .deployed();
  logger.info(`L2 token contract deployed at ${l2TokenContract.address}`);

  // Deploy L1 token contract & mint tokens

  const l1TokenContract = await deployTestERC20();
  logger.info('erc20 contract deployed');

  const l1TokenManager = new L1TokenManager(l1TokenContract, publicClient, walletClient, logger);
  // await l1TokenManager.mint(amount, ownerEthAddress);

  // Deploy L1 portal contract

  const l1PortalContractAddress = await deployTokenPortal();
  logger.info('token portal contract deployed');

  const l1Portal = getContract({
    address: l1PortalContractAddress.toString(),
    abi: TokenPortalAbi,
    client: walletClient,
  });

  const l2BridgeContract = await TokenBridgeContract.deploy(
    ownerWallet,
    l2TokenContract.address,
    l1PortalContractAddress,
  )
    .send()
    .deployed();
  logger.info(`L2 token bridge contract deployed at ${l2BridgeContract.address}`);

  // Set Bridge as a minter
  await l2TokenContract.methods.set_minter(l2BridgeContract.address, true).send().wait();

  // Initialize L1 portal contract
  await l1Portal.write.initialize(
    [l1ContractAddresses.registryAddress.toString(), l1TokenContract.toString(), l2BridgeContract.address.toString()],
    {},
  );
  logger.info('L1 portal contract initialized');

  const l1PortalManager = new L1TokenPortalManager(
    l1PortalContractAddress,
    l1TokenContract,
    l1ContractAddresses.outboxAddress,
    publicClient,
    walletClient,
    logger,
  );

  const claim = await l1PortalManager.bridgeTokensPublic(ownerAztecAddress, amount, true);

  // do 2 unrleated actions because
  // https://github.com/AztecProtocol/aztec-packages/blob/7e9e2681e314145237f95f79ffdc95ad25a0e319/yarn-project/end-to-end/src/shared/cross_chain_test_harness.ts#L354-L355
  await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send().wait();
  await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send().wait();

  await l2BridgeContract.methods
    .claim_public(ownerAztecAddress, amount, claim.claimSecret, claim.messageLeafIndex)
    .send()
    .wait();
  const balance = await l2TokenContract.methods.balance_of_public(ownerAztecAddress).simulate();
  logger.info(`Public L2 balance of ${ownerAztecAddress} is ${balance}`);

  logger.info('Withdrawing funds from L2');

  const withdrawAmount = 9n;
  const nonce = Fr.random();

  // Give approval to bridge to burn owner's funds:
  const authwit = await ownerWallet.setPublicAuthWit(
    {
      caller: l2BridgeContract.address,
      action: l2TokenContract.methods.burn_public(ownerAztecAddress, withdrawAmount, nonce),
    },
    true,
  );
  await authwit.send().wait();

  const l2ToL1Message = l1PortalManager.getL2ToL1MessageLeaf(
    withdrawAmount,
    EthAddress.fromString(ownerEthAddress),
    l2BridgeContract.address,
    EthAddress.ZERO,
  );
  const l2TxReceipt = await l2BridgeContract.methods
    .exit_to_l1_public(EthAddress.fromString(ownerEthAddress), withdrawAmount, EthAddress.ZERO, nonce)
    .send()
    .wait();

  const newL2Balance = await l2TokenContract.methods.balance_of_public(ownerAztecAddress).simulate();
  logger.info(`New L2 balance of ${ownerAztecAddress} is ${newL2Balance}`);

  const [l2ToL1MessageIndex, siblingPath] = await pxe.getL2ToL1MembershipWitness(
    await pxe.getBlockNumber(),
    l2ToL1Message,
  );
  await l1PortalManager.withdrawFunds(
    withdrawAmount,
    EthAddress.fromString(ownerEthAddress),
    BigInt(l2TxReceipt.blockNumber!),
    l2ToL1MessageIndex,
    siblingPath,
  );
  const newL1Balance = await l1TokenManager.getL1TokenBalance(ownerEthAddress);
  logger.info(`New L1 balance of ${ownerEthAddress} is ${newL1Balance}`);
});
