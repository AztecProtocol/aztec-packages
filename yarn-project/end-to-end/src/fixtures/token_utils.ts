// docs:start:token_utils
import { type AztecAddress, type Logger, type Wallet } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

export async function deployToken(adminWallet: Wallet, initialAdminBalance: bigint, logger: Logger) {
  logger.info(`Deploying Token contract...`);
  const contract = await TokenContract.deploy(adminWallet, adminWallet.getAddress(), 'TokenName', 'TokenSymbol', 18)
    .send()
    .deployed();

  if (initialAdminBalance > 0n) {
    // Minter is minting to herself so contract as minter is the same as contract as recipient
    await mintTokensToPrivate(contract, adminWallet, adminWallet.getAddress(), initialAdminBalance);
  }

  logger.info('L2 contract deployed');

  return contract;
}

export async function mintTokensToPrivate(
  token: TokenContract,
  minterWallet: Wallet,
  recipient: AztecAddress,
  amount: bigint,
) {
  const tokenAsMinter = await TokenContract.at(token.address, minterWallet);
  const from = minterWallet.getAddress(); // we are setting from to minter here because of TODO(#9887)
  await tokenAsMinter.methods.mint_to_private(from, recipient, amount).send().wait();
}
// docs:end:token_utils

export async function expectTokenBalance(
  wallet: Wallet,
  token: TokenContract,
  owner: AztecAddress,
  expectedBalance: bigint,
  logger: Logger,
) {
  // Then check the balance
  const contractWithWallet = await TokenContract.at(token.address, wallet);
  const balance = await contractWithWallet.methods.balance_of_private(owner).simulate({ from: owner });
  logger.info(`Account ${owner} balance: ${balance}`);
  expect(balance).toBe(expectedBalance);
}
