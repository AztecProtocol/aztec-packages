import { AztecAddress, createAztecNodeClient, Wallet } from '@aztec/aztec.js';
import { TestWallet } from '@aztec/test-wallet/lazy';
import { getPXEServiceConfig, createPXEService } from '@aztec/pxe/client/lazy';
import { getInitialTestAccountsData } from '@aztec/accounts/testing';

export class PrivateEnv {
  private wallet!: Wallet;
  private defaultAccountAddress!: AztecAddress;

  constructor() {}

  async init() {
    const nodeURL = process.env.AZTEC_NODE_URL ?? 'http://localhost:8080';

    const aztecNode = await createAztecNodeClient(nodeURL);
    const config = getPXEServiceConfig();
    config.dataDirectory = 'pxe';
    config.proverEnabled = false;
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    };
    const pxe = await createPXEService(aztecNode, configWithContracts);
    const wallet = new TestWallet(pxe, aztecNode);

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
