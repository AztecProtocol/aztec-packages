import { GettingStartedContract } from '../artifacts/GettingStarted.js';
import {
  Fr,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';

const pxe = createPXEClient('http://localhost:8080');
await waitForPXE(pxe);

const wallets = await getInitialTestAccountsWallets(pxe);
const deployerWallet = wallets[0];

const contractDeploymentSalt = Fr.random();
const gettingStartedContract = await GettingStartedContract
  .deploy(deployerWallet)
  .send({ contractAddressSalt: contractDeploymentSalt }).wait();

console.log('Contract Address', gettingStartedContract.contract.address);
