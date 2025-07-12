import { type AztecAddress, BatchCall, type Logger, type Wallet } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

// docs:start:token_utils

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
  await tokenAsMinter.methods.mint_to_private(recipient, amount).send().wait();
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

export async function mintNotes(
  sender: Wallet,
  recipient: AztecAddress,
  asset: TokenContract,
  noteAmounts: bigint[],
): Promise<bigint> {
  // We can only mint 4 notes at a time, since that's the maximum number of calls our entrypoints allow
  // TODO(#13024): mint as many notes as possible in a single tx
  const notesPerIteration = 4;
  for (let mintedNotes = 0; mintedNotes < noteAmounts.length; mintedNotes += notesPerIteration) {
    const toMint = noteAmounts.slice(mintedNotes, mintedNotes + notesPerIteration);
    const actions = toMint.map(amt => asset.methods.mint_to_private(recipient, amt));
    await new BatchCall(sender, actions).send().wait();
  }

  return noteAmounts.reduce((prev, curr) => prev + curr, 0n);
}
