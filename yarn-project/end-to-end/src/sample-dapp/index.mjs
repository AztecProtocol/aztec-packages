// docs:start:imports
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { ExtendedNote, Fr, Note, computeSecretHash, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { fileURLToPath } from '@aztec/foundation/url';
import { TokenContract, TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { getToken } from './contracts.mjs';

// docs:end:imports

const { PXE_URL = 'http://localhost:8080' } = process.env;

// docs:start:showAccounts
async function showAccounts(pxe) {
  const accounts = await pxe.getRegisteredAccounts();
  console.log(`User accounts:\n${accounts.map(a => a.address).join('\n')}`);
}
// docs:end:showAccounts

// docs:start:showPrivateBalances
async function showPrivateBalances(pxe) {

  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  // docs:start:showPrivateBalances
  const accounts = await pxe.getRegisteredAccounts();

  for (const account of accounts) {
    // highlight-next-line:showPrivateBalances
    const balance = await token.methods.balance_of_private(account.address).simulate();
    console.log(`Balance of ${account.address}: ${balance}`);
  }
}
// docs:end:showPrivateBalances

// docs:start:mintPrivateFunds
async function mintPrivateFunds(pxe) {
  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  await showPrivateBalances(pxe);

  const mintAmount = 20n;
  const secret = Fr.random();
  const secretHash = await computeSecretHash(secret);
  const receipt = await token.methods.mint_private(mintAmount, secretHash).send().wait();

  const note = new Note([new Fr(mintAmount), secretHash]);
  const extendedNote = new ExtendedNote(
    note,
    owner.getAddress(),
    token.address,
    TokenContract.storage.pending_shields.slot,
    TokenContract.notes.TransparentNote.id,
    receipt.txHash,
  );

  await pxe.addNote(extendedNote, owner.getAddress());

  await token.withWallet(owner).methods.redeem_shield(owner.getAddress(), mintAmount, secret).send().wait();

  await showPrivateBalances(pxe);
}
// docs:end:mintPrivateFunds

// docs:start:transferPrivateFunds
async function transferPrivateFunds(pxe) {
  const [owner, recipient] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  await showPrivateBalances(pxe);
  console.log(`Sending transaction, awaiting transaction to be mined`);
  const receipt = await token.methods.transfer(recipient.getAddress(), 1).send().wait();

  console.log(`Transaction ${receipt.txHash} has been mined on block ${receipt.blockNumber}`);
  await showPrivateBalances(pxe);
}
// docs:end:transferPrivateFunds

// docs:start:showPublicBalances
async function showPublicBalances(pxe) {

  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  // docs:start:showPublicBalances
  const accounts = await pxe.getRegisteredAccounts();

  for (const account of accounts) {
    // highlight-next-line:showPublicBalances
    const balance = await token.methods.balance_of_public(account.address).simulate();
    console.log(`Balance of ${account.address}: ${balance}`);
  }
}
// docs:end:showPublicBalances

// docs:start:mintPublicFunds
async function mintPublicFunds(pxe) {
  const [owner] = await getInitialTestAccountsWallets(pxe);
  const token = await getToken(owner);

  await showPublicBalances(pxe);

  console.log(`Sending transaction, awaiting transaction to be mined`);
  const receipt = await token.methods.mint_public(owner.getAddress(), 100).send().wait();
  console.log(`Transaction ${receipt.txHash} has been mined on block ${receipt.blockNumber}`);

  await showPublicBalances(pxe);

  // docs:start:showLogs
  const blockNumber = await pxe.getBlockNumber();
  const logs = (await pxe.getUnencryptedLogs(blockNumber, 1)).logs;
  const textLogs = logs.map(extendedLog => extendedLog.toHumanReadable().slice(0, 200));
  for (const log of textLogs) console.log(`Log emitted: ${log}`);
  // docs:end:showLogs
}
// docs:end:mintPublicFunds

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  const { l1ChainId } = await pxe.getNodeInfo();
  console.log(`Connected to chain ${l1ChainId}`);

  await showAccounts(pxe);

  await mintPrivateFunds(pxe);

  await transferPrivateFunds(pxe);

  await mintPublicFunds(pxe);
}

// Execute main only if run directly
if (process.argv[1].replace(/\/index\.m?js$/, '') === fileURLToPath(import.meta.url).replace(/\/index\.m?js$/, '')) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(`Error in app: ${err}`);
      process.exit(1);
    });
}

export { main };
