import * as AztecJs from '@aztec/aztec.js';
import { AztecAddress, PrivateKey } from '@aztec/circuits.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { SchnorrSingleKeyAccountContractAbi, ZkTokenContractAbi } from '@aztec/noir-contracts/artifacts';

import Koa from 'koa';
import serve from 'koa-static';
import path, { dirname } from 'path';
import { Browser, Page, launch } from 'puppeteer';
import { fileURLToPath } from 'url';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from './fixtures.js';

declare global {
  interface Window {
    AztecJs: typeof AztecJs;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3000;

const { SANDBOX_URL } = process.env;

const conditionalDescribe = () => (SANDBOX_URL ? describe : describe.skip);
const hdAccount = mnemonicToAccount(MNEMONIC);
const privKeyRaw = hdAccount.getHdKey().privateKey;
const privKey = privKeyRaw === null ? null : new PrivateKey(Buffer.from(privKeyRaw));

conditionalDescribe()('e2e_aztec.js_browser', () => {
  const initialBalance = 33n;
  // const transferAmount = 3n;

  // let contractAddress: AztecAddress;

  let logger: DebugLogger;
  let app: Koa;
  let testClient: AztecJs.AztecRPC;

  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    testClient = AztecJs.createAztecRpcClient(SANDBOX_URL!, AztecJs.mustSucceedFetch);

    app = new Koa();
    app.use(serve(path.resolve(__dirname, './web')));
    app.listen(PORT, () => {
      logger(`Server started at http://localhost:${PORT}`);
    });

    logger = createDebugLogger('aztec:aztec.js:web');

    browser = await launch({
      headless: 'new',
      args: [
        '--allow-file-access-from-files',
        '--no-sandbox',
        '--headless',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disk-cache-dir=/dev/null',
      ],
    });
    page = await browser.newPage();
    page.on('console', msg => {
      logger('PAGE MSG:', msg.text());
    });
    page.on('pageerror', err => {
      logger('PAGE ERROR:', err.toString());
    });
    await page.goto(`http://localhost:${PORT}/index.html`);
  });

  afterAll(async () => {
    await browser.close();
  });

  it('Loads Aztec.js in the browser', async () => {
    const createAccountsExists = await page.evaluate(() => {
      const { createAccounts } = window.AztecJs;
      return typeof createAccounts === 'function';
    });
    expect(createAccountsExists).toBe(true);
  });
  it('Creates an account', async () => {
    const result = await page.evaluate(
      async (rpcUrl, privateKey, schnorrAbi) => {
        const { Fr, createAztecRpcClient, createAccounts, mustSucceedFetch } = window.AztecJs;
        const client = createAztecRpcClient(rpcUrl!, mustSucceedFetch);

        const salt = Fr.random();
        await createAccounts(client, schnorrAbi, privateKey!, salt);
        const accounts = (await client.getAccounts()) as AztecAddress[];
        return accounts[0].toString();
      },
      SANDBOX_URL,
      privKey,
      SchnorrSingleKeyAccountContractAbi,
      logger,
    );
    const account = (await testClient.getAccounts())[0];

    expect(result).toEqual(account.toString());
  });

  it('Deploys ZK Token contract', async () => {
    // const [txHash, balance] = await page.evaluate(
    const txHash = await page.evaluate(
      async (rpcUrl, initialBalance, ZkTokenContractAbi) => {
        const { ContractDeployer, createAztecRpcClient, mustSucceedFetch } = window.AztecJs;
        const client = createAztecRpcClient(rpcUrl!, mustSucceedFetch);
        const owner = (await client.getAccounts())[0];
        const publicKey = await client.getPublicKey(owner);
        const deployer = new ContractDeployer(ZkTokenContractAbi, client);
        const tx = deployer.deploy(initialBalance, owner, publicKey.toBigInts()).send();
        // const tx = new DeployMethod(publicKey, client, ZkTokenContractAbi, [33n, owner]).send();

        await tx.isMined();
        const receipt = await tx.getReceipt();

        return receipt.txHash.toString();
      },
      SANDBOX_URL,
      initialBalance,
      ZkTokenContractAbi,
    );
    const txResult = await testClient.getTxReceipt(AztecJs.TxHash.fromString(txHash));
    expect(txResult.status).toEqual(AztecJs.TxStatus.MINED);
  });

  it("Gets the owner's balance", async () => {
    // const result = await page.evaluate();
  });

  // it('Sends a transfer TX', async () => {
  //   const result = await page.evaluate(
  //     async (rpcUrl, transferAmount) => {
  //       const { Contract, createAztecRpcClient, mustSucceedFetch } = window.AztecJs;
  //       const client = createAztecRpcClient(rpcUrl!, mustSucceedFetch);
  //       const newA
  //     },
  //     SANDBOX_URL,
  //     transferAmount,
  //   );
  // });
});
