import { AztecAddress, Fr, type L2Block } from '@aztec/aztec.js';
import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { EthAddress } from '@aztec/foundation/eth-address';

import { writeFile } from 'fs/promises';

const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;

/**
 * Creates a json object that can be used to test the solidity contract.
 * The json object must be put into
 */
export async function writeJson(
  fileName: string,
  block: L2Block,
  l1ToL2Content: Fr[],
  blobs: Blob[],
  batchedBlob: BatchedBlob,
  recipientAddress: AztecAddress,
  deployerAddress: `0x${string}`,
): Promise<void> {
  if (!AZTEC_GENERATE_TEST_DATA) {
    return;
  }
  // Path relative to the package.json in the end-to-end folder
  const path = `../../l1-contracts/test/fixtures/${fileName}.json`;

  const asHex = (value: Fr | Buffer | EthAddress | AztecAddress, size = 64) => {
    const buffer = Buffer.isBuffer(value) ? value : value.toBuffer();
    return `0x${buffer.toString('hex').padStart(size, '0')}`;
  };

  const jsonObject = {
    populate: {
      l1ToL2Content: l1ToL2Content.map(asHex),
      recipient: asHex(recipientAddress.toField()),
      sender: deployerAddress,
    },
    messages: {
      l2ToL1Messages: block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs).map(asHex),
    },
    block: {
      // The json formatting in forge is a bit brittle, so we convert Fr to a number in the few values below.
      // This should not be a problem for testing as long as the values are not larger than u32.
      archive: asHex(block.archive.root),
      blobCommitments: Blob.getPrefixedEthBlobCommitments(blobs),
      batchedBlobInputs: batchedBlob.getEthBlobEvaluationInputs(),
      blockNumber: block.number,
      body: `0x${block.body.toBuffer().toString('hex')}`,
      header: {
        lastArchiveRoot: asHex(block.header.lastArchive.root),
        contentCommitment: {
          blobsHash: asHex(block.header.contentCommitment.blobsHash),
          inHash: asHex(block.header.contentCommitment.inHash),
          outHash: asHex(block.header.contentCommitment.outHash),
        },
        slotNumber: Number(block.header.globalVariables.slotNumber),
        timestamp: Number(block.header.globalVariables.timestamp),
        coinbase: asHex(block.header.globalVariables.coinbase, 40),
        feeRecipient: asHex(block.header.globalVariables.feeRecipient),
        gasFees: {
          feePerDaGas: Number(block.header.globalVariables.gasFees.feePerDaGas),
          feePerL2Gas: Number(block.header.globalVariables.gasFees.feePerL2Gas),
        },
        totalManaUsed: block.header.totalManaUsed.toNumber(),
      },
      headerHash: asHex(block.getCheckpointHeader().hash()),
      numTxs: block.body.txEffects.length,
    },
  };

  const output = JSON.stringify(jsonObject, null, 2);
  await writeFile(path, output, 'utf8');
}
