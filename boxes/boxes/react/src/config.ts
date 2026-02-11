import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

export class PrivateEnv {
  private wallet!: Wallet;
  private defaultAccountAddress!: AztecAddress;

  constructor() {}

  async init() {
    const nodeURL = process.env.AZTEC_NODE_URL ?? 'http://localhost:8080';

    const wallet = await EmbeddedWallet.create(nodeURL);

    const [accountData] = await getInitialTestAccountsData();
    if (!accountData) {
      console.error(
        'Account not found. Please connect the app to a testing environment with deployed and funded test accounts.',
      );
    }

    await wallet.createSchnorrAccount(accountData.secret, accountData.salt, accountData.signingKey);
    this.wallet = wallet;
    this.defaultAccountAddress = accountData.address;
  }

  async getWallet() {
    if (!this.wallet) {
      await this.init();
    }
    return this.wallet;
  }

  getDefaultAccountAddress() {
    return this.defaultAccountAddress;
  }
}

export const deployerEnv = new PrivateEnv();
