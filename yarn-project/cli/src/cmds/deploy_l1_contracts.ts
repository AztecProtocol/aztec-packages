import { DebugLogger, LogFn } from '@aztec/foundation/log';

/**
 * Function to execute the 'deployRollupContracts' command.
 * @param rpcUrl - The RPC URL of the ethereum node.
 * @param apiKey - The api key of the ethereum node endpoint.
 * @param privateKey - The private key to be used in contract deployment.
 * @param mnemonic - The mnemonic to be used in contract deployment.
 * @param log - The log function used to print out addresses.
 * @param debugLogger - The debug logger passed to original deploy function.
 */
export async function deployL1Contracts(
  rpcUrl: string,
  apiKey: string,
  privateKey: string,
  mnemonic: string,
  log: LogFn,
  debugLogger: DebugLogger,
) {
  const { createEthereumChain, deployL1Contracts: deployL1ContractOriginal } = await import('@aztec/ethereum');
  const { mnemonicToAccount, privateKeyToAccount } = await import('viem/accounts');

  const account = !privateKey ? mnemonicToAccount(mnemonic!) : privateKeyToAccount(`0x${privateKey}`);
  const chain = createEthereumChain(rpcUrl, apiKey);
  const { l1ContractAddresses } = await deployL1ContractOriginal(chain.rpcUrl, account, chain.chainInfo, debugLogger);

  log('\n');
  log(`Rollup Address: ${l1ContractAddresses.rollupAddress.toString()}`);
  log(`Registry Address: ${l1ContractAddresses.registryAddress.toString()}`);
  log(`L1 -> L2 Inbox Address: ${l1ContractAddresses.inboxAddress.toString()}`);
  log(`L2 -> L1 Outbox address: ${l1ContractAddresses.outboxAddress.toString()}`);
  log(`Contract Deployment Emitter Address: ${l1ContractAddresses.contractDeploymentEmitterAddress.toString()}`);
  log(`Availability Oracle Address: ${l1ContractAddresses.availabilityOracleAddress.toString()}`);
  log('\n');
}
