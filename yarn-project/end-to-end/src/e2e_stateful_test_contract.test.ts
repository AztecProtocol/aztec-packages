/* eslint-disable camelcase */
import { AztecNodeConfig, AztecNodeService, getConfigEnvVars } from '@aztec/aztec-node';
import { CheatCodes, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress } from '@aztec/circuits.js';
import { pedersenHashInputs, pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { StatefulTestContract } from '@aztec/noir-contracts/types';
import { PXE } from '@aztec/types';

import { setup } from './fixtures/utils.js';

describe('e2e_deploy_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let pxe: PXE;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;
  let wallet: Wallet;
  let teardown: () => Promise<void>;
  let cheatCodes: CheatCodes;

  let statefulContract: StatefulTestContract;

  beforeEach(async () => {
    ({ teardown, aztecNode, pxe, accounts, logger, wallet, cheatCodes } = await setup());
    statefulContract = await StatefulTestContract.deploy(wallet, accounts[0].address, 1).send().deployed();
  }, 100_000);

  afterEach(() => teardown());

  it('Try to get a witness', async () => {
    if (!aztecNode) {
      throw new Error('No aztec node');
    }
    const owner = accounts[0].address;

    console.log(`Historic: ${(await aztecNode.getHistoricBlockData()).privateDataTreeRoot.toBigInt()}`);

    const tx = statefulContract.methods.create_note(owner, 99n).send();
    const receipt = await tx.wait();

    const storageSlot = cheatCodes.aztec.computeSlotInMap(1n, owner);
    const notes = await pxe.getPrivateStorageAt(owner, statefulContract.address, storageSlot);
    const note = notes[1];

    const nonces = await pxe.getNoteNonces(statefulContract.address, storageSlot, note, receipt.txHash);

    const valueNote = {
      value: note.items[0],
      owner: note.items[1],
      randomness: note.items[2],
      header: {
        contract_address: statefulContract.address,
        nonce: nonces[0],
        storage_slot: storageSlot,
      },
    };

    const commitment = new Fr(await statefulContract.methods.get_commitment(valueNote).view());
    console.log(`Commitment: ${commitment}`);

    const index = await aztecNode.findCommitmentIndex(commitment.toBuffer());
    console.log(`Index: ${index}`);

    const circuitsWasm = await CircuitsWasm.get();
    // pedersenPlookupCommitInputs
    // const h = (a: Fr, b: Fr) => Fr.fromBuffer(pedersenPlookupCommitInputs(circuitsWasm, [a.toBuffer(), b.toBuffer()]));
    const h = (a: Fr, b: Fr) => Fr.fromBuffer(pedersenHashInputs(circuitsWasm, [a.toBuffer(), b.toBuffer()]));

    const path = await statefulContract.methods.get_path(valueNote).view();
    console.log(`Path: `, path);

    const historic = await aztecNode.getHistoricBlockData();
    const root = await statefulContract.methods.get_root(valueNote).view();
    console.log(`Historic: ${historic.privateDataTreeRoot.toBigInt()}, our computed: ${root}`);

    // Computing the root from path, using the `pedersenHashInputs`
    // crypto::pedersen_hash::lookup::hash_multiple function.
    // Noir is using:
    // crypto::pedersen_commitment::lookup::compress_native
    const rootFromPath = (leaf: Fr, index: bigint, path: any[]) => {
      const temps: bigint[] = [];
      let node = leaf;
      let i = index;
      for (const sibling of path) {
        if (i % 2n === 0n) {
          node = h(node, new Fr(sibling));
        } else {
          node = h(new Fr(sibling), node);
        }

        temps.push(node.toBigInt());
        i /= 2n;
      }
      console.log(temps);
      return node;
    };

    const myRoot = rootFromPath(commitment, index ?? 0n, path.slice());
    console.log(`Historic: ${historic.privateDataTreeRoot.toBigInt()}, myroot: ${myRoot.toBigInt()}`);
  });
});
