import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TestERC20Abi as FeeAssetAbi } from '@aztec/l1-artifacts/TestERC20Abi';

import type { Anvil } from '@viem/anvil';
import omit from 'lodash.omit';
import { type GetContractReturnType, getContract } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { DefaultL1ContractsConfig } from '../config.js';
import { createL1Clients, deployL1Contracts } from '../deploy_l1_contracts.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import { startAnvil } from '../test/start_anvil.js';
import type { L1Clients } from '../types.js';
import { FeeAssetHandlerContract, MINT_AMOUNT } from './fee_asset_handler.js';

const originalVersionSalt = 42;

describe('Registry', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let privateKey: PrivateKeyAccount;
  let logger: Logger;

  let vkTreeRoot: Fr;
  let protocolContractTreeRoot: Fr;
  let l2FeeJuiceAddress: Fr;
  let publicClient: L1Clients['publicClient'];
  let walletClient: L1Clients['walletClient'];
  let deployedAddresses: L1ContractAddresses;
  let feeAssetHandler: FeeAssetHandlerContract;
  let feeAsset: GetContractReturnType<typeof FeeAssetAbi, L1Clients['publicClient']>;

  beforeAll(async () => {
    logger = createLogger('ethereum:test:registry');
    // this is the 6th address that gets funded by the junk mnemonic
    privateKey = privateKeyToAccount('0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba');
    vkTreeRoot = Fr.random();
    protocolContractTreeRoot = Fr.random();
    l2FeeJuiceAddress = Fr.random();

    ({ anvil, rpcUrl } = await startAnvil());

    ({ publicClient, walletClient } = createL1Clients([rpcUrl], privateKey));

    const deployed = await deployL1Contracts([rpcUrl], privateKey, foundry, logger, {
      ...DefaultL1ContractsConfig,
      salt: originalVersionSalt,
      vkTreeRoot,
      protocolContractTreeRoot,
      l2FeeJuiceAddress,
      genesisArchiveRoot: Fr.random(),
      genesisBlockHash: Fr.random(),
    });
    // Since the registry cannot "see" the slash factory, we omit it from the addresses for this test
    deployedAddresses = omit(deployed.l1ContractAddresses, 'slashFactoryAddress');
    const txUtils = new L1TxUtils(publicClient, walletClient, logger);
    feeAssetHandler = new FeeAssetHandlerContract(deployedAddresses.feeAssetHandlerAddress!.toString(), txUtils);
    feeAsset = getContract({
      address: deployedAddresses.feeJuiceAddress!.toString(),
      abi: FeeAssetAbi,
      client: publicClient,
    });
  });

  afterAll(async () => {
    await anvil.stop();
  });

  it('should mint fee asset', async () => {
    const address = EthAddress.random();
    for (let i = 1; i <= 10; i++) {
      const txHash = await feeAssetHandler.mint(address.toString());
      expect(txHash.receipt.status).toBe('success');
      logger.verbose(`Minted fee asset in ${txHash}`);
      const balance = await feeAsset.read.balanceOf([address.toString()]);
      expect(balance).toBe(MINT_AMOUNT * BigInt(i));
    }
  });
});
