import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, NO_WAIT } from '@aztec/aztec.js/contracts';
import { publishContractClass } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { encodeCheckpointBlobDataFromBlocks } from '@aztec/blob-lib/encoding';
import { FIELDS_PER_BLOB } from '@aztec/constants';
import { AvmGadgetsTestContract } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { AvmTestContract } from '@aztec/noir-test-contracts.js/AvmTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { L2Block } from '@aztec/stdlib/block';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

describe('e2e_multiple_blobs', () => {
  let contract: TestContract;
  let logger: Logger;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
    ({
      logger,
      wallet,
      accounts: [defaultAccountAddress],
      aztecNode,
      aztecNodeAdmin: maybeAztecNodeAdmin,
      wallet,
      teardown,
    } = await setup(1, { ...PIPELINING_SETUP_OPTS }));
    aztecNodeAdmin = maybeAztecNodeAdmin!;

    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  it('includes multiple txs in a block that produces multiple blobs', async () => {
    // Increase the minimum number of txs per block so that all txs will be mined in the same block.
    const TX_COUNT = 3;
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: TX_COUNT });

    const provenTxs = [
      // 2 contract deployment txs.
      await publishContractClass(wallet, AvmTestContract.artifact),
      await publishContractClass(wallet, AvmGadgetsTestContract.artifact),
      // 1 tx to emit note hash, nullifier, l2_to_l1_message, private log and public log.
      // This tx alone will produce more than one blob's worth of data.
      new BatchCall(wallet, [
        contract.methods.call_create_note(123n, await AztecAddress.random(), Fr.random(), false),
        contract.methods.emit_nullifier(Fr.random()),
        contract.methods.create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random()),
        contract.methods.emit_array_as_encrypted_log(
          0n,
          Array.from({ length: 5 }).map(() => Fr.random()),
          defaultAccountAddress,
          true,
        ),
        contract.methods.emit_full_size_public_log(Fr.random()),
      ]),
    ];

    expect(provenTxs.length).toBe(TX_COUNT);

    // Send them simultaneously to be picked up by the sequencer
    const sendResults = await Promise.all(provenTxs.map(tx => tx.send({ from: defaultAccountAddress, wait: NO_WAIT })));
    // Wait for all to be mined
    const receipts = await Promise.all(
      sendResults.map(({ txHash }) => {
        return waitForTx(aztecNode, txHash);
      }),
    );
    // Check that all txs are in the same block.
    const blockNumber = receipts[0].blockNumber!;
    expect(receipts.every(r => r.blockNumber === blockNumber)).toBe(true);

    const response = (await aztecNode.getBlock(blockNumber, { includeTransactions: true }))!;
    const block = new L2Block(
      response.archive,
      response.header,
      response.body,
      response.checkpointNumber,
      response.indexWithinCheckpoint,
    );

    const numBlobFields = encodeCheckpointBlobDataFromBlocks([block.toBlockBlobData()]).length;
    const numBlobs = Math.ceil(numBlobFields / FIELDS_PER_BLOB);
    logger.info(
      `Block ${blockNumber} has ${provenTxs.length} txs, which produce ${numBlobFields} blob fields in ${numBlobs} blobs.`,
    );

    logger.info('Total size of side effects:');
    const numSideEffects = block.body.txEffects.reduce(
      (acc, tx) => ({
        noteHashes: acc.noteHashes + tx.noteHashes.length,
        nullifiers: acc.nullifiers + tx.nullifiers.length,
        l2ToL1Msgs: acc.l2ToL1Msgs + tx.l2ToL1Msgs.length,
        publicDataWrites: acc.publicDataWrites + tx.publicDataWrites.length,
        privateLogs: acc.privateLogs + tx.privateLogs.map(l => l.emittedLength).reduce((a, b) => a + b, 0),
        publicLogs: acc.publicLogs + tx.publicLogs.map(l => l.fields.length).reduce((a, b) => a + b, 0),
        contractClassLogs:
          acc.contractClassLogs + tx.contractClassLogs.map(l => l.emittedLength).reduce((a, b) => a + b, 0),
      }),
      {
        noteHashes: 0,
        nullifiers: 0,
        l2ToL1Msgs: 0,
        publicDataWrites: 0,
        privateLogs: 0,
        publicLogs: 0,
        contractClassLogs: 0,
      },
    );
    for (const key of Object.keys(numSideEffects)) {
      const value = numSideEffects[key as keyof typeof numSideEffects];
      logger.info(`${key}: ${value}`);
      // Check that at least one value is emitted for each side effect type, to ensure that we can successfully decode
      // all types of side effects.
      expect(value).toBeGreaterThan(0);
    }
    logger.info(
      `Block ${blockNumber} has ${provenTxs.length} txs, which produce ${numBlobFields} blob fields in ${numBlobs} blobs.`,
    );

    expect(numBlobs).toBeGreaterThan(1);
  });
});
