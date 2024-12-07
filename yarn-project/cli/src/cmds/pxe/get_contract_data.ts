import { type AztecAddress } from '@aztec/aztec.js';
import { createCompatibleClient } from '@aztec/aztec.js';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

export async function getContractData(
  rpcUrl: string,
  contractAddress: AztecAddress,
  includeBytecode: boolean,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const {
    contractInstance: instance,
    isContractInitialized: isInitialized,
    isContractPubliclyDeployed: isPubliclyDeployed,
  } = await client.getContractMetadata(contractAddress);
  const contractClass =
    includeBytecode && instance && (await client.getContractClassMetadata(instance?.contractClassId)).contractClass;

  const isPrivatelyDeployed = !!instance;
  const initStr = isInitialized ? 'initialized' : 'not initialized';
  const addrStr = contractAddress.toString();

  if (isPubliclyDeployed && isPrivatelyDeployed) {
    log(`Contract is ${initStr} and publicly deployed at ${addrStr}`);
  } else if (isPrivatelyDeployed) {
    log(`Contract is ${initStr} and registered in the local pxe at ${addrStr} but not publicly deployed`);
  } else if (isPubliclyDeployed) {
    log(`Contract is ${initStr} and publicly deployed at ${addrStr} but not registered in the local pxe`);
  } else if (isInitialized) {
    log(`Contract is initialized but not publicly deployed nor registered in the local pxe at ${addrStr}`);
  } else {
    log(`No contract found at ${addrStr}`);
  }

  if (instance) {
    log(``);
    Object.entries(instance).forEach(([key, value]) => {
      const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
      log(`${capitalized}: ${value.toString()}`);
    });

    if (contractClass) {
      log(`\nBytecode: ${contractClass.packedBytecode.toString('base64')}`);
    }
    log('');
  }
}
