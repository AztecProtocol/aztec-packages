import { AztecAddress, createCompatibleClient, getContractClassFromArtifact } from '@aztec/aztec.js';
import type { ContractInstanceWithAddress, Fr } from '@aztec/aztec.js';
import { PublicKeys } from '@aztec/circuits.js';
import { computeContractAddressFromInstance } from '@aztec/circuits.js/contract';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { getContractArtifact } from '../../utils/aztec.js';

export async function addContract(
  rpcUrl: string,
  contractArtifactPath: string,
  address: AztecAddress,
  initializationHash: Fr,
  salt: Fr,
  publicKeys: PublicKeys,
  deployer: AztecAddress | undefined,
  debugLogger: Logger,
  log: LogFn,
) {
  const artifact = await getContractArtifact(contractArtifactPath, log);
  const contractClass = await getContractClassFromArtifact(artifact);
  const instance: ContractInstanceWithAddress = {
    version: 1,
    salt,
    initializationHash,
    currentContractClassId: contractClass.id,
    originalContractClassId: contractClass.id,
    publicKeys: publicKeys ?? PublicKeys.default(),
    address,
    deployer: deployer ?? AztecAddress.ZERO,
  };
  const computed = await computeContractAddressFromInstance(instance);
  if (!computed.equals(address)) {
    throw new Error(`Contract address ${address.toString()} does not match computed address ${computed.toString()}`);
  }

  const client = await createCompatibleClient(rpcUrl, debugLogger);

  await client.registerContract({ artifact, instance });
  log(`\nContract added to PXE at ${address.toString()} with class ${instance.currentContractClassId.toString()}\n`);
}
