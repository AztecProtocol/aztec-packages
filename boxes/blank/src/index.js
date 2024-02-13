import { GrumpkinScalar, createPXEClient, AccountManager, ContractDeployer, Fr } from '@aztec/aztec.js';

import { SingleKeyAccountContract } from '@aztec/accounts/single_key';
import { BlankContract } from '../artifacts/build/artifacts/Blank.js';

const privateKey = GrumpkinScalar.random();
const pxe = createPXEClient(process.env.PXE_URL || 'http://localhost:8080');
const account = new AccountManager(pxe, privateKey, new SingleKeyAccountContract(privateKey));
let contract = null;

const setWait = state =>
  document.querySelectorAll('*').forEach(e => {
    e.style.cursor = state ? 'wait' : 'default';
    e.disabled = state;
  });

document.querySelector('#deploy').addEventListener('click', async ({ target }) => {
  setWait(true);
  window.wallet = await account.register();

  const { artifact, at } = BlankContract;
  const contractDeployer = new ContractDeployer(artifact, pxe);
  const { contractAddress } = await contractDeployer
    .deploy(Fr.random(), (await window.wallet.getCompleteAddress()).address)
    .send({ contractAddressSalt: Fr.random() })
    .wait();
  contract = await at(contractAddress, window.wallet);
  alert(`Contract deployed at ${contractAddress}`);

  target.hidden = true;
  document.querySelectorAll('#get, #set').forEach(e => (e.hidden = false));
  setWait(false);
});

document.querySelector('#set').addEventListener('submit', async e => {
  e.preventDefault();
  setWait(true);

  const { value } = document.querySelector('#number');
  const owner = (await window.wallet.getCompleteAddress()).address;
  console.log(owner);
  await contract.methods.setNumber(parseInt(value), owner).send().wait();
  alert('Number set!');

  setWait(false);
});

document.querySelector('#get').addEventListener('click', async () => {
  const viewTxReceipt = await contract.methods.getNumber((await window.wallet.getCompleteAddress()).address).view();
  alert(`Number is: ${viewTxReceipt.value}`);
});
