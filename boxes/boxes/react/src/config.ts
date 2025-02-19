import { createPXEClient, PXE } from '@aztec/aztec.js';
import { BoxReactContractArtifact } from '../artifacts/BoxReact';
import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';

export class PrivateEnv {
  private constructor(private pxe: PXE) {}

  static async create(pxeURL: string) {
    const pxe = createPXEClient(pxeURL);
    return new PrivateEnv(pxe);
  }

  async getWallet() {
    const wallet = (await getDeployedTestAccountsWallets(this.pxe))[0];
    if (!wallet) {
      console.error(
        'Wallet not found. Please connect the app to a testing environment with deployed and funded test accounts.',
      );
    }
    return wallet;
  }
}

export const deployerEnv = await PrivateEnv.create(process.env.PXE_URL || 'http://localhost:8080');

const IGNORE_FUNCTIONS = ['constructor', 'compute_note_hash_and_optionally_a_nullifier'];
export const filteredInterface = BoxReactContractArtifact.functions.filter(f => !IGNORE_FUNCTIONS.includes(f.name));
