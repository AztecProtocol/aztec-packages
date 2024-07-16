import {
  AztecAddress,
  NoFeePaymentMethod,
  SignerlessWallet,
  type WaitOpts,
  createPXEClient,
  makeFetch,
} from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/aztec.js/entrypoint';
import {
  CANONICAL_KEY_REGISTRY_ADDRESS,
  GasSettings,
  MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
} from '@aztec/circuits.js';
import { bufferAsFields } from '@aztec/foundation/abi';
import { type LogFn } from '@aztec/foundation/log';
import { getCanonicalGasToken } from '@aztec/protocol-contracts/gas-token';
import { getCanonicalKeyRegistry } from '@aztec/protocol-contracts/key-registry';

const waitOpts: WaitOpts = {
  timeout: 1800,
  interval: 1,
};

export async function bootstrap(rpcUrl: string, l1ChainId: number, log: LogFn) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing noir-contracts.js even in devDeps results in a circular dependency error. Need to ignore because this line doesn't cause an error in a dev environment
  const { GasTokenContract, KeyRegistryContract } = await import('@aztec/noir-contracts.js');

  const pxe = createPXEClient(rpcUrl, makeFetch([], true));
  const deployer = new SignerlessWallet(pxe, new DefaultMultiCallEntrypoint(l1ChainId, 1));

  const canonicalKeyRegistry = getCanonicalKeyRegistry();
  const keyRegistry = await KeyRegistryContract.deploy(deployer)
    .send({ contractAddressSalt: canonicalKeyRegistry.instance.salt, universalDeploy: true })
    .deployed(waitOpts);
  log(`Deployed Key Registry on L2 at ${canonicalKeyRegistry.address}`);

  if (
    !keyRegistry.address.equals(canonicalKeyRegistry.address) ||
    !keyRegistry.address.equals(AztecAddress.fromBigInt(CANONICAL_KEY_REGISTRY_ADDRESS))
  ) {
    throw new Error(
      `Deployed Key Registry address ${keyRegistry.address} does not match expected address ${canonicalKeyRegistry.address}, or they both do not equal CANONICAL_KEY_REGISTRY_ADDRESS`,
    );
  }

  const gasPortalAddress = (await deployer.getNodeInfo()).l1ContractAddresses.gasPortalAddress;
  const canonicalGasToken = getCanonicalGasToken();
  const publicBytecode = canonicalGasToken.contractClass.packedBytecode;
  const encodedBytecode = bufferAsFields(publicBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
  await pxe.addCapsule(encodedBytecode);
  const gasToken = await GasTokenContract.at(canonicalGasToken.address, deployer);
  await gasToken.methods
    .deploy(
      canonicalGasToken.contractClass.artifactHash,
      canonicalGasToken.contractClass.privateFunctionsRoot,
      canonicalGasToken.contractClass.publicBytecodeCommitment,
      gasPortalAddress,
    )
    .send({ fee: { paymentMethod: new NoFeePaymentMethod(), gasSettings: GasSettings.teardownless() } })
    .wait();

  if (!gasToken.address.equals(canonicalGasToken.address)) {
    throw new Error(
      `Deployed Gas Token address ${gasToken.address} does not match expected address ${canonicalGasToken.address}`,
    );
  }

  if (!(await deployer.isContractPubliclyDeployed(canonicalGasToken.address))) {
    throw new Error(`Failed to deploy Gas Token to ${canonicalGasToken.address}`);
  }
  log(`Deployed Gas Token on L2 at ${canonicalGasToken.address}`);
}
