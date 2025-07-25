import { type AztecNode, type PXE, createAztecNodeClient, createCompatibleClient } from '@aztec/aztec.js';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function getNodeInfo(
  rpcUrl: string,
  pxeRequest: boolean,
  debugLogger: Logger,
  json: boolean,
  log: LogFn,
  logJson: (output: any) => void,
) {
  let client: AztecNode | PXE;
  if (pxeRequest) {
    client = await createCompatibleClient(rpcUrl, debugLogger);
  } else {
    client = createAztecNodeClient(rpcUrl);
  }
  const info = await client.getNodeInfo();
  if (json) {
    logJson({
      nodeVersion: info.nodeVersion,
      l1ChainId: info.l1ChainId,
      rollupVersion: info.rollupVersion,
      enr: info.enr,
      l1ContractAddresses: {
        rollup: info.l1ContractAddresses.rollupAddress.toString(),
        registry: info.l1ContractAddresses.registryAddress.toString(),
        inbox: info.l1ContractAddresses.inboxAddress.toString(),
        outbox: info.l1ContractAddresses.outboxAddress.toString(),
        feeJuice: info.l1ContractAddresses.feeJuiceAddress.toString(),
        stakingAsset: info.l1ContractAddresses.stakingAssetAddress.toString(),
        feeJuicePortal: info.l1ContractAddresses.feeJuicePortalAddress.toString(),
        coinIssuer: info.l1ContractAddresses.coinIssuerAddress.toString(),
        rewardDistributor: info.l1ContractAddresses.rewardDistributorAddress.toString(),
        governanceProposer: info.l1ContractAddresses.governanceProposerAddress.toString(),
        governance: info.l1ContractAddresses.governanceAddress.toString(),
        slashFactory: info.l1ContractAddresses.slashFactoryAddress?.toString(),
        feeAssetHandler: info.l1ContractAddresses.feeAssetHandlerAddress?.toString(),
        stakingAssetHandler: info.l1ContractAddresses.stakingAssetHandlerAddress?.toString(),
      },
      protocolContractAddresses: {
        classRegistry: info.protocolContractAddresses.classRegistry.toString(),
        feeJuice: info.protocolContractAddresses.feeJuice.toString(),
        instanceRegistry: info.protocolContractAddresses.instanceRegistry.toString(),
        multiCallEntrypoint: info.protocolContractAddresses.multiCallEntrypoint.toString(),
      },
    });
  } else {
    log(`Node Version: ${info.nodeVersion}`);
    log(`Chain Id: ${info.l1ChainId}`);
    log(`Rollup Version: ${info.rollupVersion}`);
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
    log(` SlashFactory Address: ${info.l1ContractAddresses.slashFactoryAddress?.toString()}`);
    log(` FeeAssetHandler Address: ${info.l1ContractAddresses.feeAssetHandlerAddress?.toString()}`);
    log(` StakingAssetHandler Address: ${info.l1ContractAddresses.stakingAssetHandlerAddress?.toString()}`);
    log(`L2 Contract Addresses:`);
    log(` Class Registry: ${info.protocolContractAddresses.classRegistry.toString()}`);
    log(` Fee Juice: ${info.protocolContractAddresses.feeJuice.toString()}`);
    log(` Instance Deployer: ${info.protocolContractAddresses.instanceRegistry.toString()}`);
    log(` MultiCall: ${info.protocolContractAddresses.multiCallEntrypoint.toString()}`);
  }
}
