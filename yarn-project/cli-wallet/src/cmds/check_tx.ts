import {
  type AztecAddress,
  type AztecNode,
  type ContractArtifact,
  type ExtendedNote,
  Fr,
  ProtocolContractAddress,
  type TxHash,
} from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { siloNullifier } from '@aztec/stdlib/hash';

import type { CLIWallet } from '../utils/wallet.js';

export async function checkTx(
  wallet: CLIWallet,
  aztecNode: AztecNode,
  txHash: TxHash,
  statusOnly: boolean,
  log: LogFn,
) {
  if (statusOnly) {
    const receipt = await aztecNode.getTxReceipt(txHash);
    return receipt.status;
  } else {
    await inspectTx(wallet, aztecNode, txHash, log);
  }
}

// The rest of the code here was copied over here from CLI because in CLI I needed to prune the inspect function of the PXE
// dependency when dropping PXE JSON RPC Server.

async function inspectTx(wallet: CLIWallet, aztecNode: AztecNode, txHash: TxHash, log: LogFn) {
  const [receipt, effectsInBlock] = await Promise.all([aztecNode.getTxReceipt(txHash), aztecNode.getTxEffect(txHash)]);
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
  const artifactMap = await getKnownArtifacts(wallet);

  log(` Block: ${receipt.blockNumber} (${receipt.blockHash?.toString()})`);
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
    log(`  Total: ${notes.length}`);
    for (const note of notes) {
      log(`  Note hash: ${note.toShortString()}`);
    }
  }

  // Nullifiers
  const nullifierCount = effects.nullifiers.length;
  const { deployNullifiers, initNullifiers, classNullifiers } = await getKnownNullifiers(wallet, artifactMap);
  if (nullifierCount > 0) {
    log(' Nullifiers:');
    for (const nullifier of effects.nullifiers) {
      const deployed = deployNullifiers[nullifier.toString()];
      const note = deployed
        ? (await wallet.getNotes({ siloedNullifier: nullifier, contractAddress: deployed }))[0]
        : undefined;
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

async function getKnownNullifiers(wallet: CLIWallet, artifactMap: ArtifactMap) {
  const knownContracts = await wallet.getContracts();
  const deployerAddress = ProtocolContractAddress.ContractInstanceRegistry;
  const classRegistryAddress = ProtocolContractAddress.ContractClassRegistry;
  const initNullifiers: Record<string, AztecAddress> = {};
  const deployNullifiers: Record<string, AztecAddress> = {};
  const classNullifiers: Record<string, string> = {};
  for (const contract of knownContracts) {
    initNullifiers[(await siloNullifier(contract, contract.toField())).toString()] = contract;
    deployNullifiers[(await siloNullifier(deployerAddress, contract.toField())).toString()] = contract;
  }
  for (const artifact of Object.values(artifactMap)) {
    classNullifiers[(await siloNullifier(classRegistryAddress, artifact.classId)).toString()] =
      `${artifact.name}Class<${artifact.classId}>`;
  }
  return { initNullifiers, deployNullifiers, classNullifiers };
}

type ArtifactMap = Record<string, ContractArtifactWithClassId>;
type ContractArtifactWithClassId = ContractArtifact & { classId: Fr };

async function getKnownArtifacts(wallet: CLIWallet): Promise<ArtifactMap> {
  const knownContractAddresses = await wallet.getContracts();
  const knownContracts = (
    await Promise.all(knownContractAddresses.map(contractAddress => wallet.getContractMetadata(contractAddress)))
  ).map(contractMetadata => contractMetadata.contractInstance);
  const classIds = [...new Set(knownContracts.map(contract => contract?.currentContractClassId))];
  const knownArtifacts = (
    await Promise.all(classIds.map(classId => (classId ? wallet.getContractClassMetadata(classId) : undefined)))
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
