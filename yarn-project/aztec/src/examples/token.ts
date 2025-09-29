import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { createAztecNodeClient } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet/server';

const logger = createLogger('example:token');

const nodeUrl = 'http://localhost:8080';

const node = createAztecNodeClient(nodeUrl);

const ALICE_MINT_BALANCE = 333n;
const TRANSFER_AMOUNT = 33n;

/**
 * Main function.
 */
async function main() {
  logger.info('Running token contract test on HTTP interface.');

  const wallet = await TestWallet.create(node);

  // During sandbox setup we deploy a few accounts. Below we add them to our wallet.
  const [aliceInitialAccountData, bobInitialAccountData] = await getInitialTestAccountsData();
  await wallet.createSchnorrAccount(aliceInitialAccountData.secret, aliceInitialAccountData.salt);
  await wallet.createSchnorrAccount(bobInitialAccountData.secret, bobInitialAccountData.salt);

  const alice = aliceInitialAccountData.address;
  const bob = bobInitialAccountData.address;

  logger.info(`Fetched Alice and Bob accounts: ${alice.toString()}, ${bob.toString()}`);

  logger.info('Deploying Token...');
  const token = await TokenContract.deploy(wallet, alice, 'TokenName', 'TokenSymbol', 18)
    .send({ from: alice })
    .deployed();
  logger.info('Token deployed');

  // Mint tokens to Alice
  logger.info(`Minting ${ALICE_MINT_BALANCE} more coins to Alice...`);
  await token.methods.mint_to_private(alice, ALICE_MINT_BALANCE).send({ from: alice }).wait();

  logger.info(`${ALICE_MINT_BALANCE} tokens were successfully minted by Alice and transferred to private`);

  const balanceAfterMint = await token.methods.balance_of_private(alice).simulate({ from: alice });
  logger.info(`Tokens successfully minted. New Alice's balance: ${balanceAfterMint}`);

  // We will now transfer tokens from Alice to Bob
  logger.info(`Transferring ${TRANSFER_AMOUNT} tokens from Alice to Bob...`);
  await token.methods.transfer(bob, TRANSFER_AMOUNT).send({ from: alice }).wait();

  // Check the new balances
  const aliceBalance = await token.methods.balance_of_private(alice).simulate({ from: alice });
  logger.info(`Alice's balance ${aliceBalance}`);

  const bobBalance = await token.methods.balance_of_private(bob).simulate({ from: bob });
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
