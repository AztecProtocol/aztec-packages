import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import { InboxAbi } from '@aztec/l1-artifacts/InboxAbi';

import { type Hex, getContract } from 'viem';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { type DeployAztecL1ContractsReturnType, deployAztecL1Contracts } from '../deploy_aztec_l1_contracts.js';
import { EthCheatCodes } from '../test/eth_cheat_codes.js';
import type { Anvil } from '../test/start_anvil.js';
import { startAnvil } from '../test/start_anvil.js';
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
  });
});
