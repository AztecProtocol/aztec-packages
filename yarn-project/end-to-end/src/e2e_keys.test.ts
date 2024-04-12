import {
  type AccountWallet,
  type AztecAddress,
  BatchCall,
  type DebugLogger,
  ExtendedNote,
  Fr,
  type FunctionCall,
  FunctionSelector,
  Note,
  PrivateFeePaymentMethod,
  PublicFeePaymentMethod,
  type TxHash,
  TxStatus,
  type Wallet,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { FunctionData } from '@aztec/circuits.js';
import { type ContractArtifact, decodeFunctionSignature } from '@aztec/foundation/abi';
import {
  TokenContract as BananaCoin,
  FPCContract,
  GasTokenContract,
  SchnorrAccountContract,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { type BalancesFn, expectMapping, getBalancesFn, publicDeployAccounts, setup } from './fixtures/utils.js';
import { GasPortalTestingHarnessFactory, type IGasBridgingTestHarness } from './shared/gas_portal_test_harness.js';

jest.setTimeout(1_000_000_000);

describe('e2e_fees', () => {
  let wallets: AccountWallet[];
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let gasTokenContract: GasTokenContract;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;

  let gasBridgeTestHarness: IGasBridgingTestHarness;

  let gasBalances: BalancesFn;
  let bananaPublicBalances: BalancesFn;
  let bananaPrivateBalances: BalancesFn;

  beforeAll(async () => {
    const { wallets: _wallets, aztecNode, deployL1ContractsValues, logger, pxe } = await setup(3);
    wallets = _wallets;

    await aztecNode.setConfig({
      feeRecipient: wallets.at(-1)!.getAddress(),
    });

    aliceWallet = wallets[0];
    aliceAddress = wallets[0].getAddress();
    bobAddress = wallets[1].getAddress();
    sequencerAddress = wallets[2].getAddress();

    gasTokenContract = gasBridgeTestHarness.l2Token;
  });

  
});
