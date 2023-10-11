import { createSandbox } from '@aztec/aztec-sandbox';
import { Contract, Fr, NotePreimage, computeMessageSecretHash, createAccount } from '@aztec/aztec.js';
import { TokenContractArtifact } from '@aztec/noir-contracts/artifacts';

describe('token', () => {
  // docs:start:setup
  let pxe, stop, owner, recipient, token;
  beforeAll(async () => {
    ({ pxe, stop } = await createSandbox());
    owner = await createAccount(pxe);
    recipient = await createAccount(pxe);

    token = await Contract.deploy(owner, TokenContractArtifact, [owner.getCompleteAddress()]).send().deployed();

    const initialBalance = 20n;
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);
    const receipt = await token.methods.mint_private(initialBalance, secretHash).send().wait();

    const storageSlot = new Fr(5);
    const preimage = new NotePreimage([new Fr(initialBalance), secretHash]);
    await pxe.addNote(owner.getAddress(), token.address, storageSlot, preimage, receipt.txHash);

    await token.methods.redeem_shield({ address: owner.getAddress() }, initialBalance, secret).send().wait();
  }, 120_000);

  afterAll(() => stop());
  // docs:end:setup

  // docs:start:test
  it('increases recipient funds on transfer', async () => {
    expect(await token.methods.balance_of_private(recipient.getAddress()).view()).toEqual(0n);
    await token.methods.transfer(owner.getAddress(), recipient.getAddress(), 20n, 0).send().wait();
    expect(await token.methods.balance_of_private(recipient.getAddress()).view()).toEqual(20n);
  });
  // docs:end:test
});
