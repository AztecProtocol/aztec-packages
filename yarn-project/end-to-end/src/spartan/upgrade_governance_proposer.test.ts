import { type NodeInfo, type PXE, createAztecNodeClient, createCompatibleClient } from '@aztec/aztec.js';
import {
  GovernanceProposerContract,
  RollupContract,
  createEthereumChain,
  createL1Clients,
  deployL1Contract,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';

import { stringify } from 'viem/utils';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:upgrade_governance_proposer');

describe('spartan_upgrade_governance_proposer', () => {
  let pxe: PXE;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOST: string;
  beforeAll(async () => {
    let PXE_URL;
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
  });

  it('should deploy new governance proposer', async () => {
    const chain = createEthereumChain(ETHEREUM_HOST, 1337);
    const { walletClient: l1WalletClient, publicClient: l1PublicClient } = createL1Clients(
      ETHEREUM_HOST,
      MNEMONIC,
      chain.chainInfo,
    );
    const { address: newGovernanceProposerAddress } = await deployL1Contract(
      l1WalletClient,
      l1PublicClient,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [nodeInfo.l1ContractAddresses.registryAddress.toString()],
      '0x2a', // salt
    );
    expect(newGovernanceProposerAddress).toBeDefined();
    debugLogger.info(`newGovernanceProposerAddress: ${newGovernanceProposerAddress.toString()}`);

    const rollup = new RollupContract(l1PublicClient, nodeInfo.l1ContractAddresses.rollupAddress.toString());
    const governanceProposer = new GovernanceProposerContract(
      l1PublicClient,
      nodeInfo.l1ContractAddresses.governanceProposerAddress.toString(),
    );
    const govInfo = async () => {
      const bn = await l1PublicClient.getBlockNumber();
      const slot = await rollup.getSlotNumber();
      const round = await governanceProposer.computeRound(slot);
      const info = await governanceProposer.getRoundInfo(nodeInfo.l1ContractAddresses.rollupAddress.toString(), round);
      const leaderVotes = await governanceProposer.getProposalVotes(
        nodeInfo.l1ContractAddresses.rollupAddress.toString(),
        round,
        info[1],
      );
      return { bn, slot, round, info, leaderVotes };
    };

    const node = createAztecNodeClient('http://localhost:8080');
    await node.setConfig({ governanceProposerPayload: newGovernanceProposerAddress });

    const info = await govInfo();
    expect(info.bn).toBeDefined();
    expect(info.slot).toBeDefined();
    debugLogger.info(`info: ${stringify(info)}`);
  });
});
