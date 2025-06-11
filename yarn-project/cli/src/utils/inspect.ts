import type { AztecAddress, ContractArtifact, Fr } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import { type ExtendedNote, NoteStatus } from '@aztec/stdlib/note';
import type { TxHash } from '@aztec/stdlib/tx';

export async function inspectBlock(pxe: PXE, blockNumber: number, log: LogFn, opts: { showTxs?: boolean } = {}) {
  const block = await pxe.getBlock(blockNumber);
  if (!block) {
    log(`No block found for block number ${blockNumber}`);
    return;
  }

  const blockHash = await block.hash();
  log(`Block ${blockNumber} (${blockHash.toString()})`);
  log(` Total fees: ${block.header.totalFees.toBigInt()}`);
  log(` Total mana used: ${block.header.totalManaUsed.toBigInt()}`);
  log(
    ` Fee per gas unit: DA=${block.header.globalVariables.gasFees.feePerDaGas} L2=${block.header.globalVariables.gasFees.feePerL2Gas}`,
  );
  log(` Coinbase: ${block.header.globalVariables.coinbase}`);
  log(` Fee recipient: ${block.header.globalVariables.feeRecipient}`);
  log(` Timestamp: ${new Date(block.header.globalVariables.timestamp.toNumber() * 500)}`);
  if (opts.showTxs) {
    log(``);
    const artifactMap = await getKnownArtifacts(pxe);
    for (const txHash of block.body.txEffects.map(tx => tx.txHash)) {
      await inspectTx(pxe, txHash, log, { includeBlockInfo: false, artifactMap });
    }
  } else {
    log(` Transactions: ${block.body.txEffects.length}`);
  }
}

export async function inspectTx(
  pxe: PXE,
  txHash: TxHash,
  log: LogFn,
  opts: { includeBlockInfo?: boolean; artifactMap?: ArtifactMap } = {},
) {
  const [receipt, effectsInBlock, getNotes] = await Promise.all([
    pxe.getTxReceipt(txHash),
    pxe.getTxEffect(txHash),
    pxe.getNotes({ txHash, status: NoteStatus.ACTIVE_OR_NULLIFIED }),
  ]);
  // Base tx data
  log(`Tx ${txHash.toString()}`);
  log(` Status: ${receipt.status} ${effectsInBlock ? `(${effectsInBlock.data.revertCode.getDescription()})` : ''}`);
  if (receipt.error) {
    log(` Error: ${receipt.error}`);
  }

  if (!effectsInBlock) {
    return;
  }

  const effects = effectsInBlock.data;
  const artifactMap = opts?.artifactMap ?? (await getKnownArtifacts(pxe));

  if (opts.includeBlockInfo) {
    log(` Block: ${receipt.blockNumber} (${receipt.blockHash?.toString()})`);
  }
  if (receipt.transactionFee) {
    log(` Fee: ${receipt.transactionFee.toString()}`);
  }

  // Public logs
  const publicLogs = effects.publicLogs;
  if (publicLogs.length > 0) {
    log(' Logs:');
    for (const publicLog of publicLogs) {
      log(`  ${publicLog.toHumanReadable()}`);
    }
  }

  // Public data writes
  const writes = effects.publicDataWrites;
  if (writes.length > 0) {
    log(' Public data writes:');
    for (const write of writes) {
      log(`  Leaf ${write.leafSlot.toString()} = ${write.value.toString()}`);
    }
  }

  // Created notes
  const notes = effects.noteHashes;
  if (notes.length > 0) {
    log(' Created notes:');
    log(`  Total: ${notes.length}. Found: ${getNotes.length}.`);
    if (getNotes.length) {
      log('  Found notes:');
      for (const note of getNotes) {
        inspectNote(note, artifactMap, log);
      }
    }
  }

  // Nullifiers
  const nullifierCount = effects.nullifiers.length;
  const { deployNullifiers, initNullifiers, classNullifiers } = await getKnownNullifiers(pxe, artifactMap);
  if (nullifierCount > 0) {
    log(' Nullifiers:');
    for (const nullifier of effects.nullifiers) {
      const [note] = await pxe.getNotes({ siloedNullifier: nullifier });
      const deployed = deployNullifiers[nullifier.toString()];
      const initialized = initNullifiers[nullifier.toString()];
      const registered = classNullifiers[nullifier.toString()];
      if (nullifier.toBuffer().equals(txHash.toBuffer())) {
        log(`  Transaction hash nullifier ${nullifier.toShortString()}`);
      } else if (note) {
        inspectNote(note, artifactMap, log, `Nullifier ${nullifier.toShortString()} for note`);
      } else if (deployed) {
        log(
          `  Contract ${toFriendlyAddress(deployed, artifactMap)} deployed via nullifier ${nullifier.toShortString()}`,
        );
      } else if (initialized) {
        log(
          `  Contract ${toFriendlyAddress(
            initialized,
            artifactMap,
          )} initialized via nullifier ${nullifier.toShortString()}`,
        );
      } else if (registered) {
        log(`  Class ${registered} registered via nullifier ${nullifier.toShortString()}`);
      } else {
        log(`  Unknown nullifier ${nullifier.toString()}`);
      }
    }
  }

  // L2 to L1 messages
  if (effects.l2ToL1Msgs.length > 0) {
    log(` L2 to L1 messages:`);
    for (const msg of effects.l2ToL1Msgs) {
      log(`  ${msg.toString()}`);
    }
  }
}

