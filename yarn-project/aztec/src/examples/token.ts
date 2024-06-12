import { getSingleKeyAccount } from '@aztec/accounts/single_key';
import { type AccountWallet, Fr, Note, computeSecretHash, createPXEClient } from '@aztec/aztec.js';
import { ExtendedNote } from '@aztec/circuit-types';
import { createDebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

const logger = createDebugLogger('aztec:http-rpc-client');

export const alicePrivateKey = Fr.random();
export const bobPrivateKey = Fr.random();

const url = 'http://localhost:8080';

const pxe = createPXEClient(url);

let aliceWallet: AccountWallet;
let bobWallet: AccountWallet;

const ALICE_MINT_BALANCE = 333n;
const TRANSFER_AMOUNT = 33n;

/**
 * Main function.
 */
async function main() {
  logger.info('Running token contract test on HTTP interface.');

  aliceWallet = await getSingleKeyAccount(pxe, alicePrivateKey).waitSetup();
  bobWallet = await getSingleKeyAccount(pxe, bobPrivateKey).waitSetup();
  const alice = aliceWallet.getCompleteAddress();
  const bob = bobWallet.getCompleteAddress();

  logger.info(`Created Alice and Bob accounts: ${alice.address.toString()}, ${bob.address.toString()}`);

  logger.info('Deploying Token...');
  const token = await TokenContract.deploy(aliceWallet, alice, 'TokenName', 'TokenSymbol', 18).send().deployed();
  logger.info('Token deployed');

  // Create the contract abstraction and link it to Alice's and Bob's wallet for future signing
  const tokenAlice = await TokenContract.at(token.address, aliceWallet);
  const tokenBob = await TokenContract.at(token.address, bobWallet);

  // Mint tokens to Alice
  logger.info(`Minting ${ALICE_MINT_BALANCE} more coins to Alice...`);

  // Create a secret and a corresponding hash that will be used to mint funds privately
  const aliceSecret = Fr.random();
  const aliceSecretHash = computeSecretHash(aliceSecret);
  const receipt = await tokenAlice.methods.mint_private(ALICE_MINT_BALANCE, aliceSecretHash).send().wait();

  // Add the newly created "pending shield" note to PXE
  const pendingShieldsStorageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
  // `pending_shields` underlying note type is TransparentNote, with the following type id.
  const pendingShieldsNoteTypeId = new Fr(84114971101151129711410111011678111116101n);
  const note = new Note([new Fr(ALICE_MINT_BALANCE), aliceSecretHash]);
  const extendedNote = new ExtendedNote(
    note,
    alice.address,
    token.address,
    pendingShieldsStorageSlot,
    pendingShieldsNoteTypeId,
    receipt.txHash,
  );
  await pxe.addNote(extendedNote);

  // Make the tokens spendable by redeeming them using the secret (converts the "pending shield note" created above
  // to a "token note")
  await tokenAlice.methods.redeem_shield(alice, ALICE_MINT_BALANCE, aliceSecret).send().wait();
  logger.info(`${ALICE_MINT_BALANCE} tokens were successfully minted and redeemed by Alice`);

  const balanceAfterMint = await tokenAlice.methods.balance_of_private(alice).simulate();
  logger.info(`Tokens successfully minted. New Alice's balance: ${balanceAfterMint}`);

  // We will now transfer tokens from Alice to Bob
  logger.info(`Transferring ${TRANSFER_AMOUNT} tokens from Alice to Bob...`);
  await tokenAlice.methods.transfer(bob, TRANSFER_AMOUNT).send().wait();

  // Check the new balances
  const aliceBalance = await tokenAlice.methods.balance_of_private(alice).simulate();
  logger.info(`Alice's balance ${aliceBalance}`);

  const bobBalance = await tokenBob.methods.balance_of_private(bob).simulate();
  logger.info(`Bob's balance ${bobBalance}`);
}

main()
  .then(() => {
    logger.info('Finished running successfully.');
    process.exit(0);
  })
  .catch(err => {
    logger.error('Error in main fn: ', err);
    process.exit(1);
  });
