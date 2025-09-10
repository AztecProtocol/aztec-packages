import { type AztecAddress, Fr, type Logger, type Wallet } from '@aztec/aztec.js';
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

    votingContract = await PrivateVotingContract.deploy(wallet, owner).send({ from: owner }).deployed();

    logger.info(`Counter contract deployed at ${votingContract.address}`);
  });

  afterAll(() => teardown());

  describe('votes', () => {
    it('votes, then tries to vote again', async () => {
      const candidate = new Fr(1);
      await votingContract.methods.cast_vote(candidate).send({ from: owner }).wait();
      expect(await votingContract.methods.get_vote(candidate).simulate({ from: owner })).toBe(1n);

      // We try voting again, but our TX is dropped due to trying to emit duplicate nullifiers
      // first confirm that it fails simulation
      await expect(votingContract.methods.cast_vote(candidate).simulate({ from: owner })).rejects.toThrow(
        /Nullifier collision/,
      );
      // if we skip simulation, tx fails
      await expect(votingContract.methods.cast_vote(candidate).send({ from: owner }).wait()).rejects.toThrow(
        TX_ERROR_EXISTING_NULLIFIER,
      );
    });
  });
});
