import { createCompatibleClient } from '@aztec/aztec.js';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getPXEInfo(rpcUrl: string, debugLogger: Logger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const info = await client.getPXEInfo();
  log(`PXE Version: ${info.pxeVersion}`);
  log(`Protocol Contract Addresses:`);
  log(` Class Registry: ${info.protocolContractAddresses.classRegistry.toString()}`);
  log(` Fee Juice: ${info.protocolContractAddresses.feeJuice.toString()}`);
  log(` Instance Deployer: ${info.protocolContractAddresses.instanceRegistry.toString()}`);
  log(` Multi Call Entrypoint: ${info.protocolContractAddresses.multiCallEntrypoint.toString()}`);
}
