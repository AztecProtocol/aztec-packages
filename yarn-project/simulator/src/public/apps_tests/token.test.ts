import { AztecAddress, type ContractInstanceWithAddress, Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

import { PublicTxSimulationTester } from '../fixtures/public_tx_simulation_tester.js';
import { type PublicTxResult } from '../public_tx_simulator.js';

describe('Public TX simulator apps tests: TokenContract', () => {
  const logger = createLogger('public-tx-apps-tests-token');
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  let token: ContractInstanceWithAddress;
  let simTester: PublicTxSimulationTester;

  beforeEach(async () => {
    simTester = await PublicTxSimulationTester.create();
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    token = await simTester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

    const constructorResult = await simTester.simulateTx(
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
  });

  it('token mint, transfer, burn (and check balances)', async () => {
    const startTime = performance.now();

    const mintAmount = 100n;
    const transferAmount = 50n;
    const nonce = new Fr(0);

    await checkBalance(sender, 0n);

    const mintResult = await simTester.simulateTx(
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
    await checkBalance(sender, mintAmount);

    const transferResult = await simTester.simulateTx(
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
    await checkBalance(sender, mintAmount - transferAmount);
    await checkBalance(receiver, transferAmount);

    const burnResult = await simTester.simulateTx(
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
    await checkBalance(receiver, 0n);

    const endTime = performance.now();
    logger.verbose(`TokenContract public tx simulator test took ${endTime - startTime}ms\n`);
  });

  const checkBalance = async (account: AztecAddress, expectedBalance: bigint) => {
    const balResult = await simTester.simulateTx(
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
    expectAppCall0Output(balResult, [new Fr(expectedBalance), Fr.zero()]);
  };
});

function expectAppCall0Output(txResult: PublicTxResult, expectedOutput: Fr[]): void {
  expect(txResult.processedPhases).toEqual([
    expect.objectContaining({ returnValues: [expect.objectContaining({ values: expectedOutput })] }),
  ]);
}
