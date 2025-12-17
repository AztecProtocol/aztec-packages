import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import type { NoteStatus } from '@aztec/stdlib/note';

import type { AddressDataProvider, ContractDataProvider, NoteDataProvider } from '../../storage/index.js';

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
