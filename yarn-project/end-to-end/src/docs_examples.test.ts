import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { GrumpkinScalar, createPXEClient } from '@aztec/aztec.js';
import { Contract } from "@aztec/aztec.js";
import { TokenContract } from '@aztec/noir-contracts.js/TokenContract';

const PXE_URL = process.env.PXE_URL || 'http://localhost:8080';
const encryptionPrivateKey = GrumpkinScalar.random();
const signingPrivateKey = GrumpkinScalar.random();
const pxe = createPXEClient(PXE_URL);

const wallet = await getSchnorrAccount(
    pxe,
    encryptionPrivateKey,
    signingPrivateKey
  ).waitDeploy();
  console.log(`New account deployed at ${wallet.getAddress()}`);

const deployedContract = await TokenContract.deploy(
    wallet, 
    TokenContract, 
    'TokenName', 
    'TokenSymbol', 
    18)
  .send()
  .deployed();
console.log(`New contract deployed at ${deployedContract.address}`)

const contract = await Contract.at(deployedContract.address, TokenContract, wallet);

const tx = await contract.methods
  .transfer(1, wallet)
  .send()
  .wait();
console.log(
  `Transferred 1 to ${wallet.getAddress()} on block ${tx.blockNumber}`
);

const balance = await contract.methods.getBalance(wallet.getAddress()).view();
console.log(`Account balance is ${balance}`);