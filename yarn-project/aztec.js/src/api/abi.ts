/**
 * Re-exports of ABI (Application Binary Interface) types and utilities for Aztec smart contracts.
 *
 * This module provides access to contract artifacts, function definitions, selectors,
 * and encoding/decoding utilities used throughout the Aztec ecosystem.
 *
 * @module api/abi
 */

export {
  type ContractArtifact,
  type FunctionArtifact,
  type FunctionAbi,
  EventSelector,
  FunctionType,
  FunctionSelector,
  FunctionCall,
  NoteSelector,
  type ABIParameter,
  decodeFromAbi,
  encodeArguments,
  type AbiType,
  isAddressStruct,
  isAztecAddressStruct,
  isEthAddressStruct,
  isWrappedFieldStruct,
  isFunctionSelectorStruct,
  loadContractArtifact,
  loadContractArtifactForPublic,
  getAllFunctionAbis,
  contractArtifactToBuffer,
  contractArtifactFromBuffer,
} from '@aztec/stdlib/abi';
export { type NoirCompiledContract } from '@aztec/stdlib/noir';