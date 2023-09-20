import { AztecRPC, createAztecRpcClient } from '@aztec/aztec.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { TokenContractAbi } from './artifacts/token.js'; // update this if using a different contract

export const contractAbi: ContractAbi = TokenContractAbi;

export const SANDBOX_URL: string = process.env.SANDBOX_URL || 'http://localhost:8080';
export const rpcClient: AztecRPC = createAztecRpcClient(SANDBOX_URL);

export const CONTRACT_ADDRESS_PARAM_NAMES = ['owner', 'contract_address', 'recipient'];
export const FILTERED_FUNCTION_NAMES = ['compute_note_hash_and_nullifier'];
