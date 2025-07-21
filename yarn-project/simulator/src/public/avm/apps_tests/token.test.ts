import { Fr } from '@aztec/foundation/fields';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { AvmSimulationTester } from '../fixtures/avm_simulation_tester.js';

describe('AVM simulator apps tests: TokenContract', () => {
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  let token: ContractInstanceWithAddress;
  let simTester: AvmSimulationTester;

  beforeEach(async () => {
    simTester = await AvmSimulationTester.create();
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    token = await simTester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

    const constructorResult = await simTester.simulateCall(
      /*sender=*/ admin,
      token.address,
      'constructor',
      constructorArgs,
    );
    expect(constructorResult.reverted).toBe(false);
  });

  it('token mint, transfer, burn (and check balances)', async () => {
    const mintAmount = 100n;
    const transferAmount = 50n;
    const authwitNonce = new Fr(0);

    await checkBalance(sender, 0n);

    const mintResult = await simTester.simulateCall(
      /*sender=*/ admin,
      token.address,
      'mint_to_public',
      /*args=*/ [/*to=*/ sender, mintAmount],
    );
    expect(mintResult.reverted).toBe(false);
    await checkBalance(sender, mintAmount);

    const transferResult = await simTester.simulateCall(
      /*sender=*/ sender,
      token.address,
      'transfer_in_public',
      /*args=*/ [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
    );
    expect(transferResult.reverted).toBe(false);
    await checkBalance(sender, mintAmount - transferAmount);
    await checkBalance(receiver, transferAmount);

    const burnResult = await simTester.simulateCall(
      /*sender=*/ receiver,
      token.address,
      'burn_public',
      /*args=*/ [/*from=*/ receiver, transferAmount, authwitNonce],
    );
    expect(burnResult.reverted).toBe(false);
    await checkBalance(receiver, 0n);
  });

  const checkBalance = async (account: AztecAddress, expectedBalance: bigint) => {
    const balResult = await simTester.simulateCall(
      sender,
      token.address,
      'balance_of_public',
      /*args=*/ [/*owner=*/ account],
      /*isStaticCall=*/ true,
    );
    expect(balResult.reverted).toBe(false);
    expect(balResult.output).toEqual([new Fr(expectedBalance)]);
  };
});
