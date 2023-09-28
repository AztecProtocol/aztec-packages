/* eslint-disable camelcase */
import { AztecNodeService } from '@aztec/aztec-node';
import { CheatCodes, Fr, Wallet } from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress } from '@aztec/circuits.js';
import { pedersenHashInputs, pedersenPlookupCommitInputs } from '@aztec/circuits.js/barretenberg';
import { StatefulTestContract } from '@aztec/noir-contracts/types';
import { PXE } from '@aztec/types';

import { setup } from './fixtures/utils.js';

describe('e2e_deploy_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let pxe: PXE;
  let accounts: CompleteAddress[];
  let wallet: Wallet;
  let teardown: () => Promise<void>;
  let cheatCodes: CheatCodes;

  let statefulContract: StatefulTestContract;

  beforeEach(async () => {
    ({ teardown, aztecNode, pxe, accounts, wallet, cheatCodes } = await setup());
    statefulContract = await StatefulTestContract.deploy(wallet, accounts[0].address, 1).send().deployed();
  }, 100_000);

  afterEach(() => teardown());

  it('Try to get a witness', async () => {
    if (!aztecNode) {
      throw new Error('No aztec node');
    }
    const owner = accounts[0].address;

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

    const circuitsWasm = await CircuitsWasm.get();
    
    // These functions should be the same after modifications to underlying.
    const h1 = (a: Fr, b: Fr) => Fr.fromBuffer(pedersenPlookupCommitInputs(circuitsWasm, [a.toBuffer(), b.toBuffer()])); // Matches noir
    const h2 = (a: Fr, b: Fr) => Fr.fromBuffer(pedersenHashInputs(circuitsWasm, [a.toBuffer(), b.toBuffer()])); // Matches kernel and circuits

    const commitment = new Fr(await statefulContract.methods.get_commitment(valueNote).view());
    const index = await aztecNode.findCommitmentIndex(commitment.toBuffer());
    const path = await statefulContract.methods.get_path(valueNote).view();
    const root = await statefulContract.methods.get_root(valueNote).view(); // computes root in noir using path

    const rootFromPath = (leaf: Fr, index: bigint, path: any[], hash: (a: Fr, b: Fr) => Fr) => {
      const temps: bigint[] = [];
      let node = leaf;
      let i = index;
      for (const sibling of path) {
        if (i % 2n === 0n) {
          node = hash(node, new Fr(sibling));
        } else {
          node = hash(new Fr(sibling), node);
        }

        temps.push(node.toBigInt());
        i /= 2n;
      }
      return node;
    };

    const myRootPedersenCommit = rootFromPath(commitment, index ?? 0n, path.slice(), h1);
    const myRootPedersenHash = rootFromPath(commitment, index ?? 0n, path.slice(), h2);

    const historic = await aztecNode.getHistoricBlockData();

    expect(historic.privateDataTreeRoot).toEqual(myRootPedersenCommit);
    expect(historic.privateDataTreeRoot).toEqual(myRootPedersenHash);
    expect(historic.privateDataTreeRoot).toEqual(new Fr(root));
  });
});
