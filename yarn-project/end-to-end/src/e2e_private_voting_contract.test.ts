import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { PrivateVotingContract } from '@aztec/noir-contracts.js/PrivateVoting';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

// Verifies the PrivateVoting contract's nullifier-based double-vote prevention. Uses a single node
// with AutomineSequencer and one account.
describe('e2e_voting_contract', () => {
  let wallet: Wallet;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let votingContract: PrivateVotingContract;
  let owner: AztecAddress;

  beforeAll(async () => {
    // Setup environment
    ({
      teardown,
      wallet,
      logger,
      accounts: [owner],
    } = await setup(1, { ...AUTOMINE_E2E_OPTS }));

    ({ contract: votingContract } = await PrivateVotingContract.deploy(wallet, owner).send({ from: owner }));

    logger.info(`Counter contract deployed at ${votingContract.address}`);
  });

  afterAll(() => teardown());

  // Suite covering the cast_vote flow including double-vote rejection via existing-nullifier error.
  describe('votes', () => {
    // Starts a vote, casts once, then verifies the tally is 1. Attempts a second vote via simulate
    // (expects nullifier collision) and then via send (expects TX_ERROR_EXISTING_NULLIFIER).
    it('votes, then tries to vote again', async () => {
      const candidate = new Fr(1);
      const electionId = { id: Fr.random() };

      await votingContract.methods.start_vote(electionId).send({ from: owner });

      await votingContract.methods.cast_vote(electionId, candidate).send({ from: owner });
      expect((await votingContract.methods.get_tally(electionId, candidate).simulate({ from: owner })).result).toBe(1n);

      // We try voting again, but our TX is dropped due to trying to emit duplicate nullifiers
      // first confirm that it fails simulation
      await expect(votingContract.methods.cast_vote(electionId, candidate).simulate({ from: owner })).rejects.toThrow(
        /Nullifier collision|duplicate.*nullifier/,
      );
      // if we skip simulation, tx fails
      await expect(votingContract.methods.cast_vote(electionId, candidate).send({ from: owner })).rejects.toThrow(
        TX_ERROR_EXISTING_NULLIFIER,
      );
    });
  });
});
