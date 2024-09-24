// /**
//  * A test where the validator nodes re-execute transactions from a block before attesting to it.
//  */

// import { privateKeyToAccount } from "viem/accounts";
// import { getPrivateKeyFromIndex, setup } from "./fixtures/utils.js";
// import { EthAddress, ETHEREUM_SLOT_DURATION } from "@aztec/circuits.js";
// import { AztecNodeConfig, AztecNodeService } from "@aztec/aztec-node";
// import { BootstrapNode } from "@aztec/p2p";
// import {
//   CompleteAddress,
//   type DebugLogger,
//   type DeployL1Contracts,
//   EthCheatCodes,
//   Fr,
//   GrumpkinScalar,
//   type SentTx,
//   TxStatus,
//   sleep,
// } from '@aztec/aztec.js';
// import { createBootstrapNode, createNodes, NodeContext } from "./fixtures/setup_p2p_test.js";
// import { getContract } from "viem";
// import { RollupAbi } from "@aztec/l1-artifacts";

// const NUM_NODES = 2;
// const NUM_TX_PER_BLOCK = 4;
// const NUM_TX_PER_NODE = 2;
// const BOOT_NODE_UDP_PORT = 40400;

// const PEER_ID_PRIVATE_KEYS = generatePeerIdPrivateKeys(NUM_NODES);

// describe('e2e_p2p_reex', () => {
//   let config: AztecNodeConfig;
//   let logger: DebugLogger;
//   let teardown: () => Promise<void>;
//   let bootstrapNode: BootstrapNode;
//   let bootstrapNodeEnr: string;
//   let deployL1ContractsValues: DeployL1Contracts;



//     beforeEach(async () => {

//         const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
//         const initialValidators = [EthAddress.fromString(account.address)];

//         ({
//             teardown,
//             config,
//             logger,
//             deployL1ContractsValues
//         } = await setup(0, {
//             initialValidators,
//             l1BlockTime: ETHEREUM_SLOT_DURATION,
//             salt: 420,
//         }));


//         bootstrapNode = await createBootstrapNode(BOOT_NODE_UDP_PORT);
//         bootstrapNodeEnr = bootstrapNode.getENR().encodeTxt();

//         config.minTxsPerBlock = NUM_TX_PER_BLOCK;
//         config.maxTxsPerBlock = NUM_TX_PER_BLOCK;

//         const rollup = getContract({
//             address: deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
//             abi: RollupAbi,
//             client: deployL1ContractsValues.walletClient,
//         });

//         for (let i = 0; i < NUM_NODES; i++) {
//             const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(i + 1)!.toString('hex')}`);
//             await rollup.write.addValidator([account.address]);
//             logger.debug(`Adding ${account.address} as validator`);
//         }

//         // Remove the initial sequencer from the set! This was the sequencer we used for perform the setup.
//         logger.debug(`Removing ${account.address} as validator`);
//         const txHash = await rollup.write.removeValidator([account.address]);

//         await deployL1ContractsValues.publicClient.waitForTransactionReceipt({ hash: txHash });

//         // TODO(md): fix this case
//         //@note   Now we jump ahead to the next epoch such that the validator committee is picked
//         //        INTERVAL MINING: If we are using anvil interval mining this will NOT progress the time!
//         //        Which means that the validator set will still be empty! So anyone can propose.
//         const slotsInEpoch = await rollup.read.EPOCH_DURATION();
//         const timestamp = await rollup.read.getTimestampForSlot([slotsInEpoch]);
//         const cheatCodes = new EthCheatCodes(config.l1RpcUrl);

//         try {
//             await cheatCodes.warp(Number(timestamp));
//         } catch (err) {
//             logger.debug('Warp failed, time already satisfied');
//         }

//         // Send and await a tx to make sure we mine a block for the warp to correctly progress.
//         await deployL1ContractsValues.publicClient.waitForTransactionReceipt({
//             hash: await deployL1ContractsValues.walletClient.sendTransaction({ to: account.address, value: 1n, account }),
//         });
//     });


//   it('should rollup txs from all peers', async () => {
//     // create the bootstrap node for the network
//     if (!bootstrapNodeEnr) {
//       throw new Error('Bootstrap node ENR is not available');
//     }

//     // Trigger re-execution
//     config.validatorReEx = true;

//     // create our network of nodes and submit txs into each of them
//     // the number of txs per node and the number of txs per rollup
//     // should be set so that the only way for rollups to be built
//     // is if the txs are successfully gossiped around the nodes.
//     const contexts: NodeContext[] = [];
//     const nodes: AztecNodeService[] = await createNodes(
//       config,
//       PEER_ID_PRIVATE_KEYS,
//       bootstrapNodeEnr,
//       NUM_NODES,
//       BOOT_NODE_UDP_PORT,
//     );

//     // wait a bit for peers to discover each other
//     await sleep(4000);

//     for (const node of nodes) {
//       const context = await createPXEServiceAndSubmitTransactions(node, NUM_TXS_PER_NODE);
//       contexts.push(context);
//     }

//     // now ensure that all txs were successfully mined
//     await Promise.all(
//       contexts.flatMap((context, i) =>
//         context.txs.map(async (tx, j) => {
//           logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
//           return tx.wait();
//         }),
//       ),
//     );

//     // shutdown all nodes.
//     await stopNodes(bootstrapNode, nodes);
//   });






// });
