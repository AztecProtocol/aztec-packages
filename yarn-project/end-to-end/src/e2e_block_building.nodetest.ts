/* eslint-disable @typescript-eslint/no-floating-promises */
import { type AztecAddress, ContractDeployer, Fr } from '@aztec/aztec.js';
import { times } from '@aztec/foundation/collection';
import { StatefulTestContractArtifact } from '@aztec/noir-contracts.js';

import assert from 'node:assert';
import { after as afterAll, before as beforeAll, describe, it } from 'node:test';

import { type EndToEndContext, setup } from './fixtures/utils.js';

await describe('e2e_block_building', async () => {
  let ctx: EndToEndContext;

  beforeAll(async () => {
    ctx = await setup(2);
  });

  // afterEach(() => aztecNode.setConfig({ minTxsPerBlock: 1 }));
  afterAll(() => ctx.teardown());

  await it(
    'assembles a block with multiple txs',
    {
      timeout: 60_000,
    },
    async () => {
      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 8;
      await ctx.aztecNode.setConfig({ minTxsPerBlock: TX_COUNT });
      const deployer = new ContractDeployer(StatefulTestContractArtifact, ctx.wallet);
      const methods = times(TX_COUNT, i => deployer.deploy(ctx.wallet.getCompleteAddress().address, i));
      for (let i = 0; i < TX_COUNT; i++) {
        await methods[i].create({
          contractAddressSalt: new Fr(BigInt(i + 1)),
          skipClassRegistration: true,
          skipPublicDeployment: true,
        });
        await methods[i].prove({});
      }

      // Send them simultaneously to be picked up by the sequencer
      const txs = await Promise.all(methods.map(method => method.send()));
      ctx.logger.info(`Txs sent with hashes: `);
      for (const tx of txs) {
        ctx.logger.info(` ${await tx.getTxHash()}`);
      }

      // Await txs to be mined and assert they are all mined on the same block
      const receipts = await Promise.all(txs.map(tx => tx.wait()));
      // expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));
      assert.deepEqual(
        receipts.map(r => r.blockNumber),
        times(TX_COUNT, () => receipts[0].blockNumber),
      );

      // Assert all contracts got deployed
      const isContractDeployed = async (address: AztecAddress) => !!(await ctx.pxe.getContractInstance(address));
      const areDeployed = await Promise.all(receipts.map(r => isContractDeployed(r.contract.address)));
      // expect(areDeployed).toEqual(times(TX_COUNT, () => true));
      assert.deepEqual(
        areDeployed,
        times(TX_COUNT, () => true),
      );
    },
  );
});
