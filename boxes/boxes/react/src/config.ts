import { Fr, createPXEClient, deriveMasterIncomingViewingSecretKey } from '@aztec/aztec.js';
import { BoxReactContractArtifact } from '../artifacts/BoxReact';
import { AccountManager } from '@aztec/aztec.js/account';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';

const SECRET_KEY = Fr.random();

export class PrivateEnv {
  private constructor(private accountManager: AccountManager) {}

  static async create(secretKey: Fr, pxeURL: string) {
    const pxe = createPXEClient(pxeURL);
    const encryptionPrivateKey = deriveMasterIncomingViewingSecretKey(secretKey);
    const accountContract = new SingleKeyAccountContract(encryptionPrivateKey);
    const accountManager = await AccountManager.create(pxe, secretKey, accountContract);

    return new PrivateEnv(accountManager);
  }

  async getWallet() {
    // taking advantage that register is no-op if already registered
    return await this.accountManager.register();
  }
}

export const deployerEnv = await PrivateEnv.create(SECRET_KEY, process.env.PXE_URL || 'http://localhost:8080');

const IGNORE_FUNCTIONS = ['constructor', 'compute_note_hash_and_optionally_a_nullifier'];
export const filteredInterface = BoxReactContractArtifact.functions.filter(f => !IGNORE_FUNCTIONS.includes(f.name));