function inspectNote(note: ExtendedNote, artifactMap: ArtifactMap, log: LogFn, text = 'Note') {
  const artifact = artifactMap[note.contractAddress.toString()];
  const contract = artifact?.name ?? note.contractAddress.toString();
  log(`  ${text} at ${contract}`);
  log(`    Recipient: ${toFriendlyAddress(note.recipient, artifactMap)}`);
  for (const field of note.note.items) {
    log(`    ${field.toString()}`);
  }
}

function toFriendlyAddress(address: AztecAddress, artifactMap: ArtifactMap) {
  const artifact = artifactMap[address.toString()];
  if (!artifact) {
    return address.toString();
  }

  return `${artifact.name}<${address.toString()}>`;
}

async function getKnownNullifiers(pxe: PXE, artifactMap: ArtifactMap) {
  const knownContracts = await pxe.getContracts();
  const deployerAddress = ProtocolContractAddress.ContractInstanceDeployer;
  const registererAddress = ProtocolContractAddress.ContractClassRegisterer;
  const initNullifiers: Record<string, AztecAddress> = {};
  const deployNullifiers: Record<string, AztecAddress> = {};
  const classNullifiers: Record<string, string> = {};
  for (const contract of knownContracts) {
    initNullifiers[(await siloNullifier(contract, contract.toField())).toString()] = contract;
    deployNullifiers[(await siloNullifier(deployerAddress, contract.toField())).toString()] = contract;
  }
  for (const artifact of Object.values(artifactMap)) {
    classNullifiers[(await siloNullifier(registererAddress, artifact.classId)).toString()] =
      `${artifact.name}Class<${artifact.classId}>`;
  }
  return { initNullifiers, deployNullifiers, classNullifiers };
}

type ArtifactMap = Record<string, ContractArtifactWithClassId>;
type ContractArtifactWithClassId = ContractArtifact & { classId: Fr };
async function getKnownArtifacts(pxe: PXE): Promise<ArtifactMap> {
  const knownContractAddresses = await pxe.getContracts();
  const knownContracts = (
    await Promise.all(knownContractAddresses.map(contractAddress => pxe.getContractMetadata(contractAddress)))
  ).map(contractMetadata => contractMetadata.contractInstance);
  const classIds = [...new Set(knownContracts.map(contract => contract?.currentContractClassId))];
  const knownArtifacts = (
    await Promise.all(classIds.map(classId => (classId ? pxe.getContractClassMetadata(classId) : undefined)))
  ).map(contractClassMetadata =>
    contractClassMetadata
      ? { ...contractClassMetadata.artifact, classId: contractClassMetadata.contractClass?.id }
      : undefined,
  );
  const map: Record<string, ContractArtifactWithClassId> = {};
  for (const instance of knownContracts) {
    if (instance) {
      const artifact = knownArtifacts.find(a =>
        a?.classId?.equals(instance.currentContractClassId),
      ) as ContractArtifactWithClassId;
      if (artifact) {
        map[instance.address.toString()] = artifact;
      }
    }
  }
  return map;
}
