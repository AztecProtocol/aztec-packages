import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { PrivateVotingContract } from '@aztec/noir-contracts.js/PrivateVoting';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { setup } from './fixtures/utils.js';

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
    } = await setup(1));

    votingContract = await PrivateVotingContract.deploy(wallet, owner).send({ from: owner });

    logger.info(`Counter contract deployed at ${votingContract.address}`);
  });

  afterAll(() => teardown());

  describe('votes', () => {
    it('votes, then tries to vote again', async () => {
      const candidate = new Fr(1);
      const electionId = { id: Fr.random() };

      await votingContract.methods.start_vote(electionId).send({ from: owner });

      await votingContract.methods.cast_vote(electionId, candidate).send({ from: owner });
      expect(await votingContract.methods.get_tally(electionId, candidate).simulate({ from: owner })).toBe(1n);

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
