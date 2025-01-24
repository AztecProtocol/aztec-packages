import { Fr, Wallet, createPXEClient } from '@aztec/aztec.js';

import { getDeployedTestAccountsWallets } from '@aztec/accounts/testing';
import { VanillaContract } from '../artifacts/Vanilla';

const pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');

let contract: any = null;
let wallet: Wallet | null = null;

const setWait = (state: boolean): void =>
  document.querySelectorAll('*').forEach((e: HTMLElement & HTMLButtonElement) => {
    e.style.cursor = state ? 'wait' : 'default';
    e.disabled = state;
  });

document.querySelector('#deploy').addEventListener('click', async ({ target }: any) => {
  setWait(true);
  wallet = (await getDeployedTestAccountsWallets(pxe))[0];
  if (!wallet) {
    alert('Wallet not found. Please connect the app to a testing environment with deployed and funded test accounts.');
  }

  contract = await VanillaContract.deploy(wallet, Fr.random(), wallet.getCompleteAddress().address)
    .send({ contractAddressSalt: Fr.random() })
    .deployed();
  alert(`Contract deployed at ${contract.address}`);

  target.hidden = true;
  document.querySelectorAll('#get, #set').forEach((e: HTMLButtonElement & HTMLFormElement) => (e.hidden = false));
  setWait(false);
});

document.querySelector('#set').addEventListener('submit', async (e: Event) => {
  e.preventDefault();
  setWait(true);

  const { value } = document.querySelector('#number') as HTMLInputElement;
  const { address: owner } = wallet.getCompleteAddress();
  await contract.methods.setNumber(parseInt(value), owner).send().wait();

  setWait(false);
  alert('Number set!');
});

document.querySelector('#get').addEventListener('click', async () => {
  const viewTxReceipt = await contract.methods.getNumber(wallet.getCompleteAddress().address).simulate();
  alert(`Number is: ${viewTxReceipt.value}`);
});
