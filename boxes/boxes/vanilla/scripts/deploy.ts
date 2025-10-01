import {
  AztecAddress,
  createAztecNodeClient,
  type DeployAccountOptions,
  DeployMethod,
  Fr,
  getContractInstanceFromInstantiationParams,
  PublicKeys,
  SponsoredFeePaymentMethod,
  type Wallet,
} from '@aztec/aztec.js';
import { type AztecNode } from '@aztec/aztec.js/interfaces';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { createStore } from '@aztec/kv-store/lmdb';
import { SponsoredFPCContractArtifact } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getPXEConfig } from '@aztec/pxe/server';
import { getDefaultInitializer } from '@aztec/stdlib/abi';
import { TestWallet } from '@aztec/test-wallet/server';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import { PrivateVotingContract } from '../artifacts/PrivateVoting.ts';

const AZTEC_NODE_URL = process.env.AZTEC_NODE_URL || 'http://localhost:8080';
const PROVER_ENABLED = process.env.PROVER_ENABLED === 'false' ? false : true;
const WRITE_ENV_FILE = process.env.WRITE_ENV_FILE === 'false' ? false : true;

const PXE_STORE_DIR = path.join(import.meta.dirname, '.store');

async function setupWallet(aztecNode: AztecNode) {
  fs.rmSync(PXE_STORE_DIR, { recursive: true, force: true });

  const store = await createStore('pxe', {
    dataDirectory: PXE_STORE_DIR,
    dataStoreMapSizeKB: 1e6,
  });

  const config = getPXEConfig();
  config.dataDirectory = 'pxe';
  config.proverEnabled = PROVER_ENABLED;

  return await TestWallet.create(aztecNode, config, {
    store,
    useLogSuffix: true,
  });
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

async function createAccount(wallet: TestWallet) {
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
  const deployOpts: DeployAccountOptions = {
    from: AztecAddress.ZERO,
    fee: {
      paymentMethod: new SponsoredFeePaymentMethod(
        sponsoredPFCContract.address
      ),
    },
    skipClassPublication: true,
    skipInstancePublication: true,
  };
  const provenInteraction = await deployMethod.prove(deployOpts);
  await provenInteraction.send().wait({ timeout: 120 });

  return accountManager.address;
}

async function deployContract(wallet: Wallet, deployer: AztecAddress) {
  const salt = Fr.random();
  const contract = await getContractInstanceFromInstantiationParams(
    PrivateVotingContract.artifact,
    {
      publicKeys: PublicKeys.default(),
      constructorArtifact: getDefaultInitializer(
        PrivateVotingContract.artifact
      ),
      constructorArgs: [deployer.toField()],
      deployer: deployer,
      salt,
    }
  );

  const deployMethod = new DeployMethod(
    contract.publicKeys,
    wallet,
    PrivateVotingContract.artifact,
    (address: AztecAddress, wallet: Wallet) =>
      PrivateVotingContract.at(address, wallet),
    [deployer.toField()],
    getDefaultInitializer(PrivateVotingContract.artifact)?.name
  );

  const sponsoredPFCContract = await getSponsoredPFCContract();

  const provenInteraction = await deployMethod.prove({
    from: deployer,
    contractAddressSalt: salt,
    fee: {
      paymentMethod: new SponsoredFeePaymentMethod(
        sponsoredPFCContract.address
      ),
    },
  });
  await provenInteraction.send().wait({ timeout: 120 });
  await wallet.registerContract(contract, PrivateVotingContract.artifact);

  return {
    contractAddress: contract.address.toString(),
    deployerAddress: deployer.toString(),
    deploymentSalt: salt.toString(),
  };
}

async function writeEnvFile(deploymentInfo) {
  const envFilePath = path.join(import.meta.dirname, '../.env');
  const envConfig = Object.entries({
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

  // Clean up the PXE store
  fs.rmSync(PXE_STORE_DIR, { recursive: true, force: true });
}

createAccountAndDeployContract().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { createAccountAndDeployContract };
