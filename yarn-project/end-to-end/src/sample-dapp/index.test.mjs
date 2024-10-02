import { createAccount } from '@aztec/accounts/testing';
import { Contract, ExtendedNote, Fr, Note, computeSecretHash, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

const { PXE_URL = 'http://localhost:8080', ETHEREUM_HOST = 'http://localhost:8545' } = process.env;

describe('token', () => {
  // docs:start:setup
  let owner, recipient, token;

  beforeAll(async () => {
    const pxe = createPXEClient(PXE_URL);
    await waitForPXE(pxe);
    owner = await createAccount(pxe);
    recipient = await createAccount(pxe);

    token = await TokenContract.deploy(owner, owner.getAddress(), 'TokenName', 'TKN', 18).send().deployed();

    const initialBalance = 69;
    const secret = Fr.random();
    const secretHash = await computeSecretHash(secret);
    const receipt = await token.methods.mint_private(initialBalance, secretHash).send().wait();

    const note = new Note([new Fr(initialBalance), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      owner.getAddress(),
      token.address,
      TokenContract.storage.pending_shields.slot,
      TokenContract.notes.TransparentNote.id,
      receipt.txHash,
    );

    await pxe.addNote(extendedNote, owner.getAddress());

    await token.methods.redeem_shield(owner.getAddress(), initialBalance, secret).send().wait();
  }, 120_000);
  // docs:end:setup

  // docs:start:test
  it('increases recipient funds on transfer', async () => {
    expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(0n);
    await token.methods.transfer(recipient.getAddress(), 20).send().wait();
    expect(await token.withWallet(recipient).methods.balance_of_private(recipient.getAddress()).simulate()).toEqual(
      20n,
    );
  }, 30_000);
  // docs:end:test
});
