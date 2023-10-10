import { PXE, createPXEClient } from '@aztec/aztec.js';
import { ContractArtifact } from '@aztec/foundation/abi';
import { BlankContractArtifact } from './artifacts/blank.js';

// update this if using a different contract

export const contractAbi: ContractArtifact = BlankContractArtifact;

export const PXE_URL: string = process.env.PXE_URL || 'http://localhost:8080';
export const pxe: PXE = createPXEClient(PXE_URL);

export const CONTRACT_ADDRESS_PARAM_NAMES = ['address'];
