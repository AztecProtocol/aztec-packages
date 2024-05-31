import { BatchCall, SignerlessWallet, type WaitOpts, createPXEClient } from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import { type LogFn } from '@aztec/foundation/log';
import { GasTokenContract, KeyRegistryContract } from '@aztec/noir-contracts.js';
import { getCanonicalGasToken } from '@aztec/protocol-contracts/gas-token';
import { getCanonicalKeyRegistry } from '@aztec/protocol-contracts/key-registry';

const waitOpts: WaitOpts = {
  timeout: 1800,
  interval: 1,
};

export async function bootstrap(rpcUrl: string, log: LogFn) {
  const pxe = createPXEClient(rpcUrl);
  const canonicalKeyRegistry = getCanonicalKeyRegistry();
  const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(31337, 1));

  const keyRegistryTx = KeyRegistryContract.deploy(deployer).send({
    contractAddressSalt: canonicalKeyRegistry.instance.salt,
    universalDeploy: true,
  });

  const gasPortalAddress = (await deployer.getNodeInfo()).l1ContractAddresses.gasPortalAddress;
  const canonicalGasToken = getCanonicalGasToken();

  const gasTokenTx = GasTokenContract.deploy(deployer).send({
    contractAddressSalt: canonicalGasToken.instance.salt,
    universalDeploy: true,
  });

  const [keyRegistry, gasToken] = await Promise.all([keyRegistryTx.deployed(waitOpts), gasTokenTx.deployed(waitOpts)]);
  const portalSetTx = gasToken.methods.set_portal(gasPortalAddress).send();
  const emptyTx = new BatchCall(deployer, []).send();

  await Promise.all([portalSetTx.wait(waitOpts), emptyTx.wait(waitOpts)]);

  log(`Key Registry deployed at canonical address ${keyRegistry.address.toString()}`);
  log(`Gas token deployed at canonical address ${gasToken.address.toString()}`);
}
