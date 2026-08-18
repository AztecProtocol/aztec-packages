import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TestERC20Abi } from '@aztec/l1-artifacts/TestERC20Abi';
import { TestERC20Bytecode } from '@aztec/l1-artifacts/TestERC20Bytecode';

import { type GetContractReturnType, type Hex, type PrivateKeyAccount, createPublicClient, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client, makeL1HttpTransport } from '../client.js';
import { watchContractEvent } from '../contracts/watch_event.js';
import { deployL1Contract } from '../deploy_l1_contract.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { type RecordingRpcServer, startRecordingRpcServer } from './recording_rpc_server.js';
import { type Anvil, startAnvil } from './start_anvil.js';

const POLLING_INTERVAL_MS = 100;

describe('watchContractEvent against anvil', () => {
  const logger = createLogger('ethereum:test:watch_contract_event');

  let anvil: Anvil | undefined;
  let rpcUrl: string;
  let recorder: RecordingRpcServer;
  let deployer: PrivateKeyAccount;
  let deployerClient: ExtendedViemWalletClient;
  let tokenAddress: Hex;
  let token: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;

  beforeAll(async () => {
    ({ anvil, rpcUrl } = await startAnvil({ port: 0 }));
    deployer = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    deployerClient = createExtendedL1Client([rpcUrl], deployer, foundry);

    const { address, txHash } = await deployL1Contract(deployerClient, TestERC20Abi, TestERC20Bytecode, [
      'test',
      'TST',
      deployer.address,
    ]);
    await deployerClient.waitForTransactionReceipt({ hash: txHash! });
    tokenAddress = address.toString();

    token = getContract({ address: tokenAddress, abi: TestERC20Abi, client: deployerClient });
    const addMinterHash = await token.write.addMinter([deployer.address]);
    await deployerClient.waitForTransactionReceipt({ hash: addMinterHash });
  });

  afterAll(async () => {
    await recorder?.close();
    await anvil?.stop();
  });

  it('delivers events by polling getLogs without installing server-side filters', async () => {
    recorder = await startRecordingRpcServer({ forwardTo: rpcUrl });
    const watcherClient = createPublicClient({
      chain: foundry,
      transport: makeL1HttpTransport([recorder.url]),
      pollingInterval: POLLING_INTERVAL_MS,
    });

    const received: bigint[] = [];
    const unwatch = watchContractEvent(watcherClient, logger, {
      address: tokenAddress,
      abi: TestERC20Abi,
      eventName: 'Transfer',
      onLog: log => received.push(log.args.value!),
    });

    try {
      // The watcher baselines its block cursor on its first tick, so only emit once it has ticked.
      await retryUntil(
        () => recorder.methods.filter(method => method === 'eth_blockNumber').length >= 1,
        'watcher block cursor baseline',
        10,
        0.05,
      );

      const mintHash = await token.write.mint([deployer.address, 100n]);
      await deployerClient.waitForTransactionReceipt({ hash: mintHash });

      await retryUntil(() => received.length > 0, 'transfer event', 20, 0.05);
    } finally {
      unwatch();
    }

    expect(received).toEqual([100n]);
    expect(recorder.methods).toContain('eth_getLogs');
    expect(recorder.methods).not.toContain('eth_newFilter');
    expect(recorder.methods).not.toContain('eth_getFilterChanges');
    expect(recorder.methods).not.toContain('eth_uninstallFilter');
  });
});
