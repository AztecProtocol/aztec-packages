import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  type ContractInstanceWithAddress,
  DeployMethod,
  getContractInstanceFromInstantiationParams,
  type InteractionWaitOptions,
} from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys } from '@aztec/aztec.js/keys';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import type { DeployAccountOptions, Wallet } from '@aztec/aztec.js/wallet';
import { type AztecNode } from '@aztec/aztec.js/node';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { SponsoredFPCContractArtifact } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getDefaultInitializer } from '@aztec/stdlib/abi';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { PrivateVotingContract } from '../artifacts/PrivateVoting.ts';

const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
const WRITE_ENV_FILE = process.env.WRITE_ENV_FILE === 'false' ? false : true;

async function setupWallet(aztecNode: AztecNode) {
  return await EmbeddedWallet.create(aztecNode, { ephemeral: true });
}

async function getSponsoredPFCContract() {
  const instance = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    {
      salt: new Fr(SPONSORED_FPC_SALT),
    }
  );

  return instance;
}

async function createAccount(wallet: EmbeddedWallet) {
  const salt = Fr.random();
  const secretKey = Fr.random();
  const signingKey = Buffer.alloc(32, Fr.random().toBuffer());
  const accountManager = await wallet.createECDSARAccount(
    secretKey,
    salt,
    signingKey
  );

  const deployMethod = await accountManager.getDeployMethod();
  const sponsoredPFCContract = await getSponsoredPFCContract();
  const deployOpts: DeployAccountOptions<InteractionWaitOptions> = {
    from: AztecAddress.ZERO,
    fee: {
      paymentMethod: new SponsoredFeePaymentMethod(
        sponsoredPFCContract.address
      ),
    },
    skipClassPublication: true,
    skipInstancePublication: true,
    wait: { timeout: 120 },
  };
  await deployMethod.send(deployOpts);

  return accountManager.address;
}

async function deployContract(wallet: Wallet, deployer: AztecAddress) {
  const salt = Fr.random();

  const sponsoredPFCContract = await getSponsoredPFCContract();

  const contract = await PrivateVotingContract.deploy(wallet, deployer).send({
    from: deployer,
    contractAddressSalt: salt,
    fee: {
      paymentMethod: new SponsoredFeePaymentMethod(
        sponsoredPFCContract.address
      ),
    },
    wait: { timeout: 120 },
  });

  const electionId = new Fr(42);

  await contract.methods.start_vote({ id: electionId }).send({
    from: deployer,
    fee: {
      paymentMethod: new SponsoredFeePaymentMethod(
        sponsoredPFCContract.address
      ),
    },
    wait: { timeout: 120 },
  });

  return {
    electionId: electionId.toString(),
    contractAddress: contract.address.toString(),
    deployerAddress: deployer.toString(),
    deploymentSalt: salt.toString(),
  };
}

async function writeEnvFile(deploymentInfo) {
  const envFilePath = path.join(import.meta.dirname, '../.env');
  const envConfig = Object.entries({
    ELECTION_ID: deploymentInfo.electionId,
    CONTRACT_ADDRESS: deploymentInfo.contractAddress,
    DEPLOYER_ADDRESS: deploymentInfo.deployerAddress,
    DEPLOYMENT_SALT: deploymentInfo.deploymentSalt,
    AZTEC_NODE_URL,
  })
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(envFilePath, envConfig);

  console.log(`
      \n\n\n
      Contract deployed successfully. Config saved to ${envFilePath}
      IMPORTANT: Do not lose this file as you will not be able to recover the contract address if you lose it.
      \n\n\n
    `);
}

async function createAccountAndDeployContract() {
  const aztecNode = createAztecNodeClient(AZTEC_NODE_URL);
  const wallet = await setupWallet(aztecNode);

  // Register the SponsoredFPC contract (for sponsored fee payments)
  await wallet.registerContract(
    await getSponsoredPFCContract(),
    SponsoredFPCContractArtifact
  );

  // Create a new account
  const accountAddress = await createAccount(wallet);

  // Deploy the contract
  const deploymentInfo = await deployContract(wallet, accountAddress);

  // Save the deployment info to app/public
  if (WRITE_ENV_FILE) {
    await writeEnvFile(deploymentInfo);
  }
}

createAccountAndDeployContract().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { createAccountAndDeployContract };
