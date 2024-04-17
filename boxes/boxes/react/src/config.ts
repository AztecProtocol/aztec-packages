import { Fr, GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
import { BoxReactContractArtifact } from '../artifacts/BoxReact';
import { AccountManager } from '@aztec/aztec.js/account';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
import { sha512ToGrumpkinScalar } from '@aztec/foundation/crypto';
import { GeneratorIndex } from '@aztec/circuits.js/constants';

const SECRET_KEY = Fr.random();

export class PrivateEnv {
  pxe;
  accountContract;
  account: AccountManager;

  constructor(
    private secretKey: Fr,
    private pxeURL: string,
  ) {
    this.pxe = createPXEClient(this.pxeURL);
    // TODO(benesjan): implement separate function for computing this
    const encryptionPrivateKey = sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
    this.accountContract = new SingleKeyAccountContract(encryptionPrivateKey);
    this.account = new AccountManager(this.pxe, this.secretKey, this.accountContract);
  }

  async getWallet() {
    // taking advantage that register is no-op if already registered
    return await this.account.register();
  }
}

export const deployerEnv = new PrivateEnv(SECRET_KEY, process.env.PXE_URL || 'http://localhost:8080');

const IGNORE_FUNCTIONS = ['constructor', 'compute_note_hash_and_nullifier'];
export const filteredInterface = BoxReactContractArtifact.functions.filter(f => !IGNORE_FUNCTIONS.includes(f.name));
