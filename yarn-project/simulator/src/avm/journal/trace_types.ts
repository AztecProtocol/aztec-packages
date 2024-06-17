import { type Fr } from '@aztec/foundation/fields';
import { type ContractInstanceWithAddress } from '@aztec/types/contracts';

export type TracedPublicStorageWrite = {
  contractAddress: Fr;
  slot: Fr;
  value: Fr;
  counter: Fr;
  //  endLifetime: Fr;
};

export type TracedNoteHashCheck = {
  storageAddress: Fr;
  leafIndex: Fr;
  noteHash: Fr;
  exists: boolean;
  counter: Fr;
  // endLifetime: Fr;
};

export type TracedNoteHash = {
  storageAddress: Fr;
  noteHash: Fr;
  counter: Fr;
  //  endLifetime: Fr;
};

export type TracedNullifierCheck = {
  storageAddress: Fr;
  nullifier: Fr;
  exists: boolean;
  counter: Fr;
  // endLifetime: Fr;
  // the fields below are relevant only to the public kernel
  // and are therefore omitted from VM inputs
  isPending: boolean;
  leafIndex: Fr;
};

export type TracedNullifier = {
  storageAddress: Fr;
  nullifier: Fr;
  counter: Fr;
  // endLifetime: Fr;
};

export type TracedL1toL2MessageCheck = {
  leafIndex: Fr;
  msgHash: Fr;
  exists: boolean;
  counter: Fr;
  //endLifetime: Fr;
};

export type TracedUnencryptedL2Log = {
  logHash: Fr;
  counter: Fr;
  //endLifetime: Fr;
};

export type TracedContractInstance = { exists: boolean } & ContractInstanceWithAddress;
