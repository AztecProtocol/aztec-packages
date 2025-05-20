import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestERC20Abi as FeeAssetAbi } from '@aztec/l1-artifacts/TestERC20Abi';

import type { Anvil } from '@viem/anvil';
import omit from 'lodash.omit';
import { type GetContractReturnType, getContract } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { createExtendedL1Client } from '../client.js';
import { DefaultL1ContractsConfig } from '../config.js';
import { deployL1Contracts } from '../deploy_l1_contracts.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { FeeAssetHandlerContract } from './fee_asset_handler.js';

const originalVersionSalt = 42;

describe('FeeAssetHandler', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let feeAssetHandler: FeeAssetHandlerContract;
  let feeAsset: GetContractReturnType<typeof FeeAssetAbi, ExtendedViemWalletClient>;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:fee_asset_handler');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    const vkTreeRoot = Fr.random();
    const protocolContractTreeRoot = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    const l1Client = createExtendedL1Client([rpcUrl], privateKey, foundry);

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      genesisArchiveRoot: Fr.random(),
    });
    // Since the registry cannot "see" the slash factory, we omit it from the addresses for this test
    const deployedAddresses = omit(deployed.l1ContractAddresses, 'slashFactoryAddress');
    const txUtils = new L1TxUtils(l1Client, logger);
    feeAssetHandler = new FeeAssetHandlerContract(deployedAddresses.feeAssetHandlerAddress!.toString(), txUtils);
    feeAsset = getContract({
      address: deployedAddresses.feeJuiceAddress!.toString(),
      abi: FeeAssetAbi,
      client: l1Client,
    });
  });

  afterAll(async () => {
    await anvil.stop().catch(logger.error);
  });

  it('should mint fee asset', async () => {
    const address = EthAddress.random();
    for (let i = 1; i <= 10; i++) {
      const txHash = await feeAssetHandler.mint(address.toString());
      expect(txHash.receipt.status).toBe('success');
      logger.verbose(`Minted fee asset in ${txHash.receipt.transactionHash}`);
      const balance = await feeAsset.read.balanceOf([address.toString()]);
      expect(balance).toBe((await feeAssetHandler.getMintAmount()) * BigInt(i));
    }
  });
});
