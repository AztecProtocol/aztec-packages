import { type AztecNodeConfig, aztecNodeConfigMappings } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/circuits.js';
import { startAnvil } from '@aztec/ethereum/test';
import { getDefaultConfig } from '@aztec/foundation/config';

import { type Anvil } from '@viem/anvil';
import { mnemonicToAccount } from 'viem/accounts';

import { DefaultMnemonic } from '../mnemonic.js';
import { deployContractsToL1 } from '../sandbox.js';
import { validateL1Config } from './validation.js';

describe('validation', () => {
  describe('L1 config', () => {
    let anvil: Anvil;
    let l1RpcUrl: string;
    let nodeConfig: AztecNodeConfig;

    beforeAll(async () => {
      ({ anvil, rpcUrl: l1RpcUrl } = await startAnvil());

      nodeConfig = { ...getDefaultConfig(aztecNodeConfigMappings), l1RpcUrl };
      nodeConfig.aztecSlotDuration = 72; // Tweak config so we don't have just defaults
      const account = mnemonicToAccount(DefaultMnemonic);
      const deployed = await deployContractsToL1(nodeConfig, account, undefined, { salt: 1 });
      nodeConfig.l1Contracts = deployed;
    });

    afterAll(async () => {
      await anvil.stop();
    });

    it('validates correct config', async () => {
      await validateL1Config(nodeConfig);
    });

    it('throws on invalid l1 settings', async () => {
      await expect(validateL1Config({ ...nodeConfig, aztecSlotDuration: 96 })).rejects.toThrow(/aztecSlotDuration/);
    });

    it('throws on mismatching l1 addresses', async () => {
      const wrongL1Contracts = { ...nodeConfig.l1Contracts, feeJuicePortalAddress: EthAddress.random() };
      const wrongConfig = { ...nodeConfig, l1Contracts: wrongL1Contracts };
      await expect(validateL1Config(wrongConfig)).rejects.toThrow(/feeJuicePortalAddress/);
    });
  });
});
