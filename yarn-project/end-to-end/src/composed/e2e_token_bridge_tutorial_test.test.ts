// This test should only use packages that are published to npm
import { EthAddress } from '@aztec/aztec.js/addresses';
import { waitForProven } from '@aztec/aztec.js/contracts';
import { publishContractClass, publishInstance } from '@aztec/aztec.js/deployment';
import { L1TokenManager, L1TokenPortalManager } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { createAztecNodeClient, waitForNode } from '@aztec/aztec.js/node';
import { CheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { retryUntil } from '@aztec/foundation/retry';
import { DateProvider } from '@aztec/foundation/timer';
import {
  FeeAssetHandlerAbi,
  FeeAssetHandlerBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
  TokenPortalAbi,
  TokenPortalBytecode,
} from '@aztec/l1-artifacts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TokenBridgeContract } from '@aztec/noir-contracts.js/TokenBridge';
import { AuthRegistryArtifact, getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { registerInitialLocalNetworkAccountsInWallet } from '@aztec/wallets/testing';

import { getContract } from 'viem';

import { TestWallet } from '../test-wallet/test_wallet.js';

const MNEMONIC = 'test test test test test test test test test test test junk';
const { ETHEREUM_HOSTS = 'http://localhost:8545' } = process.env;

const l1Client = createExtendedL1Client(ETHEREUM_HOSTS.split(','), MNEMONIC);
const ownerEthAddress = l1Client.account.address;

const MINT_AMOUNT = BigInt(1e15);

const setupLocalNetwork = async () => {
  const { AZTEC_NODE_URL = 'http://localhost:8080' } = process.env;

  const node = createAztecNodeClient(AZTEC_NODE_URL);
  await waitForNode(node);
  const wallet = await TestWallet.create(node);
  const cheatCodes = await CheatCodes.create(ETHEREUM_HOSTS.split(','), node, new DateProvider());
  return { cheatCodes, node, wallet };
};

async function deployTestERC20(): Promise<EthAddress> {
  const constructorArgs = ['Test Token', 'TEST', l1Client.account.address];

  return await deployL1Contract(l1Client, TestERC20Abi, TestERC20Bytecode, constructorArgs).then(
    ({ address }) => address,
  );
}

async function deployFeeAssetHandler(l1TokenContract: EthAddress): Promise<EthAddress> {
  const constructorArgs = [l1Client.account.address, l1TokenContract.toString(), MINT_AMOUNT];
  return await deployL1Contract(l1Client, FeeAssetHandlerAbi, FeeAssetHandlerBytecode, constructorArgs).then(
    ({ address }) => address,
  );
}

async function deployTokenPortal(): Promise<EthAddress> {
  return await deployL1Contract(l1Client, TokenPortalAbi, TokenPortalBytecode, []).then(({ address }) => address);
}

async function addMinter(l1TokenContract: EthAddress, l1TokenHandler: EthAddress) {
  const contract = getContract({
    address: l1TokenContract.toString(),
    abi: TestERC20Abi,
    client: l1Client,
  });
  await l1Client.waitForTransactionReceipt({
    hash: await contract.write.addMinter([l1TokenHandler.toString()]),
  });
}

// To run these tests against a local network:
// 1. Start a local Ethereum node (Anvil):
//    anvil --host 127.0.0.1 --port 8545
//
// 2. Start the Aztec network:
//    cd yarn-project/aztec
//    NODE_NO_WARNINGS=1 ETHEREUM_HOSTS=http://127.0.0.1:8545 node ./dest/bin/index.js start --local-network
//
// 3. Run the tests:
//    yarn test:e2e e2e_token_bridge_tutorial_test.test.ts
// Token bridge tutorial test. Runs against a pre-started local network (AZTEC_NODE_URL + ETHEREUM_HOSTS)
// using only published npm packages. Deploys an L1 ERC20/portal and L2 token bridge, then exercises the
// full L1↔L2 bridging flow. Intentional constraint: no in-proc setup().
describe('e2e_cross_chain_messaging token_bridge_tutorial_test', () => {
  it('Deploys tokens & bridges to L1 & L2, mints & publicly bridges tokens', async () => {
    const logger = createLogger('aztec:token-bridge-tutorial');
    const { cheatCodes, wallet, node } = await setupLocalNetwork();
    const [ownerAztecAddress] = await registerInitialLocalNetworkAccountsInWallet(wallet);
    const l1ContractAddresses = (await node.getNodeInfo()).l1ContractAddresses;
    logger.info('L1 Contract Addresses:');
    logger.info(`Registry Address: ${l1ContractAddresses.registryAddress}`);
    logger.info(`Inbox Address: ${l1ContractAddresses.inboxAddress}`);
    logger.info(`Outbox Address: ${l1ContractAddresses.outboxAddress}`);
    logger.info(`Rollup Address: ${l1ContractAddresses.rollupAddress}`);

    // Deploy L2 token contract
    const { contract: l2TokenContract } = await TokenContract.deploy(
      wallet,
      ownerAztecAddress,
      'L2 Token',
      'L2',
      18,
    ).send({
      from: ownerAztecAddress,
    });
    logger.info(`L2 token contract deployed at ${l2TokenContract.address}`);

    // Deploy L1 token contract & mint tokens
    const l1TokenContract = await deployTestERC20();
    logger.info('erc20 contract deployed');

    const feeAssetHandler = await deployFeeAssetHandler(l1TokenContract);
    await addMinter(l1TokenContract, feeAssetHandler);

    const l1TokenManager = new L1TokenManager(l1TokenContract, feeAssetHandler, l1Client, logger);

    // Deploy L1 portal contract
    const l1PortalContractAddress = await deployTokenPortal();
    logger.info('L1 portal contract deployed');

    const l1Portal = getContract({
      address: l1PortalContractAddress.toString(),
      abi: TokenPortalAbi,
      client: l1Client,
    });
    // Deploy L2 bridge contract
    const { contract: l2BridgeContract } = await TokenBridgeContract.deploy(
      wallet,
      l2TokenContract.address,
      l1PortalContractAddress,
    ).send({ from: ownerAztecAddress });
    logger.info(`L2 token bridge contract deployed at ${l2BridgeContract.address}`);

    // Set Bridge as a minter
    await l2TokenContract.methods.set_minter(l2BridgeContract.address, true).send({ from: ownerAztecAddress });

    // Initialize L1 portal contract
    await l1Client.waitForTransactionReceipt({
      hash: await l1Portal.write.initialize(
        [
          l1ContractAddresses.registryAddress.toString(),
          l1TokenContract.toString(),
          l2BridgeContract.address.toString(),
        ],
        {},
      ),
    });
    logger.info('L1 portal contract initialized');

    const l1PortalManager = new L1TokenPortalManager(
      l1PortalContractAddress,
      l1TokenContract,
      feeAssetHandler,
      l1ContractAddresses.outboxAddress,
      l1Client,
      logger,
    );

    const claim = await l1PortalManager.bridgeTokensPublic(ownerAztecAddress, MINT_AMOUNT, true);

    // Do 2 unrelated actions because
    // https://github.com/AztecProtocol/aztec-packages/blob/7e9e2681e314145237f95f79ffdc95ad25a0e319/yarn-project/end-to-end/src/shared/cross_chain_test_harness.ts#L354-L355
    await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send({ from: ownerAztecAddress });
    await l2TokenContract.methods.mint_to_public(ownerAztecAddress, 0n).send({ from: ownerAztecAddress });

    // Claim tokens publicly on L2
    await l2BridgeContract.methods
      .claim_public(ownerAztecAddress, MINT_AMOUNT, claim.claimSecret, claim.messageLeafIndex)
      .send({ from: ownerAztecAddress });
    const { result: balance } = await l2TokenContract.methods
      .balance_of_public(ownerAztecAddress)
      .simulate({ from: ownerAztecAddress });
    logger.info(`Public L2 balance of ${ownerAztecAddress} is ${balance}`);

    logger.info('Withdrawing funds from L2');

    const withdrawAmount = 9n;
    const authwitNonce = Fr.random();

    // Ensure AuthRegistry contract class is registered and instance is published before using
    // the public authwit path, which relies on the AVM's deployment-nullifier check.
    {
      const { instance, contractClass } = await getStandardAuthRegistry();
      if (!(await wallet.getContractClassMetadata(contractClass.id)).isContractClassPubliclyRegistered) {
        await (await publishContractClass(wallet, AuthRegistryArtifact)).send({ from: ownerAztecAddress });
      }
      if (!(await wallet.getContractMetadata(instance.address)).isContractPublished) {
        await publishInstance(wallet, instance).send({ from: ownerAztecAddress });
      }
    }

    // Give approval to bridge to burn owner's funds:
    const authwit = await wallet.setPublicAuthWit(
      ownerAztecAddress,
      {
        caller: l2BridgeContract.address,
        action: l2TokenContract.methods.burn_public(ownerAztecAddress, withdrawAmount, authwitNonce),
      },
      true,
    );
    await authwit.send();

    const l2ToL1Message = await l1PortalManager.getL2ToL1MessageLeaf(
      withdrawAmount,
      EthAddress.fromString(ownerEthAddress),
      l2BridgeContract.address,
      EthAddress.ZERO,
    );
    const { receipt: l2TxReceipt } = await l2BridgeContract.methods
      .exit_to_l1_public(EthAddress.fromString(ownerEthAddress), withdrawAmount, EthAddress.ZERO, authwitNonce)
      .send({ from: ownerAztecAddress });
    const l2ExitBlock = await retryUntil(() => node.getBlock(l2TxReceipt.blockNumber!), 'L2 exit block', 120, 1);
    const result = await retryUntil(
      () => node.getL2ToL1MembershipWitness(l2TxReceipt.txHash, l2ToL1Message),
      'l2 to l1 membership witness',
      120,
      1,
    );
    await cheatCodes.rollup.markAsProven(l2ExitBlock.checkpointNumber);
    await cheatCodes.eth.mine();
    await retryUntil(
      async () => (await node.getBlockNumber('proven')) >= l2TxReceipt.blockNumber!,
      'mark L2 exit checkpoint proven',
      120,
      1,
    );
    await waitForProven(node, l2TxReceipt, { provenTimeout: 500 });

    const { result: newL2Balance } = await l2TokenContract.methods
      .balance_of_public(ownerAztecAddress)
      .simulate({ from: ownerAztecAddress });
    logger.info(`New L2 balance of ${ownerAztecAddress} is ${newL2Balance}`);

    await l1PortalManager.withdrawFunds(
      withdrawAmount,
      EthAddress.fromString(ownerEthAddress),
      result.epochNumber,
      result.numCheckpointsInEpoch,
      result.leafIndex,
      result.siblingPath,
    );
    const newL1Balance = await l1TokenManager.getL1TokenBalance(ownerEthAddress);
    logger.info(`New L1 balance of ${ownerEthAddress} is ${newL1Balance}`);
    expect(newL1Balance).toBe(withdrawAmount);
  }, 900_000);
});
