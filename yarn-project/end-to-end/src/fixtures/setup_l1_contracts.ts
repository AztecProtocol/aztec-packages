import { type Logger, deployL1Contracts } from '@aztec/aztec.js';
import { type DeployL1ContractsArgs, type L1ContractsConfig } from '@aztec/ethereum';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vks';
import { ProtocolContractAddress, protocolContractTreeRoot } from '@aztec/protocol-contracts';

import { type HDAccount, type PrivateKeyAccount } from 'viem';
import { foundry } from 'viem/chains';

export { deployAndInitializeTokenAndBridgeContracts } from '../shared/cross_chain_test_harness.js';

export const setupL1Contracts = async (
  l1RpcUrl: string,
  account: HDAccount | PrivateKeyAccount,
  logger: Logger,
  args: Pick<DeployL1ContractsArgs, 'assumeProvenThrough' | 'initialValidators'> & L1ContractsConfig,
) => {
  const l1Data = await deployL1Contracts(l1RpcUrl, account, foundry, logger, {
    l2FeeJuiceAddress: ProtocolContractAddress.FeeJuice,
    vkTreeRoot: getVKTreeRoot(),
    protocolContractTreeRoot,
    salt: undefined,
    ...args,
  });

  return l1Data;
};
