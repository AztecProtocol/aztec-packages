import { type NodeInfo, type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { createL1Clients, deployL1Contract } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';

import { type PublicClient, type WalletClient } from 'viem';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_governance_proposer');

describe('spartan_upgrade_governance_proposer', () => {
  let pxe: PXE;
  let nodeInfo: NodeInfo;
  let walletClient: WalletClient;
  let publicClient: PublicClient;
  beforeAll(async () => {
    let PXE_URL;
    let ETHEREUM_HOST;
    if (isK8sConfig(config)) {
      await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
        hostPort: config.HOST_PXE_PORT,
      });
      PXE_URL = `http://127.0.0.1:${config.HOST_PXE_PORT}`;
      ETHEREUM_HOST = `http://127.0.0.1:${config.HOST_ETHEREUM_PORT}`;

      await startPortForward({
        resource: `svc/metrics-grafana`,
        namespace: 'metrics',
        containerPort: config.CONTAINER_METRICS_PORT,
        hostPort: config.HOST_METRICS_PORT,
      });
    } else {
      PXE_URL = config.PXE_URL;
      ETHEREUM_HOST = config.ETHEREUM_HOST;
    }
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
    nodeInfo = await pxe.getNodeInfo();
    const { walletClient: l1WalletClient, publicClient: l1PublicClient } = createL1Clients(ETHEREUM_HOST, MNEMONIC);
    walletClient = l1WalletClient;
    publicClient = l1PublicClient;
  });

  it('should deploy new governance proposer', async () => {
    const { address: newGovernanceProposerAddress } = await deployL1Contract(
      walletClient,
      publicClient,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [nodeInfo.l1ContractAddresses.registryAddress.toString()],
    );
    expect(newGovernanceProposerAddress).toBeDefined();
  });
});
