import { type AccountWallet, type AztecAddress, Fr, type Logger } from '@aztec/aztec.js';
import { EasyPrivateVotingContract } from '@aztec/noir-contracts.js/EasyPrivateVoting';

import { setup } from './fixtures/utils.js';

describe('e2e_voting_contract', () => {
  let wallet: AccountWallet;

  let logger: Logger;
  let teardown: () => Promise<void>;

  let votingContract: EasyPrivateVotingContract;
  let owner: AztecAddress;

  beforeAll(async () => {
    // Setup environment
    ({ teardown, wallet, logger } = await setup(1));
    owner = wallet.getAddress();

    votingContract = await EasyPrivateVotingContract.deploy(wallet, owner).send().deployed();

    logger.info(`Counter contract deployed at ${votingContract.address}`);
  });

  afterAll(() => teardown());

  describe('votes', () => {
    it('votes, then tries to vote again', async () => {
      const candidate = new Fr(1);
      await votingContract.methods.cast_vote(candidate).send().wait();
      expect(await votingContract.methods.get_vote(candidate).simulate()).toBe(1n);

      // We try voting again, but our TX is dropped due to trying to emit duplicate nullifiers
      // first confirm that it fails simulation
      await expect(votingContract.methods.cast_vote(candidate).send().wait()).rejects.toThrow(/Nullifier collision/);
      // if we skip simulation, tx is dropped
      await expect(
        votingContract.methods.cast_vote(candidate).send({ skipPublicSimulation: true }).wait(),
      ).rejects.toThrow('Reason: Tx dropped by P2P node.');
    });
  });
});
