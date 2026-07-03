import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { ProtocolContractAddress } from '@aztec/aztec.js/protocol';
import type { TxHash } from '@aztec/aztec.js/tx';
import type { LogFn } from '@aztec/foundation/log';
import {
  computeSiloedPrivateInitializationNullifier,
  computeSiloedPublicInitializationNullifier,
  siloNullifier,
} from '@aztec/stdlib/hash';
import { NoteDao } from '@aztec/stdlib/note';

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
  const receipt = await aztecNode.getTxReceipt(txHash, { includeTxEffect: true });
  // Base tx data
  log(`Tx ${txHash.toString()}`);
  log(` Status: ${receipt.status}`);
  if (receipt.executionResult) {
    log(` Execution result: ${receipt.executionResult}`);
  }
  if (receipt.error) {
    log(` Error: ${receipt.error}`);
  }

  if (!receipt.isMined() || !receipt.txEffect) {
    return;
  }

  const effects = receipt.txEffect;
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
  const accounts = (await wallet.getAccounts()).map(a => a.item);
  if (nullifierCount > 0) {
    log(' Nullifiers:');
    for (const nullifier of effects.nullifiers) {
      const deployed = deployNullifiers[nullifier.toString()];
      const note = deployed
        ? (await wallet.getNotes({ siloedNullifier: nullifier, contractAddress: deployed, scopes: accounts }))[0]
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

function inspectNote(note: NoteDao, artifactMap: ArtifactMap, log: LogFn, text = 'Note') {
  const artifact = artifactMap[note.contractAddress.toString()];
  const contract = artifact?.name ?? note.contractAddress.toString();
  log(`  ${text} at ${contract}`);
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

  const [contractResults, classResults] = await Promise.all([
    Promise.all(knownContracts.map(contract => getContractNullifiers(wallet, contract))),
    Promise.all(Object.values(artifactMap).map(artifact => getClassNullifier(artifact))),
  ]);

  const initNullifiers: Record<string, AztecAddress> = {};
  const deployNullifiers: Record<string, AztecAddress> = {};
  const classNullifiers: Record<string, string> = {};

  for (const { contract, deployNullifier, privateInitNullifier, publicInitNullifier } of contractResults) {
    deployNullifiers[deployNullifier.toString()] = contract;
    if (privateInitNullifier) {
      initNullifiers[privateInitNullifier.toString()] = contract;
    }
    initNullifiers[publicInitNullifier.toString()] = contract;
  }
  for (const { nullifier, label } of classResults) {
    classNullifiers[nullifier.toString()] = label;
  }

  return { initNullifiers, deployNullifiers, classNullifiers };
}

async function getContractNullifiers(wallet: CLIWallet, contract: AztecAddress) {
  const deployerAddress = ProtocolContractAddress.ContractInstanceRegistry;
  const deployNullifier = await siloNullifier(deployerAddress, contract.toField());

  const metadata = await wallet.getContractMetadata(contract);
  const privateInitNullifier = metadata.instance
    ? await computeSiloedPrivateInitializationNullifier(contract, metadata.instance.initializationHash)
    : undefined;
  const publicInitNullifier = await computeSiloedPublicInitializationNullifier(contract);

  return { contract, deployNullifier, privateInitNullifier, publicInitNullifier };
}

async function getClassNullifier(artifact: ContractArtifactWithClassId) {
  const classRegistryAddress = ProtocolContractAddress.ContractClassRegistry;
  const nullifier = await siloNullifier(classRegistryAddress, artifact.classId);
  return { nullifier, label: `${artifact.name}Class<${artifact.classId}>` };
}

type ArtifactMap = Record<string, ContractArtifactWithClassId>;
type ContractArtifactWithClassId = ContractArtifact & { classId: Fr };

async function getKnownArtifacts(wallet: CLIWallet): Promise<ArtifactMap> {
  const knownContractAddresses = await wallet.getContracts();
  const knownContracts = await Promise.all(
    knownContractAddresses.map(contractAddress => wallet.getContractMetadata(contractAddress)),
  );
  const classIdFor = (metadata: (typeof knownContracts)[number]): Fr | undefined =>
    metadata.updatedContractClassId ?? metadata.instance?.originalContractClassId;
  const classIds = [...new Set(knownContracts.map(classIdFor))];
  const knownArtifacts = (
    await Promise.all(classIds.map(classId => (classId ? wallet.getContractArtifact(classId) : undefined)))
  ).map((artifact, index) => (artifact ? { ...artifact, classId: classIds[index] } : undefined));
  const map: Record<string, ContractArtifactWithClassId> = {};
  for (const metadata of knownContracts) {
    const classId = classIdFor(metadata);
    if (metadata.instance && classId) {
      const artifact = knownArtifacts.find(a => a?.classId?.equals(classId)) as ContractArtifactWithClassId;
      if (artifact) {
        map[metadata.instance.address.toString()] = artifact;
      }
    }
  }
  return map;
}
