import { createCompatibleClient } from '@aztec/aztec.js';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

export async function getNodeInfo(rpcUrl: string, debugLogger: DebugLogger, log: LogFn) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const info = await client.getNodeInfo();
  log(`Node Version: ${info.nodeVersion}`);
  log(`Chain Id: ${info.l1ChainId}`);
  log(`Protocol Version: ${info.protocolVersion}`);
  log(`Rollup Address: ${info.l1ContractAddresses.rollupAddress.toString()}`);
  log(`Protocol Contract Addresses:`);
  log(` Class Registerer:  ${info.protocolContractAddresses.classRegisterer.toString()}`);
  log(` Fee Juice:         ${info.protocolContractAddresses.feeJuice.toString()}`);
  log(` Instance Deployer: ${info.protocolContractAddresses.instanceDeployer.toString()}`);
  log(` Key Registry:      ${info.protocolContractAddresses.keyRegistry.toString()}`);
  log(` MultiCall:         ${info.protocolContractAddresses.multiCallEntrypoint.toString()}`);
}
