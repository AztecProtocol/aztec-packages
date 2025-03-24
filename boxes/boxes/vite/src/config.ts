import { getInitialTestAccounts } from "@aztec/accounts/testing/lazy";
import { getSchnorrAccount } from "@aztec/accounts/schnorr/lazy";
import {
  AccountWalletWithSecretKey,
  createAztecNodeClient,
} from "@aztec/aztec.js";
import {
  PXEServiceConfig,
  getPXEServiceConfig,
  PXEService,
  createPXEService,
} from "@aztec/pxe/client/lazy";

export class PrivateEnv {
  pxe: PXEService;
  wallet: AccountWalletWithSecretKey;

  constructor() {}

  async init() {
    const nodeURL = process.env.AZTEC_NODE_URL ?? "http://localhost:8080";

    const aztecNode = await createAztecNodeClient(nodeURL);
    const config = getPXEServiceConfig();
    config.dataDirectory = "pxe";
    config.proverEnabled = false;
    const l1Contracts = await aztecNode.getL1ContractAddresses();
    const configWithContracts = {
      ...config,
      l1Contracts,
    } as PXEServiceConfig;
    this.pxe = await createPXEService(aztecNode, configWithContracts);
    const [accountData] = await getInitialTestAccounts();
    const account = await getSchnorrAccount(
      this.pxe,
      accountData.secret,
      accountData.signingKey,
      accountData.salt,
    );
    await account.register();
    this.wallet = await account.getWallet();
  }

  async getWallet() {
    return this.wallet;
  }
}

export const deployerEnv = new PrivateEnv();
