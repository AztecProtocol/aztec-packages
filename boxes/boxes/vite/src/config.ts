import { AztecAddress, createPXEClient, PXE, Wallet } from "@aztec/aztec.js";
import { getDeployedTestAccounts } from "@aztec/accounts/testing/lazy";
import { TestWallet } from "@aztec/test-wallet";

export class PrivateEnv {
  private wallet!: Wallet;
  private defaultAccountAddress!: AztecAddress;

  private constructor(private pxe: PXE) {}

  static create(pxeURL: string) {
    const pxe = createPXEClient(pxeURL);
    return new PrivateEnv(pxe);
  }

  async init() {
    const wallet = new TestWallet(this.pxe);

    const accountData = (await getDeployedTestAccounts(this.pxe))[0];
    if (!accountData) {
      console.error(
        "Account not found. Please connect the app to a testing environment with deployed and funded test accounts.",
      );
    }

    await wallet.createSchnorrAccount(
      accountData.secret,
      accountData.salt,
      accountData.signingKey,
    );
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

export const deployerEnv = PrivateEnv.create(
  process.env.PXE_URL || "http://localhost:8080",
);
