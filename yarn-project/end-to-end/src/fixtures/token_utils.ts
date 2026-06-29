import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';

/**
 * Either token flavour. Canonical `TokenContract` uses constrained message delivery (production / docs
 * source of truth); `TestTokenContract` is its codegen'd unconstrained-delivery sibling, used by tests
 * where a token is just a unit-of-account vehicle. The two share an identical ABI, so helpers that only
 * read balances or mint accept either.
 */
export type AnyTokenContract = TokenContract | TestTokenContract;

export async function deployToken(wallet: Wallet, admin: AztecAddress, initialAdminBalance: bigint, logger: Logger) {
  logger.info(`Deploying Token contract...`);
  const { contract, instance } = await TokenContract.deploy(wallet, admin, 'TokenName', 'TokenSymbol', 18).send({
    from: admin,
  });

  if (initialAdminBalance > 0n) {
    await mintTokensToPrivate(contract, admin, admin, initialAdminBalance);
  }

  logger.info('L2 contract deployed');

  return { contract, instance };
}

/**
 * Deploys the unconstrained-delivery `TestTokenContract`. Use this in tests where the token is a
 * unit-of-account vehicle rather than the subject, so they don't pay constrained delivery's first-send
 * handshake cost (which distorts step/log counts that benches assert on). Use {@link deployToken} when a
 * test exercises canonical Token semantics or note discovery.
 */
export async function deployTestToken(
  wallet: Wallet,
  admin: AztecAddress,
  initialAdminBalance: bigint,
  logger: Logger,
) {
  logger.info(`Deploying TestToken contract...`);
  const { contract, instance } = await TestTokenContract.deploy(wallet, admin, 'TokenName', 'TokenSymbol', 18).send({
    from: admin,
  });

  if (initialAdminBalance > 0n) {
    await mintTokensToPrivate(contract, admin, admin, initialAdminBalance);
  }

  logger.info('L2 contract deployed');

  return { contract, instance };
}

export async function mintTokensToPrivate(
  token: AnyTokenContract,
  minter: AztecAddress,
  recipient: AztecAddress,
  amount: bigint,
  additionalScopes?: AztecAddress[],
) {
  await token.methods.mint_to_private(recipient, amount).send({ from: minter, additionalScopes });
}

export async function expectTokenBalance(
  wallet: Wallet,
  token: AnyTokenContract,
  owner: AztecAddress,
  expectedBalance: bigint,
  logger: Logger,
) {
  // Then check the balance
  const contractWithWallet = token.withWallet(wallet);
  const { result: balance } = await contractWithWallet.methods.balance_of_private(owner).simulate({ from: owner });
  logger.info(`Account ${owner} balance: ${balance}`);
  expect(balance).toBe(expectedBalance);
}

export async function mintNotes(
  wallet: Wallet,
  minter: AztecAddress,
  recipient: AztecAddress,
  asset: AnyTokenContract,
  noteAmounts: bigint[],
): Promise<bigint> {
  // We can only mint 5 notes at a time, since that's the maximum number of calls our entrypoints allow
  // TODO(#13024): mint as many notes as possible in a single tx
  const notesPerIteration = 5;
  for (let mintedNotes = 0; mintedNotes < noteAmounts.length; mintedNotes += notesPerIteration) {
    const toMint = noteAmounts.slice(mintedNotes, mintedNotes + notesPerIteration);
    const actions = toMint.map(amt => asset.methods.mint_to_private(recipient, amt));
    await new BatchCall(wallet, actions).send({ from: minter });
  }

  return noteAmounts.reduce((prev, curr) => prev + curr, 0n);
}
