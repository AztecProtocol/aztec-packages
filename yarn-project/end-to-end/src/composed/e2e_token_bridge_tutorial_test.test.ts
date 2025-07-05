// This test should only use packages that are published to npm
// docs:start:imports
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
import { createExtendedL1Client, deployL1Contract } from '@aztec/ethereum';
import { TestERC20Abi, TestERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';

import { getContract } from 'viem';

// docs:end:imports
// docs:start:utils
const MNEMONIC = 'test test test test test test test test test test test junk';
const { ETHEREUM_HOSTS = 'http://localhost:8545' } = process.env;

const l1Client = createExtendedL1Client(ETHEREUM_HOSTS.split(','), MNEMONIC);
const ownerEthAddress = l1Client.account.address;

const setupSandbox = async () => {
  const { PXE_URL = 'http://localhost:8080' } = process.env;
  // eslint-disable-next-line @typescript-eslint/await-thenable
  const pxe = await createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  return pxe;
};

async function deployTestERC20(): Promise<EthAddress> {
  const constructorArgs = ['Test Token', 'TEST', l1Client.account.address];

  return await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, constructorArgs).then(
    ({ address }) => address,
  );
}

async function deployTokenPortal(): Promise<EthAddress> {
  return await deployL1Contract(l1Client, TokenPortalAbi, TokenPortalBytecode, []).then(({ address }) => address);
}

// docs:end:utils

describe('e2e_cross_chain_messaging token_bridge_tutorial_test', () => {
  it('Deploys tokens & bridges to L1 & L2, mints & publicly bridges tokens', async () => {
    // docs:start:setup
    const logger = createLogger('aztec:token-bridge-tutorial');
    const amount = BigInt(100);
    const pxe = await setupSandbox();
    const wallets = await getInitialTestAccountsWallets(pxe);
    const ownerWallet = wallets[0];
    const ownerAztecAddress = wallets[0].getAddress();
    const l1ContractAddresses = (await pxe.getNodeInfo()).l1ContractAddresses;
    logger.info('L1 Contract Addresses:');
    logger.info(`Registry Address: ${l1ContractAddresses.registryAddress}`);
    logger.info(`Inbox Address: ${l1ContractAddresses.inboxAddress}`);
    logger.info(`Outbox Address: ${l1ContractAddresses.outboxAddress}`);
    logger.info(`Rollup Address: ${l1ContractAddresses.rollupAddress}`);
    // docs:end:setup

    // Deploy L2 token contract
    // docs:start:deploy-l2-token
    const l2TokenContract = await TokenContract.deploy(ownerWallet, ownerAztecAddress, 'L2 Token', 'L2', 18)
      .send()
      .deployed();
    logger.info(`L2 token contract deployed at ${l2TokenContract.address}`);
    // docs:end:deploy-l2-token

    // Deploy L1 token contract & mint tokens
    // docs:start:deploy-l1-token
    const l1TokenContract = await deployTestERC20();
    logger.info('erc20 contract deployed');

    const l1TokenManager = new L1TokenManager(l1TokenContract, l1Client, logger);
    // docs:end:deploy-l1-token

    // Deploy L1 portal contract
    // docs:start:deploy-portal
    const l1PortalContractAddress = await deployTokenPortal();
    logger.info('L1 portal contract deployed');

    const l1Portal = getContract({
      address: l1PortalContractAddress.toString(),
      abi: TokenPortalAbi,
      client: l1Client,
    });
    // docs:end:deploy-portal
    // Deploy L2 bridge contract
    // docs:start:deploy-l2-bridge
    const l2BridgeContract = await TokenBridgeContract.deploy(
      ownerWallet,
      l2TokenContract.address,
      l1PortalContractAddress,
    )
      .send()
      .deployed();
    logger.info(`L2 token bridge contract deployed at ${l2BridgeContract.address}`);
    // docs:end:deploy-l2-bridge

    // Set Bridge as a minter
    // docs:start:authorize-l2-bridge
    await l2TokenContract.methods.set_minter(l2BridgeContract.address, true).send().wait();
    // docs:end:authorize-l2-bridge

    // Initialize L1 portal contract
    // docs:start:setup-portal
    await l1Portal.write.initialize(
      [l1ContractAddresses.registryAddress.toString(), l1TokenContract.toString(), l2BridgeContract.address.toString()],
      {},
    );
    logger.info('L1 portal contract initialized');

    const l1PortalManager = new L1TokenPortalManager(
      l1PortalContractAddress,
      l1TokenContract,
      l1ContractAddresses.outboxAddress,
      l1Client,
      logger,
    );
    // docs:end:setup-portal

    // docs:start:l1-bridge-public
    const claim = await l1PortalManager.bridgeTokensPublic(ownerAztecAddress, amount, true);

    // Do 2 unrleated actions because
    // https://github.com/AztecProtocol/aztec-packages/blob/7e9e2681e314145237f95f79ffdc95ad25a0e319/yarn-project/end-to-end/src/shared/cross_chain_test_harness.ts#L354-L355
    await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send().wait();
    await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send().wait();
    // docs:end:l1-bridge-public

    // Claim tokens publicly on L2
    // docs:start:claim
    await l2BridgeContract.methods
      .claim_public(ownerAztecAddress, amount, claim.claimSecret, claim.messageLeafIndex)
      .send()
      .wait();
    const balance = await l2TokenContract.methods.balance_of_public(ownerAztecAddress).simulate();
    logger.info(`Public L2 balance of ${ownerAztecAddress} is ${balance}`);
    // docs:end:claim

    logger.info('Withdrawing funds from L2');

    // docs:start:setup-withdrawal
    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();

    // Give approval to bridge to burn owner's funds:
    const authwit = await ownerWallet.setPublicAuthWit(
      {
        caller: l2BridgeContract.address,
        action: l2TokenContract.methods.burn_public(ownerAztecAddress, withdrawAmount, authwitNonce),
      },
      true,
    );
    await authwit.send().wait();
    // docs:end:setup-withdrawal

    // docs:start:l2-withdraw
    const l2ToL1Message = await l1PortalManager.getL2ToL1MessageLeaf(
      withdrawAmount,
      EthAddress.fromString(ownerEthAddress),
      l2BridgeContract.address,
      EthAddress.ZERO,
    );
    const l2TxReceipt = await l2BridgeContract.methods
      .exit_to_l1_public(EthAddress.fromString(ownerEthAddress), withdrawAmount, EthAddress.ZERO, authwitNonce)
      .send()
      .wait();

    const newL2Balance = await l2TokenContract.methods.balance_of_public(ownerAztecAddress).simulate();
    logger.info(`New L2 balance of ${ownerAztecAddress} is ${newL2Balance}`);
    // docs:end:l2-withdraw

    // docs:start:l1-withdraw
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
    // docs:end:l1-withdraw
    expect(newL1Balance).toBe(withdrawAmount);
  }, 60000);
});
