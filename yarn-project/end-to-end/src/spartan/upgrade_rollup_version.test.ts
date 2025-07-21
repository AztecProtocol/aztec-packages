import { getInitialTestAccounts } from '@aztec/accounts/testing';
import { type NodeInfo, type PXE, createCompatibleClient, retryUntil } from '@aztec/aztec.js';
import {
  DefaultL1ContractsConfig,
  type L1ContractAddresses,
  RegistryContract,
  RollupContract,
  createEthereumChain,
  createExtendedL1Client,
  defaultL1TxUtilsConfig,
  deployRollupForUpgrade,
} from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

import type { ChildProcess } from 'child_process';
import omit from 'lodash.omit';

import { isK8sConfig, rollAztecPods, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);
if (!isK8sConfig(config)) {
  throw new Error('This test must be run in a k8s environment');
}

const debugLogger = createLogger('e2e:spartan-test:upgrade_rollup_version');

describe('spartan_upgrade_rollup_version', () => {
  let pxe: PXE;
  let nodeInfo: NodeInfo;
  let ETHEREUM_HOSTS: string[];
  let originalL1ContractAddresses: L1ContractAddresses;
  const forwardProcesses: ChildProcess[] = [];

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process: pxeProcess, port: pxePort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_PXE_PORT,
    });
    forwardProcesses.push(pxeProcess);
    const PXE_URL = `http://127.0.0.1:${pxePort}`;

    const { process: ethProcess, port: ethPort } = await startPortForward({
      resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
      namespace: config.NAMESPACE,
      containerPort: config.CONTAINER_ETHEREUM_PORT,
    });
    forwardProcesses.push(ethProcess);
    ETHEREUM_HOSTS = [`http://127.0.0.1:${ethPort}`];

    pxe = await createCompatibleClient(PXE_URL, debugLogger);
    nodeInfo = await pxe.getNodeInfo();
    originalL1ContractAddresses = omit(nodeInfo.l1ContractAddresses, [
      'slashFactoryAddress',
      'stakingAssetHandlerAddress',
      'feeAssetHandlerAddress',
    ]);
  });

  // We need a separate account to deploy the new governance proposer
  // because the underlying validators are currently producing blob transactions
  // and you can't submit blob and non-blob transactions from the same account

  // @note Look at older commits to find a version that actually go through governance here
  it(
    'should upgrade the rollup version',
    async () => {
      /** Setup */

      const chain = createEthereumChain(ETHEREUM_HOSTS, nodeInfo.l1ChainId);
      const l1Client = createExtendedL1Client(ETHEREUM_HOSTS, config.L1_ACCOUNT_MNEMONIC, chain.chainInfo);
      debugLogger.info(`L1 Client address: ${l1Client.account.address}`);
      const initialTestAccounts = await getInitialTestAccounts();

      const { genesisArchiveRoot, fundingNeeded } = await getGenesisValues(initialTestAccounts.map(a => a.address));

      const rollup = new RollupContract(l1Client, originalL1ContractAddresses.rollupAddress.toString());
      const { rollup: newRollup } = await deployRollupForUpgrade(
        l1Client,
        {
          salt: Math.floor(Math.random() * 1000000),
          vkTreeRoot: getVKTreeRoot(),
          protocolContractTreeRoot,
          genesisArchiveRoot,
          ethereumSlotDuration: 12,
          aztecSlotDuration: 24,
          aztecEpochDuration: 4,
          aztecProofSubmissionEpochs: 1,
          aztecTargetCommitteeSize: 48,
          slashingQuorum: 6,
          slashingRoundSize: 10,
          manaTarget: BigInt(100e6),
          provingCostPerMana: BigInt(100),
          feeJuicePortalInitialBalance: fundingNeeded,
          realVerifier: false,
          exitDelaySeconds: DefaultL1ContractsConfig.exitDelaySeconds,
        },
        originalL1ContractAddresses.registryAddress,
        debugLogger,
        defaultL1TxUtilsConfig,
      );

      const newAddresses = await newRollup.getRollupAddresses();

      const newCanonicalAddresses = await RegistryContract.collectAddresses(
        l1Client,
        originalL1ContractAddresses.registryAddress,
        'canonical',
      );

      expect(newCanonicalAddresses).toEqual({
        // we preserve the original registry/governance addresses
        ...originalL1ContractAddresses,
        // but have new instance addresses
        ...newAddresses,
      });

      const oldVersion = await new RollupContract(
        l1Client,
        originalL1ContractAddresses.rollupAddress.toString(),
      ).getVersion();
      const newVersion = await new RollupContract(
        l1Client,
        newCanonicalAddresses.rollupAddress.toString(),
      ).getVersion();

      debugLogger.info(`oldVersion: ${oldVersion}, address: ${originalL1ContractAddresses.rollupAddress}`);
      debugLogger.info(`newVersion: ${newVersion}, address: ${newCanonicalAddresses.rollupAddress}`);
      expect(oldVersion).not.toEqual(newVersion);

      await expect(
        RegistryContract.collectAddresses(l1Client, originalL1ContractAddresses.registryAddress, oldVersion),
      ).resolves.toEqual(originalL1ContractAddresses);

      await expect(
        RegistryContract.collectAddresses(l1Client, originalL1ContractAddresses.registryAddress, newVersion),
      ).resolves.toEqual(newCanonicalAddresses);

      const oldRollupTips = await rollup.getTips();
      await retryUntil(
        async () => {
          const tips = await rollup.getTips();
          return tips.provenBlockNumber > oldRollupTips.provenBlockNumber;
        },
        'old rollup should be building blocks',
        // +5 just as a buffer
        (config.AZTEC_PROOF_SUBMISSION_WINDOW + 5) * config.AZTEC_SLOT_DURATION,
        5,
      );

      // Now delete all the pods, forcing them to restart on the new rollup
      await rollAztecPods(config.NAMESPACE);

      // start a new port forward
      const { process: pxeProcess, port: pxePort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
      });
      forwardProcesses.push(pxeProcess);
      const PXE_URL = `http://127.0.0.1:${pxePort}`;
      pxe = await createCompatibleClient(PXE_URL, debugLogger);

      const newNodeInfo = await pxe.getNodeInfo();

      // @todo There is an issue here, probably related to #12791, but somehow
      // the address returned by the pxe node info is NEITHER the old nor the new rollup address

      debugLogger.info(`newNodeInfo: ${JSON.stringify(newNodeInfo)}`);
      debugLogger.info(`originalL1ContractAddresses: ${JSON.stringify(originalL1ContractAddresses)}`);
      debugLogger.info(`newCanonicalAddresses: ${JSON.stringify(newCanonicalAddresses)}`);
      expect(newNodeInfo.l1ContractAddresses.rollupAddress).toEqual(newCanonicalAddresses.rollupAddress);

      const l2Tips = await newRollup.getTips();
      await expect(
        retryUntil(
          async () => {
            const tips = await newRollup.getTips();
            return tips.provenBlockNumber > l2Tips.provenBlockNumber;
          },
          'new rollup should be building/proving blocks',
          // +5 just as a buffer
          (config.AZTEC_PROOF_SUBMISSION_WINDOW + 5) * config.AZTEC_SLOT_DURATION,
          5,
        ),
      ).resolves.toBe(true);
    },
    6 * config.AZTEC_PROOF_SUBMISSION_WINDOW * config.AZTEC_SLOT_DURATION * 1000,
  );
});
