import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import type { FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter, L2Block } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { computeAddressSecret } from '@aztec/stdlib/keys';
import { DirectionalAppTaggingSecret, deriveEcdhSharedSecret } from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import type { NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';

import type {
  AddressDataProvider,
  AnchorBlockDataProvider,
  ContractDataProvider,
  NoteDataProvider,
} from '../../storage/index.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

// TODO: this might not be the final home for these functions,
// it's just a way of starting to dissolve PXEOracleInterface
export async function getContractInstance(
  address: AztecAddress,
  contractDataProvider: ContractDataProvider,
): Promise<ContractInstance> {
  const instance = await contractDataProvider.getContractInstance(address);
  if (!instance) {
    throw new Error(`No contract instance found for address ${address.toString()}`);
  }
  return instance;
}

export async function getFunctionArtifact(
  contractAddress: AztecAddress,
  selector: FunctionSelector,
  contractDataProvider: ContractDataProvider,
): Promise<FunctionArtifactWithContractName> {
  const artifact = await contractDataProvider.getFunctionArtifact(contractAddress, selector);
  if (!artifact) {
    throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
  }
  const debug = await contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
  return {
    ...artifact,
    debug,
  };
}

export async function getNotes(
  contractAddress: AztecAddress,
  owner: AztecAddress | undefined,
  storageSlot: Fr,
  status: NoteStatus,
  noteDataProvider: NoteDataProvider,
  scopes?: AztecAddress[],
) {
  const noteDaos = await noteDataProvider.getNotes({
    contractAddress,
    owner,
    storageSlot,
    status,
    scopes,
  });
  return noteDaos.map(
    ({ contractAddress, owner, storageSlot, randomness, noteNonce, note, noteHash, siloedNullifier, index }) => ({
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      note,
      noteHash,
      siloedNullifier,
      // PXE can use this index to get full MembershipWitness
      index,
    }),
  );
}

export async function getCompleteAddress(
  account: AztecAddress,
  addressDataProvider: AddressDataProvider,
): Promise<CompleteAddress> {
  const completeAddress = await addressDataProvider.getCompleteAddress(account);
  if (!completeAddress) {
    throw new Error(
      `No public key registered for address ${account}.
      Register it by calling pxe.addAccount(...).\nSee docs for context: https://docs.aztec.network/developers/resources/debugging/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
    );
  }
  return completeAddress;
}

export async function calculateDirectionalAppTaggingSecret(
  contractAddress: AztecAddress,
  sender: AztecAddress,
  recipient: AztecAddress,
  addressDataProvider: AddressDataProvider,
  keyStore: KeyStore,
) {
  const senderCompleteAddress = await getCompleteAddress(sender, addressDataProvider);
  const senderIvsk = await keyStore.getMasterIncomingViewingSecretKey(sender);
  return DirectionalAppTaggingSecret.compute(senderCompleteAddress, senderIvsk, recipient, contractAddress, recipient);
}

export async function getSharedSecret(
  address: AztecAddress,
  ephPk: Point,
  addressDataProvider: AddressDataProvider,
  keyStore: KeyStore,
): Promise<Point> {
  // TODO(#12656): return an app-siloed secret
  const recipientCompleteAddress = await getCompleteAddress(address, addressDataProvider);
  const ivskM = await keyStore.getMasterSecretKey(recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey);
  const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
  return deriveEcdhSharedSecret(addressSecret, ephPk);
}

/**
 * Fetches a message from the db, given its key.
 * @param contractAddress - Address of a contract by which the message was emitted.
 * @param messageHash - Hash of the message.
 * @param secret - Secret used to compute a nullifier.
 * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
 * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
 */
export async function getL1ToL2MembershipWitness(
  contractAddress: AztecAddress,
  messageHash: Fr,
  secret: Fr,
  aztecNode: AztecNode,
): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
  const [messageIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
    aztecNode,
    contractAddress,
    messageHash,
    secret,
  );

  // Assuming messageIndex is what you intended to use for the index in MessageLoadOracleInputs
  return new MessageLoadOracleInputs(messageIndex, siblingPath);
}

export async function getMembershipWitness(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  leafValue: Fr,
  aztecNode: AztecNode,
): Promise<Fr[]> {
  const witness = await tryGetMembershipWitness(blockNumber, treeId, leafValue, aztecNode);
  if (!witness) {
    throw new Error(`Leaf value ${leafValue} not found in tree ${MerkleTreeId[treeId]} at block ${blockNumber}`);
  }
  return witness;
}

async function tryGetMembershipWitness(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  value: Fr,
  aztecNode: AztecNode,
): Promise<Fr[] | undefined> {
  switch (treeId) {
    case MerkleTreeId.NULLIFIER_TREE:
      return (await aztecNode.getNullifierMembershipWitness(blockNumber, value))?.withoutPreimage().toFields();
    case MerkleTreeId.NOTE_HASH_TREE:
      return (await aztecNode.getNoteHashMembershipWitness(blockNumber, value))?.toFields();
    case MerkleTreeId.PUBLIC_DATA_TREE:
      return (await aztecNode.getPublicDataWitness(blockNumber, value))?.withoutPreimage().toFields();
    case MerkleTreeId.ARCHIVE:
      return (await aztecNode.getArchiveMembershipWitness(blockNumber, value))?.toFields();
    default:
      throw new Error('Not implemented');
  }
}

export async function getLowNullifierMembershipWitness(
  blockNumber: BlockParameter,
  nullifier: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<NullifierMembershipWitness | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return aztecNode.getLowNullifierMembershipWitness(blockNumber, nullifier);
}

export async function getBlock(
  blockNumber: BlockParameter,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<L2Block | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getBlock(blockNumber);
}

export function getNullifierMembershipWitness(
  blockNumber: BlockParameter,
  nullifier: Fr,
  aztecNode: AztecNode,
): Promise<NullifierMembershipWitness | undefined> {
  return aztecNode.getNullifierMembershipWitness(blockNumber, nullifier);
}

export async function getNullifierMembershipWitnessAtLatestBlock(
  nullifier: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
) {
  const blockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  return getNullifierMembershipWitness(blockNumber, nullifier, aztecNode);
}

export async function getPublicDataWitness(
  blockNumber: BlockParameter,
  leafSlot: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<PublicDataWitness | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getPublicDataWitness(blockNumber, leafSlot);
}

export async function getPublicStorageAt(
  blockNumber: BlockParameter,
  contract: AztecAddress,
  slot: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<Fr> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getPublicStorageAt(blockNumber, contract, slot);
}
