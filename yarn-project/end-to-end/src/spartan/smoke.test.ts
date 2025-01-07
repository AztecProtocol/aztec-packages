import { type PXE, createCompatibleClient } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { createPublicClient, getAddress, getContract, http } from 'viem';
import { foundry } from 'viem/chains';

import { type AlertConfig } from '../quality_of_service/alert_checker.js';
import { isK8sConfig, runAlertCheck, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:smoke');

// QoS alerts for when we are running in k8s
const qosAlerts: AlertConfig[] = [
  {
    alert: 'SequencerTimeToCollectAttestations',
    expr: 'avg_over_time(aztec_sequencer_time_to_collect_attestations[2m]) > 2500',
    labels: { severity: 'error' },
    for: '10m',
    annotations: {},
  },
];

describe('smoke test', () => {
  let pxe: PXE;
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

      await startPortForward({
        resource: `svc/metrics-grafana`,
        namespace: 'metrics',
        containerPort: config.CONTAINER_METRICS_PORT,
        hostPort: config.HOST_METRICS_PORT,
      });
    } else {
      PXE_URL = config.PXE_URL;
    }
    pxe = await createCompatibleClient(PXE_URL, debugLogger);
  });

  afterAll(async () => {
    await runAlertCheck(config, qosAlerts, debugLogger);
  });

  it('should be able to get node enr', async () => {
    const info = await pxe.getNodeInfo();
    expect(info).toBeDefined();
    // expect enr to be a string starting with 'enr:-'
    expect(info.enr).toMatch(/^enr:-/);
  });

  // Leaving this test skipped commented out because it requires the ethereum node
  // to be running and forwarded, e.g.
  // kubectl port-forward -n smoke service/spartan-aztec-network-ethereum 8545:8545
  // also because it assumes foundry.

  it.skip('should be able to get rollup info', async () => {
    const info = await pxe.getNodeInfo();
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http('http://localhost:8545'),
    });

    const rollupContract = getContract({
      address: getAddress(info.l1ContractAddresses.rollupAddress.toString()),
      abi: RollupAbi,
      client: publicClient,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [pendingBlockNum, pendingArchive, provenBlockNum, provenArchive, myArchive, provenEpochNumber] =
      await rollupContract.read.status([60n]);
    // console.log('pendingBlockNum', pendingBlockNum.toString());
    // console.log('pendingArchive', pendingArchive.toString());
    // console.log('provenBlockNum', provenBlockNum.toString());
    // console.log('provenArchive', provenArchive.toString());
    // console.log('myArchive', myArchive.toString());
    // console.log('provenEpochNumber', provenEpochNumber.toString());
  });
});
