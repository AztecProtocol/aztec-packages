import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import type { PublicTxResult } from '../../index.js';

export async function tokenTest(tester: PublicTxSimulationTester, logger: Logger) {
  const startTime = performance.now();

  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
  const token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

  const constructorResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'constructor',
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'constructor',
        args: constructorArgs,
      },
    ],
  );
  expect(constructorResult.revertCode.isOK()).toBe(true);

  const mintAmount = 100n;
  const mintResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'mint_to_public',
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'mint_to_public',
        args: [/*to=*/ sender, mintAmount],
      },
    ],
  );
  expect(mintResult.revertCode.isOK()).toBe(true);
  await checkBalance(tester, token, sender, sender, mintAmount);

  const nonce = new Fr(0);
  const transferAmount = 50n;
  const transferResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'transfer_in_public',
    /*sender=*/ sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'transfer_in_public',
        args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, nonce],
      },
    ],
  );
  expect(transferResult.revertCode.isOK()).toBe(true);
  await checkBalance(tester, token, sender, receiver, mintAmount - transferAmount);
  await checkBalance(tester, token, sender, receiver, transferAmount);

  const balResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'balance_of_public',
    sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'balance_of_public',
        args: [/*owner=*/ receiver],
        isStaticCall: true,
      },
    ],
  );
  expect(balResult.revertCode.isOK()).toBe(true);

  const burnResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'burn_public',
    /*sender=*/ receiver,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'burn_public',
        args: [/*from=*/ receiver, transferAmount, nonce],
      },
    ],
  );
  expect(burnResult.revertCode.isOK()).toBe(true);
  await checkBalance(tester, token, sender, receiver, 0n);

  const endTime = performance.now();

  logger.info(`TokenContract public tx simulator test took ${endTime - startTime}ms\n`);
}

async function checkBalance(
  tester: PublicTxSimulationTester,
  token: ContractInstanceWithAddress,
  sender: AztecAddress,
  account: AztecAddress,
  expectedBalance: bigint,
) {
  const balResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'balance_of_public',
    sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'balance_of_public',
        args: [/*owner=*/ account],
        isStaticCall: true,
      },
    ],
  );
  expect(balResult.revertCode.isOK()).toBe(true);
  expectAppCall0Output(balResult, [new Fr(expectedBalance)]);
}

function expectAppCall0Output(txResult: PublicTxResult, expectedOutput: Fr[]): void {
  expect(txResult.processedPhases).toEqual([
    expect.objectContaining({ returnValues: [expect.objectContaining({ values: expectedOutput })] }),
  ]);
}
