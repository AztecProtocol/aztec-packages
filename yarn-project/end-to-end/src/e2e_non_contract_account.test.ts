import { ExtendedNote, Fr, type Logger, Note, type Wallet } from '@aztec/aztec.js';
import { TestContract } from '@aztec/noir-contracts.js/Test';

import { setup } from './fixtures/utils.js';

describe('e2e_non_contract_account', () => {
  let teardown: () => Promise<void>;

  let logger: Logger;

  let contract: TestContract;
  let wallet: Wallet;

  beforeEach(async () => {
    ({ teardown, wallet, logger } = await setup(1));

    logger.debug(`Deploying L2 contract...`);
    contract = await TestContract.deploy(wallet).send().deployed();
    logger.info(`L2 contract deployed at ${contract.address}`);
  });

  afterEach(() => teardown());

  // Note: This test doesn't really belong here as it doesn't have anything to do with non-contract accounts. I needed
  // to test the TestNote functionality and it doesn't really fit anywhere else. Creating a separate e2e test for this
  // seems wasteful. Move this test if a better place is found.
  it('can set and get a constant', async () => {
    const value = 123n;

    const { txHash, debugInfo } = await contract.methods
      .set_constant(value)
      .send()
      .wait({ interval: 0.1, debug: true });

    // check that 1 note hash was created
    expect(debugInfo!.noteHashes.length).toBe(1);

    // Add the note
    const note = new Note([new Fr(value)]);

    // We have to manually add the note because the note was not broadcasted.
    const extendedNote = new ExtendedNote(
      note,
      wallet.getCompleteAddress().address,
      contract.address,
      TestContract.storage.example_constant.slot,
      TestContract.notes.TestNote.id,
      txHash,
    );
    await wallet.addNote(extendedNote);

    expect(await contract.methods.get_constant().simulate()).toEqual(value);
  });
});
