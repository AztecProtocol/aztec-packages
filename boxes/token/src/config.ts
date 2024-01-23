import { ContractArtifact, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { TokenContractArtifact } from '../artifacts/Token.js';

class PXE {
  pxeUrl;
  pxe;

  constructor() {
    this.pxeUrl = process.env.PXE_URL || 'http://localhost:8080';
    this.pxe = createPXEClient(this.pxeUrl);
  }

  async setupPxe() {
    await waitForPXE(this.pxe);
    return this.pxe;
  }

  getPxeUrl() {
    return this.pxeUrl;
  }

  getPxe() {
    return this.pxe;
  }
}

export const pxe = new PXE();
export const contractArtifact: ContractArtifact = TokenContractArtifact;
export const CONTRACT_ADDRESS_PARAM_NAMES = ['owner', 'address', 'recipient'];
export const FILTERED_FUNCTION_NAMES = ['compute_note_hash_and_nullifier'];
