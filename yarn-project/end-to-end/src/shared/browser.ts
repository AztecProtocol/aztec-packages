/* eslint-disable no-console */
import type * as AztecAccountsSchnorr from '@aztec/accounts/schnorr';
import type * as AztecAccountsSingleKey from '@aztec/accounts/single_key';
import type * as AztecAccountsTesting from '@aztec/accounts/testing';
import * as AztecJs from '@aztec/aztec.js';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { contractArtifactToBuffer } from '@aztec/types/abi';

import getPort from 'get-port';
import { type Server } from 'http';
import Koa from 'koa';
import serve from 'koa-static';
import path, { dirname } from 'path';
import { type Browser, type Page, launch } from 'puppeteer-core';

declare global {
  /**
   * Helper interface to declare aztec.js within browser context.
   */
  interface Window {
    /**
     * The aztec.js library.
     */
    AztecJs: { Buffer: typeof Buffer } & typeof AztecJs &
      typeof AztecAccountsSingleKey &
      typeof AztecAccountsTesting &
      typeof AztecAccountsSchnorr;
  }
}

const __filename = AztecJs.fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const privKey = AztecJs.GrumpkinScalar.random();

export const browserTestSuite = (
  setup: () => Promise<{
    /**
     *  The webserver instance.
     */
    server: Server;
    /**
     * The webserver URL.
     */
    webServerURL: string;
    /**
     *  The PXE webserver instance.
     */
    pxeServer: Server | undefined;
    /**
     * The url of the PXE
     */
    pxeURL: string;
  }>,
  pageLogger: AztecJs.DebugLogger,
) =>
  describe('e2e_aztec.js_browser', () => {
    const initialBalance = 33n;
    const transferAmount = 3n;

    let contractAddress: AztecJs.AztecAddress;

    let app: Koa;
    let testClient: AztecJs.PXE;
    let server: Server;
    let webServerURL: string;
    let pxeServer: Server | undefined;
    let pxeURL: string;

    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
      ({ server, pxeURL, pxeServer, webServerURL } = await setup());
      testClient = AztecJs.createPXEClient(pxeURL);
      await AztecJs.waitForPXE(testClient);

      app = new Koa();
      app.use(serve(path.resolve(__dirname, './web')));

      const debuggingPort = await getPort({ port: 9222 });
      browser = await launch({
        executablePath: process.env.CHROME_BIN,
        headless: true,
        debuggingPort,
        args: [
          '--no-sandbox',
          '--headless',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-software-rasterizer',
          `--remote-debugging-port=${debuggingPort}`,
        ],
      });
      page = await browser.newPage();
      page.on('console', msg => {
        pageLogger.info(msg.text());
      });
      page.on('pageerror', err => {
        pageLogger.error(err.toString());
      });
      await page.goto(`${webServerURL}/index.html`);
      while (!(await page.evaluate(() => !!window.AztecJs))) {
        pageLogger.verbose('Waiting for window.AztecJs...');
        await AztecJs.sleep(1000);
      }
    });

    afterAll(async () => {
      await browser.close();
      server.close();
      pxeServer?.close();
    });

    it('Loads Aztec.js in the browser', async () => {
      const generatePublicKeyExists = await page.evaluate(() => {
        const { generatePublicKey } = window.AztecJs;
        return typeof generatePublicKey === 'function';
      });
      expect(generatePublicKeyExists).toBe(true);
    });

    it('Creates an account', async () => {
      const result = await page.evaluate(
        async (rpcUrl, secretKeyString) => {
          const { Fr, createPXEClient, getUnsafeSchnorrAccount } = window.AztecJs;
          const pxe = createPXEClient(rpcUrl!);
          const secretKey = Fr.fromString(secretKeyString);
          const account = getUnsafeSchnorrAccount(pxe, secretKey);
          await account.waitSetup();
          const completeAddress = account.getCompleteAddress();
          const addressString = completeAddress.address.toString();
          console.log(`Created Account: ${addressString}`);
          return addressString;
        },
        pxeURL,
        privKey.toString(),
      );
      const accounts = await testClient.getRegisteredAccounts();
      const stringAccounts = accounts.map(acc => acc.address.toString());
      expect(stringAccounts.includes(result)).toBeTruthy();
    });

    it('Deploys Token contract', async () => {
      await deployTokenContract();
    });

    it('Can access CompleteAddress class in browser', async () => {
      const result: string = await page.evaluate(() => {
        const completeAddress = window.AztecJs.CompleteAddress.fromString(
          '0x2401bfdad7ac9282bd612e8a6bb0f6ce125b08e317e24dc04ddbba24694ac2e7261249d8b3ad8ad9ed075257eede1dcd8356bfd55e1518f07717c47609194b6500c926582f07fda6a53e3600251f2aa1401c0cd377cef064f3f59045222194541acc5f62d8907a6dc98b85e32f8097a152c3c795bb3981c64e576b014f23005e0891d109aa087560cf8720ae94098827aa009a0bcee09f98fd2a05a7cbc6185402a53516a379d7856d26e3bb5542f1fe57f1ee5a0e4c60f7a463205aa19e2f8e00bce110b9a89857b79e3f70777e38a262b04cf80c56bd833a3c4b58dde7dbdc25c807c4012229e08651fd0d48cf9d966d9ab18826692f48a4cf934bef78614023e9cb95711f532786c7c78e72c3752f03f2a4cafc1846ad9df47324e2b7683f0faaa2e6fe44f3ff68646ce7d8538cb6935ce25472c4c75a244ab0c5d2e3b74d',
        );
        // NOTE: browser does not know how to serialize CompleteAddress for return, so return a string
        // otherwise returning a CompleteAddress makes result undefined.
        return completeAddress.toString();
      });
      expect(result).toBe(
        '0x2401bfdad7ac9282bd612e8a6bb0f6ce125b08e317e24dc04ddbba24694ac2e7261249d8b3ad8ad9ed075257eede1dcd8356bfd55e1518f07717c47609194b6500c926582f07fda6a53e3600251f2aa1401c0cd377cef064f3f59045222194541acc5f62d8907a6dc98b85e32f8097a152c3c795bb3981c64e576b014f23005e0891d109aa087560cf8720ae94098827aa009a0bcee09f98fd2a05a7cbc6185402a53516a379d7856d26e3bb5542f1fe57f1ee5a0e4c60f7a463205aa19e2f8e00bce110b9a89857b79e3f70777e38a262b04cf80c56bd833a3c4b58dde7dbdc25c807c4012229e08651fd0d48cf9d966d9ab18826692f48a4cf934bef78614023e9cb95711f532786c7c78e72c3752f03f2a4cafc1846ad9df47324e2b7683f0faaa2e6fe44f3ff68646ce7d8538cb6935ce25472c4c75a244ab0c5d2e3b74d',
      );
    });

    it("Gets the owner's balance", async () => {
      const result = await page.evaluate(
        async (rpcUrl, contractAddress, TokenContractArtifact) => {
          const {
            Contract,
            AztecAddress,
            createPXEClient: createPXEClient,
            getDeployedTestAccountsWallets,
          } = window.AztecJs;
          const pxe = createPXEClient(rpcUrl!);
          const [wallet] = await getDeployedTestAccountsWallets(pxe);
          const owner = wallet.getCompleteAddress().address;
          const contract = await Contract.at(AztecAddress.fromString(contractAddress), TokenContractArtifact, wallet);
          const balance = await contract.methods.balance_of_private(owner).simulate({ from: owner });
          return balance;
        },
        pxeURL,
        (await getTokenAddress()).toString(),
        TokenContractArtifact,
      );
      expect(result).toEqual(initialBalance);
    });

    it('Sends a transfer TX', async () => {
      const result = await page.evaluate(
        async (rpcUrl, contractAddress, transferAmount, TokenContractArtifact) => {
          console.log(`Starting transfer tx`);
          const {
            AztecAddress,
            Contract,
            createPXEClient: createPXEClient,
            getDeployedTestAccountsWallets,
            getUnsafeSchnorrAccount,
          } = window.AztecJs;
          const pxe = createPXEClient(rpcUrl!);
          const newReceiverAccount = await getUnsafeSchnorrAccount(pxe, AztecJs.Fr.random()).waitSetup();
          const receiverAddress = newReceiverAccount.getCompleteAddress().address;
          const [wallet] = await getDeployedTestAccountsWallets(pxe);
          const contract = await Contract.at(AztecAddress.fromString(contractAddress), TokenContractArtifact, wallet);
          await contract.methods.transfer(receiverAddress, transferAmount).send().wait();
          console.log(`Transferred ${transferAmount} tokens to new Account`);
          return await contract.methods.balance_of_private(receiverAddress).simulate({ from: receiverAddress });
        },
        pxeURL,
        (await getTokenAddress()).toString(),
        transferAmount,
        TokenContractArtifact,
      );
      expect(result).toEqual(transferAmount);
    });

    const deployTokenContract = async () => {
      const [txHash, tokenAddress] = await page.evaluate(
        async (rpcUrl, initialBalance, serializedTokenContractArtifact) => {
          const {
            DeployMethod,
            createPXEClient,
            getSchnorrAccount,
            Contract,
            getDeployedTestAccountsWallets,
            INITIAL_TEST_SECRET_KEYS,
            INITIAL_TEST_SIGNING_KEYS,
            INITIAL_TEST_ACCOUNT_SALTS,
            Buffer,
            contractArtifactFromBuffer,
          } = window.AztecJs;
          // We serialize the artifact since buffers (used for bytecode) do not cross well from one realm to another
          const TokenContractArtifact = contractArtifactFromBuffer(
            Buffer.from(serializedTokenContractArtifact, 'base64'),
          );
          const pxe = createPXEClient(rpcUrl!);

          // we need to ensure that a known account is present in order to create a wallet
          const knownAccounts = await getDeployedTestAccountsWallets(pxe);
          if (!knownAccounts.length) {
            const newAccount = await getSchnorrAccount(
              pxe,
              INITIAL_TEST_SECRET_KEYS[0],
              INITIAL_TEST_SIGNING_KEYS[0],
              INITIAL_TEST_ACCOUNT_SALTS[0],
            ).waitSetup();
            knownAccounts.push(newAccount);
          }
          const owner = knownAccounts[0];
          const tx = new DeployMethod(
            owner.getCompleteAddress().publicKeys,
            owner,
            TokenContractArtifact,
            (a: AztecJs.AztecAddress) => Contract.at(a, TokenContractArtifact, owner),
            [owner.getCompleteAddress(), 'TokenName', 'TKN', 18],
          ).send();
          const { contract: token, txHash } = await tx.wait();

          console.log(`Contract Deployed: ${token.address}`);

          // We mint tokens to the owner
          const from = owner.getAddress(); // we are setting from to owner here because of TODO(#9887)
          await token.methods.mint_to_private(from, owner.getAddress(), initialBalance).send().wait();

          return [txHash.toString(), token.address.toString()];
        },
        pxeURL,
        initialBalance,
        contractArtifactToBuffer(TokenContractArtifact).toString('base64'),
      );

      const txResult = await testClient.getTxReceipt(AztecJs.TxHash.fromString(txHash));
      expect(txResult.status).toEqual(AztecJs.TxStatus.SUCCESS);
      contractAddress = AztecJs.AztecAddress.fromString(tokenAddress);
    };

    const getTokenAddress = async () => {
      if (!contractAddress) {
        await deployTokenContract();
      }
      return contractAddress;
    };
  });
