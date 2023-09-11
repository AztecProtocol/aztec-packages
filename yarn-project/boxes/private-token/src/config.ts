import { createAztecRpcClient } from '@aztec/aztec.js';
import { PrivateTokenContractAbi } from './artifacts/PrivateToken.js'; // update this if using a different contract

export const contractAbi = PrivateTokenContractAbi;

const SANDBOX_URL = process.env.SANDBOX_URL || 'http://localhost:8080';
export const rpcClient = createAztecRpcClient(SANDBOX_URL);

export const CONTRACT_ADDRESS_PARAM_NAMES = ['owner', 'contract_address', 'recipient', 'preimage'];
export const FILTERED_FUNCTION_NAMES = ['compute_note_hash_and_nullifier'];

// ALICE smart contract wallet public key, available on sandbox by default
export const DEFAULT_PUBLIC_ADDRESS = '0x0c8a6673d7676cc80aaebe7fa7504cf51daa90ba906861bfad70a58a98bf5a7d';
