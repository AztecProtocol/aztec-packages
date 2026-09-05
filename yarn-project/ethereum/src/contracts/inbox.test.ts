import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { InboxAbi } from '@aztec/l1-artifacts/InboxAbi';

import { mock } from 'jest-mock-extended';
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  type Hex,
  encodeAbiParameters,
  encodeErrorResult,
  getContract,
  keccak256,
} from 'viem';
import { foundry } from 'viem/chains';

import { L1RpcError } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { type DeployAztecL1ContractsReturnType, deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ViemClient } from '../types.js';
import { InboxContract } from './inbox.js';
import { RollupContract } from './rollup.js';

describe('InboxContract', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let deployed: DeployAztecL1ContractsReturnType;
  let inbox: InboxContract;
  let version: bigint;

  beforeAll(async () => {
    const privateKeyRaw = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';
    ({ anvil, rpcUrl } = await startAnvil());
    cheatCodes = new EthCheatCodes([rpcUrl], new DateProvider());

    deployed = await deployAztecL1Contracts(rpcUrl, privateKeyRaw, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
    });
    inbox = InboxContract.getFromL1ContractsValues(deployed);
    version = await new RollupContract(deployed.l1Client, deployed.l1ContractAddresses.rollupAddress).getVersion();
  });

  afterAll(async () => {
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  /**
   * Sends `count` messages in one fresh L1 block, 12 seconds after the previous one so they open a new bucket, and
   * returns that bucket's sequence.
   */
  async function sendMessages(count: number): Promise<bigint> {
    const contract = getContract({
      address: deployed.l1ContractAddresses.inboxAddress.toString(),
      abi: InboxAbi,
      client: deployed.l1Client,
    });
    const { timestamp } = await deployed.l1Client.getBlock();
    await cheatCodes.warp(timestamp + 12n, { silent: true });
    await cheatCodes.setAutomine(false);
    const hashes: Hex[] = [];
    for (let i = 0; i < count; i++) {
      hashes.push(
        await contract.write.sendL2Message(
          [{ actor: Fr.random().toString(), version }, Fr.random().toString(), Fr.random().toString()],
          { gas: 1_000_000n },
        ),
      );
    }
    await cheatCodes.mine(1);
    await cheatCodes.setAutomine(true);
    for (const hash of hashes) {
      const receipt = await deployed.l1Client.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe('success');
    }
    return inbox.getCurrentBucketSeq();
  }

  describe('getBucketAtOrBeforeTotal', () => {
    it('resolves to the genesis bucket on an empty inbox', async () => {
      const found = await inbox.getBucketAtOrBeforeTotal(0n);
      expect(found?.seq).toBe(0n);
      expect(found?.bucket).toEqual(await inbox.getBucket(0n));

      const loose = await inbox.getBucketAtOrBeforeTotal(100n);
      expect(loose?.seq).toBe(0n);
    });

    it('resolves exact and interior bounds to the newest bucket at or below them', async () => {
      const first = await sendMessages(3);
      const second = await sendMessages(2);
      expect([first, second]).toEqual([1n, 2n]);

      const exact = await inbox.getBucketAtOrBeforeTotal(3n);
      expect(exact?.seq).toBe(1n);
      expect(exact?.bucket).toEqual(await inbox.getBucket(1n));
      expect(exact?.bucket.totalMsgCount).toBe(3n);

      const interior = await inbox.getBucketAtOrBeforeTotal(4n);
      expect(interior?.seq).toBe(1n);

      const newest = await inbox.getBucketAtOrBeforeTotal(5n);
      expect(newest?.seq).toBe(2n);
      expect(newest?.bucket.totalMsgCount).toBe(5n);

      const belowFirst = await inbox.getBucketAtOrBeforeTotal(2n);
      expect(belowFirst?.seq).toBe(0n);
    });

    // The ring has to wrap for a bound to fall below every live bucket, which no test can reach by sending messages.
    // Rewrite the Inbox's storage instead: a wrapped sequence counter with the newest probed entries and the oldest
    // live entry all ending past the bound, exactly the state the contract reverts on.
    it('resolves to undefined when every live bucket ends past the bound', async () => {
      const inboxAddress = deployed.l1ContractAddresses.inboxAddress;
      const current = await inbox.getContract().read.BUCKET_RING_SIZE();
      const oldest = 1n;
      // Slot 1 packs (currentBucketSeq, provenConsumedBucketSeq); a bucket's packed word sits one slot after its
      // `buckets` mapping entry and holds (totalMsgCount, timestamp, msgCount).
      const seqSlot = 1n;
      const totalsSlotOf = (seq: bigint) =>
        BigInt(keccak256(encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [seq % current, 0n]))) + 1n;
      const touched = [seqSlot, ...[current, current - 1n, current - 2n, current - 3n, oldest].map(totalsSlotOf)];
      const saved = await Promise.all(touched.map(slot => cheatCodes.load(inboxAddress, slot)));

      try {
        await cheatCodes.store(inboxAddress, seqSlot, current);
        for (const slot of touched.slice(1)) {
          await cheatCodes.store(inboxAddress, slot, 10n);
        }

        await expect(inbox.getBucketAtOrBeforeTotal(9n)).resolves.toBeUndefined();
        const hit = await inbox.getBucketAtOrBeforeTotal(10n);
        expect(hit?.seq).toBe(current);
        expect(hit?.bucket.totalMsgCount).toBe(10n);
      } finally {
        for (const [i, slot] of touched.entries()) {
          await cheatCodes.store(inboxAddress, slot, saved[i]);
        }
      }
      expect((await inbox.getBucketAtOrBeforeTotal(0n))?.seq).toBe(0n);
    });

    it('propagates reverts other than not-found and transport failures', async () => {
      const address = deployed.l1ContractAddresses.inboxAddress.toString();
      const revertWith = (errorName: 'Inbox__NoBucketAtOrBeforeTotal' | 'Inbox__BucketOutOfWindow') =>
        new ContractFunctionExecutionError(
          new ContractFunctionRevertedError({
            abi: InboxAbi,
            data: encodeErrorResult({ abi: InboxAbi, errorName, args: [3n, 7n] }),
            functionName: 'getBucketAtOrBeforeTotal',
          }),
          { abi: InboxAbi, functionName: 'getBucketAtOrBeforeTotal', args: [3n], contractAddress: address },
        );
      const failing = (err: Error) => {
        const client = mock<ViemClient>();
        client.readContract.mockRejectedValue(err);
        return new InboxContract(client, address);
      };

      await expect(failing(revertWith('Inbox__NoBucketAtOrBeforeTotal')).getBucketAtOrBeforeTotal(3n)).resolves.toBe(
        undefined,
      );
      await expect(failing(revertWith('Inbox__BucketOutOfWindow')).getBucketAtOrBeforeTotal(3n)).rejects.toThrow(
        /Inbox__BucketOutOfWindow/,
      );
      await expect(failing(new L1RpcError('L1 RPC request failed')).getBucketAtOrBeforeTotal(3n)).rejects.toThrow(
        /L1 RPC request failed/,
      );
    });
  });
});
