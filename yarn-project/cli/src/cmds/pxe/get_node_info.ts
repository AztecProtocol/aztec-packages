import { type AztecNode, type PXE, createAztecNodeClient, createCompatibleClient } from '@aztec/aztec.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

export async function getNodeInfo(rpcUrl: string, pxeRequest: boolean, debugLogger: Logger, log: LogFn) {
  let client: AztecNode | PXE;
  if (pxeRequest) {
    client = await createCompatibleClient(rpcUrl, debugLogger);
  } else {
    client = createAztecNodeClient(rpcUrl);
  }
  const info = await client.getNodeInfo();
  log(`Node Version: ${info.nodeVersion}`);
  log(`Chain Id: ${info.l1ChainId}`);
  log(`Protocol Version: ${info.protocolVersion}`);
  log(`Node ENR: ${info.enr}`);
  log(`L1 Contract Addresses:`);
  log(` Rollup Address: ${info.l1ContractAddresses.rollupAddress.toString()}`);
  log(` Registry Address: ${info.l1ContractAddresses.registryAddress.toString()}`);
  log(` L1 -> L2 Inbox Address: ${info.l1ContractAddresses.inboxAddress.toString()}`);
  log(` L2 -> L1 Outbox Address: ${info.l1ContractAddresses.outboxAddress.toString()}`);
  log(` Fee Juice Address: ${info.l1ContractAddresses.feeJuiceAddress.toString()}`);
  log(` Staking Asset Address: ${info.l1ContractAddresses.stakingAssetAddress.toString()}`);
  log(` Fee Juice Portal Address: ${info.l1ContractAddresses.feeJuicePortalAddress.toString()}`);
  log(` CoinIssuer Address: ${info.l1ContractAddresses.coinIssuerAddress.toString()}`);
  log(` RewardDistributor Address: ${info.l1ContractAddresses.rewardDistributorAddress.toString()}`);
  log(` GovernanceProposer Address: ${info.l1ContractAddresses.governanceProposerAddress.toString()}`);
  log(` Governance Address: ${info.l1ContractAddresses.governanceAddress.toString()}`);

  log(`L2 Contract Addresses:`);
  log(` Class Registerer: ${info.protocolContractAddresses.classRegisterer.toString()}`);
  log(` Fee Juice: ${info.protocolContractAddresses.feeJuice.toString()}`);
  log(` Instance Deployer: ${info.protocolContractAddresses.instanceDeployer.toString()}`);
  log(` MultiCall: ${info.protocolContractAddresses.multiCallEntrypoint.toString()}`);
}
