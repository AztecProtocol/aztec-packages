import { Contract, ContractDeployer, createPXEClient, getSandboxAccountsWallets } from '@aztec/aztec.js';
import { TokenContractArtifact } from '@aztec/noir-contracts/Token';

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

// docs:start:dapp-deploy
const { PXE_URL = 'http://localhost:8080' } = process.env;

async function main() {
  const pxe = createPXEClient(PXE_URL);
  const [ownerWallet] = await getSandboxAccountsWallets(pxe);

  const token = await Contract.deploy(ownerWallet, TokenContractArtifact, [ownerWallet.getCompleteAddress()])
    .send()
    .deployed();

  console.log(`Token deployed at ${token.address.toString()}`);

  const addresses = {
    token: token.address.toString(),
  };
  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));
}
// docs:end:dapp-deploy

// Execute main only if run directly
if (process.argv[1].replace(/\/index\.m?js$/, '') === fileURLToPath(import.meta.url).replace(/\/index\.m?js$/, '')) {
  main().catch(err => {
    console.error(`Error in deployment script: ${err}`);
    process.exit(1);
  });
}

export { main as deploy };
