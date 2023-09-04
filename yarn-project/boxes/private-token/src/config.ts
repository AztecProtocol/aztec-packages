import { createAztecRpcClient } from '@aztec/aztec.js';
import { PrivateTokenContractAbi } from './artifacts/PrivateToken.js'; // update this if using a different contract

export const contractAbi = PrivateTokenContractAbi;

const SANDBOX_URL = process.env.SANDBOX_URL || 'http://localhost:8080';
export const rpcClient = createAztecRpcClient(SANDBOX_URL);
