import { getSingleKeyAccount } from '@aztec/accounts/single_key';
import { type AccountWallet, Fr, createPXEClient } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

const logger = createLogger('http-rpc-client');

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
  const from = aliceWallet.getAddress(); // we are setting from to Alice here because of TODO(#9887)
  await tokenAlice.methods.mint_to_private(from, aliceWallet.getAddress(), ALICE_MINT_BALANCE).send().wait();

  logger.info(`${ALICE_MINT_BALANCE} tokens were successfully minted by Alice and transferred to private`);

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
