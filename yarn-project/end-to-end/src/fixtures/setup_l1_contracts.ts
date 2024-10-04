import { type DebugLogger, type L1ContractArtifactsForDeployment, deployL1Contracts } from '@aztec/aztec.js';
import { type DeployL1ContractsArgs } from '@aztec/ethereum';
import {
  FeeJuicePortalAbi,
  FeeJuicePortalBytecode,
  InboxAbi,
  InboxBytecode,
  MockProofCommitmentEscrowAbi,
  MockProofCommitmentEscrowBytecode,
  OutboxAbi,
  OutboxBytecode,
  ProofCommitmentEscrowAbi,
  ProofCommitmentEscrowBytecode,
  RegistryAbi,
  RegistryBytecode,
  RollupAbi,
  RollupBytecode,
  TestERC20Abi,
  TestERC20Bytecode,
} from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { type HDAccount, type PrivateKeyAccount } from 'viem';
import { foundry } from 'viem/chains';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

export const setupL1Contracts = async (
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: DebugLogger,
  args: Pick<DeployL1ContractsArgs, 'assumeProvenThrough' | 'initialValidators' | 'useRealProofCommitmentEscrow'>,
) => {
  const l1Artifacts: L1ContractArtifactsForDeployment = {
    registry: {
      contractAbi: RegistryAbi,
      contractBytecode: RegistryBytecode,
    },
    inbox: {
      contractAbi: InboxAbi,
      contractBytecode: InboxBytecode,
    },
    outbox: {
      contractAbi: OutboxAbi,
      contractBytecode: OutboxBytecode,
    },
    rollup: {
      contractAbi: RollupAbi,
      contractBytecode: RollupBytecode,
    },
    feeJuice: {
      contractAbi: TestERC20Abi,
      contractBytecode: TestERC20Bytecode,
    },
    feeJuicePortal: {
      contractAbi: FeeJuicePortalAbi,
      contractBytecode: FeeJuicePortalBytecode,
    },
    proofCommitmentEscrow: {
      contractAbi: args.useRealProofCommitmentEscrow ? ProofCommitmentEscrowAbi : MockProofCommitmentEscrowAbi,
      contractBytecode: args.useRealProofCommitmentEscrow
        ? ProofCommitmentEscrowBytecode
        : MockProofCommitmentEscrowBytecode,
    },
  };

  const l1Data = await deployL1Contracts(l1RpcUrl, account, foundry, logger, l1Artifacts, {
    l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
    vkTreeRoot: getVKTreeRoot(),
    protocolContractTreeRoot,
    salt: undefined,
    ...args,
  });

  return l1Data;
};
