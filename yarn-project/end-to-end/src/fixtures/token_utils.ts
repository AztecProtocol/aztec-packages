import { type AztecAddress, type DebugLogger, type Wallet, retryUntil } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js';

export async function deployToken(adminWallet: Wallet, initialAdminBalance: bigint, logger: DebugLogger) {
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
  await tokenAsMinter.methods.mint_to_private(recipient, amount).send().wait();
}

const awaitUserSynchronized = async (wallet: Wallet, owner: AztecAddress) => {
  const isUserSynchronized = async () => {
    return await wallet.isAccountStateSynchronized(owner);
  };
  await retryUntil(isUserSynchronized, `synch of user ${owner.toString()}`, 10);
};

export async function expectTokenBalance(
  wallet: Wallet,
  token: TokenContract,
  owner: AztecAddress,
  expectedBalance: bigint,
  logger: DebugLogger,
  checkIfSynchronized = true,
) {
  if (checkIfSynchronized) {
    // First wait until the corresponding PXE has synchronized the account
    await awaitUserSynchronized(wallet, owner);
  }

  // Then check the balance
  const contractWithWallet = await TokenContract.at(token.address, wallet);
  const balance = await contractWithWallet.methods.balance_of_private(owner).simulate({ from: owner });
  logger.info(`Account ${owner} balance: ${balance}`);
  expect(balance).toBe(expectedBalance);
}
