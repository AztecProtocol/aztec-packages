import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { AztecAddress, Fr, SponsoredFeePaymentMethod, Tx, TxStatus, type Wallet } from '@aztec/aztec.js';
import type { UserFeeOptions } from '@aztec/entrypoints/interfaces';
import { asyncPool } from '@aztec/foundation/async-pool';
import { times, timesAsync } from '@aztec/foundation/collection';
import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { createPXEService } from '@aztec/pxe/server';
import {
  type AztecNode,
  type AztecNodeAdmin,
  createAztecNodeAdminClient,
  createAztecNodeClient,
} from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { makeTracedFetch } from '@aztec/telemetry-client';

import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress, registerSponsoredFPC } from '../fixtures/utils.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:mempool_limiter');

const pxeOptions = {
  dataDirectory: undefined,
  dataStoreMapSizeKB: 1024 ** 2, // max size is 1GB
};

const TX_FLOOD_SIZE = 100;
const TX_MEMPOOL_LIMIT = 25;
const CONCURRENCY = 25;

describe('mempool limiter test', () => {
  // we need a node to change its mempoolTxSize for this test
  let nodeAdmin: AztecNodeAdmin;
  // the regular API for the same node
  let node: AztecNode;

  let accountSecretKey: Fr;
  let accountSalt: Fr;
  let tokenContractAddress: AztecAddress;
  let sampleTx: Tx;

  let fee: UserFeeOptions;

  const forwardProcesses: ChildProcess[] = [];

  beforeAll(async () => {
    let NODE_URL: string;
    let NODE_ADMIN_URL: string;

    if (isK8sConfig(config)) {
      const nodeAdminFwd = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-full-node-admin`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_NODE_ADMIN_PORT,
      });

      const nodeFwd = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-full-node`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_NODE_PORT,
      });

      forwardProcesses.push(nodeAdminFwd.process, nodeFwd.process);
      NODE_ADMIN_URL = `http://127.0.0.1:${nodeAdminFwd.port}`;
      NODE_URL = `http://127.0.0.1:${nodeFwd.port}`;
    } else {
      NODE_ADMIN_URL = config.NODE_ADMIN_URL;
      NODE_URL = config.NODE_URL;
    }

    const fetch = makeTracedFetch(
      times(10, () => 1),
      false,
      makeUndiciFetch(new Agent({ connections: CONCURRENCY })),
    );
    nodeAdmin = createAztecNodeAdminClient(NODE_ADMIN_URL, {}, fetch);
    node = createAztecNodeClient(NODE_URL, {}, fetch);
  });

  beforeAll(async () => {
    debugLogger.debug(`Preparing account and token contract`);

    // set a large pool size so that deploy txs fit
    await nodeAdmin.setConfig({ maxTxPoolSize: 1e9 });

    const pxe = await createPXEService(node, pxeOptions);

    await registerSponsoredFPC(pxe);
    fee = {
      paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
    };

    accountSecretKey = Fr.fromHexString('0xcafe');
    accountSalt = Fr.ONE;
    const account = await getSchnorrAccount(pxe, accountSecretKey, deriveSigningKey(accountSecretKey), accountSalt);
    const meta = await pxe.getContractMetadata(account.getAddress());
    let wallet: Wallet;
    if (meta.isContractInitialized) {
      wallet = await account.register();
    } else {
      const res = await account.deploy({ fee }).wait();
      wallet = res.wallet;
    }

    debugLogger.info(`Deployed account: ${account.getAddress()}`);

    const tokenDeploy = TokenContract.deploy(wallet, wallet.getAddress(), 'TEST', 'T', 18);
    const token = await tokenDeploy.register({ contractAddressSalt: Fr.ONE });
    tokenContractAddress = token.address;

    const tokenMeta = await pxe.getContractMetadata(token.address);
    if (!tokenMeta.isContractInitialized) {
      await tokenDeploy.send({ contractAddressSalt: Fr.ONE, fee }).wait();
      debugLogger.info(`Deployed token contract: ${tokenContractAddress}`);

      await token.methods
        .mint_to_public(wallet.getAddress(), 10n ** 18n)
        .send({ fee })
        .wait();
      debugLogger.info(`Minted tokens`);
    } else {
      debugLogger.info(`Token contract already deployed at: ${token.address}`);
    }

    debugLogger.debug(`Calculating mempool limits`);

    const proventx = await token.methods
      .transfer_in_public(wallet.getAddress(), await AztecAddress.random(), 1, 0)
      .prove({ fee });
    sampleTx = proventx;
    const sampleTxSize = sampleTx.getSize();
    const maxTxPoolSize = TX_MEMPOOL_LIMIT * sampleTxSize;

    await nodeAdmin.setConfig({ maxTxPoolSize });

    debugLogger.info(`Sample tx size: ${sampleTxSize} bytes`);
    debugLogger.info(`Mempool limited to: ${maxTxPoolSize} bytes`);

    await pxe.stop();
  }, 240_000);

  afterAll(async () => {
    await nodeAdmin.setConfig({ maxTxPoolSize: 1e9 });
    forwardProcesses.forEach(p => p.kill());
  });

  it('evicts txs to keep mempool under specified limit', async () => {
    const txs = await timesAsync(TX_FLOOD_SIZE, async () => {
      const tx = Tx.fromBuffer(sampleTx.toBuffer());
      // this only works on unproven networks, otherwise this will fail verification
      tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = Fr.random();
      await tx.getTxHash(true);
      return tx;
    });

    await asyncPool(CONCURRENCY, txs, tx => node.sendTx(tx));
    const receipts = await asyncPool(CONCURRENCY, txs, async tx => node.getTxReceipt(await tx.getTxHash()));
    const pending = receipts.reduce((count, receipt) => (receipt.status === TxStatus.PENDING ? count + 1 : count), 0);
    expect(pending).toBeLessThanOrEqual(TX_MEMPOOL_LIMIT);
  }, 600_000);
});
