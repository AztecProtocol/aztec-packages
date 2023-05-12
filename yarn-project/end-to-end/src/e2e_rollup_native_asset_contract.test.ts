import { AztecNode, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, EthAddress, TxStatus } from '@aztec/aztec.js';
import { RollupNativeAssetContractAbi } from '@aztec/noir-contracts/examples';

import { mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { Fr, Point } from '@aztec/foundation/fields';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { fr } from '@aztec/circuits.js/factories';
import { sha256 } from '@aztec/foundation/crypto';
import { sleep } from '@aztec/foundation/sleep';

const MNEMONIC = 'test test test test test test test test test test test junk';

const logger = createDebugLogger('aztec:e2e_rollup_native_asset_contract');

const config = getConfigEnvVars();

describe('e2e_rollup_native_asset_contract', () => {
  let node: AztecNode;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let contract: Contract;
  let portalAddress: EthAddress;

  // @todo @LHerskind need to deploy an L1 contract as well to test this properly
  // the hacky way should let me check the block at least and see that something meaningful was inserted there.

  beforeEach(async () => {
    const account = mnemonicToAccount(MNEMONIC);
    const privKey = account.getHdKey().privateKey;
    const { rollupAddress, unverifiedDataEmitterAddress } = await deployL1Contracts(config.rpcUrl, account, logger);

    config.publisherPrivateKey = Buffer.from(privKey!);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;

    node = await AztecNode.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(2, node);
    accounts = await aztecRpcServer.getAccounts();

    portalAddress = EthAddress.random();
  }, 60_000);

  afterEach(async () => {
    await node?.stop();
    await aztecRpcServer?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await contract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const pointToPublicKey = (point: Point) => {
    const x = point.buffer.subarray(0, 32);
    const y = point.buffer.subarray(32, 64);
    return {
      x: toBigIntBE(x),
      y: toBigIntBE(y),
    };
  };

  const deployContract = async (initialBalance = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(RollupNativeAssetContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialBalance, owner).send({
      portalContract: portalAddress,
    });
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, RollupNativeAssetContractAbi, aztecRpcServer);
    contract.attach(portalAddress);

    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  /**
   * Milestone 2 - L2 -> L1
   */
  it('2.0 should call withdraw and exit funds to L1', async () => {
    const initialBalance = 987n;
    const withdrawAmount = 654n;
    const [owner] = accounts;

    await deployContract(initialBalance, pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner)));

    await expectBalance(owner, initialBalance);

    const ethOutAddress = EthAddress.random();

    const tx = contract.methods
      .withdraw(
        withdrawAmount,
        pointToPublicKey(await aztecRpcServer.getAccountPublicKey(owner)),
        ethOutAddress.toField().value,
      )
      .send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);

    await expectBalance(owner, initialBalance - withdrawAmount);

    const blockNumber = await node.getBlockHeight();
    const blocks = await node.getBlocks(blockNumber, 1);
    const contractInfo = await node.getContractInfo(contract.address);

    // Prime order of BN254 curve
    const p = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

    // 0x00f714ce, selector for "withdraw(uint256,address)"
    const content_buffer = Buffer.concat([
      Buffer.from([0x00, 0xf7, 0x14, 0xce]),
      toBufferBE(withdrawAmount, 32),
      ethOutAddress.toBuffer32(),
    ]);
    const temp_content = toBigIntBE(sha256(content_buffer));
    const content = Fr.fromBuffer(toBufferBE(temp_content % p, 32));

    // Compute the expected hash and see if it is what we saw in the block.
    const message_buf = Buffer.concat([
      contract.address.toBuffer(),
      fr(1).toBuffer(), // aztec version
      contractInfo?.portalContractAddress.toBuffer32() ?? Buffer.alloc(32, 0),
      fr(1).toBuffer(), // chain id
      content.toBuffer(),
    ]);

    const temp = toBigIntBE(sha256(message_buf));
    const hash = Fr.fromBuffer(toBufferBE(temp % p, 32));

    expect(blocks[0].newL2ToL1Msgs[0]).toEqual(hash);

    // @todo @LHerskind Check that the message was inserted into the message box
    // @todo @LHerskind Call function on L1 contract to consume the message
    // @todo @LHerskind Check that the message was consumed.
  }, 60_000);
});
