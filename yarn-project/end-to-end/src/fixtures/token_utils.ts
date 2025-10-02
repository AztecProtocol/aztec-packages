import { type AztecAddress, BatchCall, type Logger, type Wallet } from '@aztec/aztec.js';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

export async function deployToken(wallet: Wallet, admin: AztecAddress, initialAdminBalance: bigint, logger: Logger) {
  logger.info(`Deploying Token contract...`);
  const contract = await TokenContract.deploy(wallet, admin, 'TokenName', 'TokenSymbol', 18)
    .send({ from: admin })
    .deployed();

  if (initialAdminBalance > 0n) {
    await mintTokensToPrivate(contract, admin, admin, initialAdminBalance);
  }

  logger.info('L2 contract deployed');

  return contract;
}

export async function mintTokensToPrivate(
  token: TokenContract,
  minter: AztecAddress,
  recipient: AztecAddress,
  amount: bigint,
) {
  await token.methods.mint_to_private(recipient, amount).send({ from: minter }).wait();
}

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
  wallet: Wallet,
  minter: AztecAddress,
  recipient: AztecAddress,
  asset: TokenContract,
  noteAmounts: bigint[],
): Promise<bigint> {
  // We can only mint 5 notes at a time, since that's the maximum number of calls our entrypoints allow
  // TODO(#13024): mint as many notes as possible in a single tx
  const notesPerIteration = 5;
  for (let mintedNotes = 0; mintedNotes < noteAmounts.length; mintedNotes += notesPerIteration) {
    const toMint = noteAmounts.slice(mintedNotes, mintedNotes + notesPerIteration);
    const actions = toMint.map(amt => asset.methods.mint_to_private(recipient, amt));
    await new BatchCall(wallet, actions).send({ from: minter }).wait();
  }

  return noteAmounts.reduce((prev, curr) => prev + curr, 0n);
}
