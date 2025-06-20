import { Fr } from '@aztec/foundation/fields';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import type { PublicTxResult } from '@aztec/simulator/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe('AVM Witgen & Circuit apps tests: TokenContract', () => {
  jest.setTimeout(TIMEOUT);
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  let token: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);

    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

    await tester.simProveVerify(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          fnName: 'constructor',
          args: constructorArgs,
          address: token.address,
        },
      ],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
    );
  });

  it.skip('token mint, transfer, burn', async () => {
    const mintAmount = 100n;
    const transferAmount = 50n;
    const authwitNonce = new Fr(0);

    await checkBalance(sender, 0n);

    await tester.simProveVerify(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
          address: token.address,
        },
      ],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
    );
    await checkBalance(sender, mintAmount);

    await tester.simProveVerify(
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
          address: token.address,
        },
      ],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
    );
    await checkBalance(sender, mintAmount - transferAmount);
    await checkBalance(receiver, transferAmount);

    await tester.simProveVerify(
      /*sender=*/ receiver,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          fnName: 'burn_public',
          args: [/*from=*/ receiver, transferAmount, authwitNonce],
          address: token.address,
        },
      ],
      /*teardownCall=*/ undefined,
      /*expectRevert=*/ false,
    );
    await checkBalance(receiver, 0n);
  });

  const checkBalance = async (account: AztecAddress, expectedBalance: bigint) => {
    const balResult = await tester.simulateTx(
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
  };
});

function expectAppCall0Output(txResult: PublicTxResult, expectedOutput: Fr[]): void {
  expect(txResult.processedPhases).toEqual([
    expect.objectContaining({ returnValues: [expect.objectContaining({ values: expectedOutput })] }),
  ]);
}
