import { Fr } from '@aztec/foundation/fields';

//export type TracedContractCall = {
//  callPointer: Fr;
//  address: Fr;
//  storageAddress: Fr;
//  endLifetime: Fr;
//};
//
//export type TracedPublicStorageRead = {
//  callPointer: Fr;
//  storageAddress: Fr;
//  exists: boolean;
//  slot: Fr;
//  value: Fr;
//  counter: Fr;
//  endLifetime: Fr;
//};
//
//export type TracedPublicStorageWrite = {
//  callPointer: Fr;
//  storageAddress: Fr;
//  slot: Fr;
//  value: Fr;
//  counter: Fr;
//  endLifetime: Fr;
//};
//
//export type TracedNoteHashCheck = {
//  callPointer: Fr;
//  storageAddress: Fr;
//  leafIndex: Fr;
//  noteHash: Fr;
//  exists: boolean;
//  counter: Fr;
//  endLifetime: Fr;
//};
//
//export type TracedNoteHash = {
//  callPointer: Fr;
//  storageAddress: Fr;
//  noteHash: Fr;
//  counter: Fr;
//  endLifetime: Fr;
//};

export type TracedNullifierCheck = {
  callPointer: Fr;
  storageAddress: Fr;
  nullifier: Fr;
  exists: boolean;
  counter: Fr;
  endLifetime: Fr;
  // the fields below are relevant only to the public kernel
  // and are therefore omitted from VM inputs
  isPending: boolean;
  leafIndex: Fr;
};

//export type TracedNullifier = {
//  callPointer: Fr;
//  storageAddress: Fr;
//  nullifier: Fr;
//  counter: Fr;
//  endLifetime: Fr;
//};
//
//export type TracedL1toL2MessageRead = {
//  callPointer: Fr;
//  portal: Fr; // EthAddress
//  leafIndex: Fr;
//  msgKey: Fr;
//  exists: Fr;
//  message: []; // omitted from VM public inputs
//};
//
//export type TracedArchiveLeafCheck = {
//  leafIndex: Fr;
//  leaf: Fr;
//};
