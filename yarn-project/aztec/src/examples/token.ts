import { getInitialTestAccountsData } from '@aztec/accounts/testing';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { EmbeddedWallet } from '@aztec/wallets/embedded';

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

  const wallet = await EmbeddedWallet.create(node);

  // During local network setup we create a few initializerless accounts. Below we add them to our wallet.
  const [aliceInitialAccountData, bobInitialAccountData] = await getInitialTestAccountsData();
  await wallet.createSchnorrInitializerlessAccount(
    aliceInitialAccountData.secret,
    aliceInitialAccountData.salt,
    aliceInitialAccountData.signingKey,
  );
  await wallet.createSchnorrInitializerlessAccount(
    bobInitialAccountData.secret,
    bobInitialAccountData.salt,
    bobInitialAccountData.signingKey,
  );

  const alice = aliceInitialAccountData.address;
  const bob = bobInitialAccountData.address;

  logger.info(`Fetched Alice and Bob accounts: ${alice.toString()}, ${bob.toString()}`);

  logger.info('Deploying Token...');
  const { contract: token } = await TokenContract.deploy(wallet, alice, 'TokenName', 'TokenSymbol', 18).send({
    from: alice,
  });
  logger.info('Token deployed');

  // Mint tokens to Alice
  logger.info(`Minting ${ALICE_MINT_BALANCE} more coins to Alice...`);
  await token.methods.mint_to_private(alice, ALICE_MINT_BALANCE).send({ from: alice });

  logger.info(`${ALICE_MINT_BALANCE} tokens were successfully minted by Alice and transferred to private`);

  const { result: balanceAfterMint } = await token.methods.balance_of_private(alice).simulate({ from: alice });
  logger.info(`Tokens successfully minted. New Alice's balance: ${balanceAfterMint}`);

  // We will now transfer tokens from Alice to Bob
  logger.info(`Transferring ${TRANSFER_AMOUNT} tokens from Alice to Bob...`);
  await token.methods.transfer(bob, TRANSFER_AMOUNT).send({ from: alice });

  // Check the new balances
  const { result: aliceBalance } = await token.methods.balance_of_private(alice).simulate({ from: alice });
  logger.info(`Alice's balance ${aliceBalance}`);

  const { result: bobBalance } = await token.methods.balance_of_private(bob).simulate({ from: bob });
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
