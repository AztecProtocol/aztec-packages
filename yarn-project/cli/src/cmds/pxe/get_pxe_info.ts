import { createCompatibleClient } from '@aztec/aztec.js';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

export async function getPXEInfo(rpcUrl: string, debugLogger: DebugLogger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const info = await client.getPXEInfo();
  log(`PXE Version: ${info.pxeVersion}`);
  log(`Protocol Contract Addresses:`);
  log(` Class Registerer: ${info.protocolContractAddresses.classRegisterer.toString()}`);
  log(` Fee Juice: ${info.protocolContractAddresses.feeJuice.toString()}`);
  log(` Instance Deployer: ${info.protocolContractAddresses.instanceDeployer.toString()}`);
  log(` Key Registry: ${info.protocolContractAddresses.keyRegistry.toString()}`);
  log(` Multi Call Entrypoint: ${info.protocolContractAddresses.multiCallEntrypoint.toString()}`);
}
