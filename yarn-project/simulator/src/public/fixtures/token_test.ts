import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicTxSimulationTester } from './public_tx_simulation_tester.js';

export async function tokenTest(
  tester: PublicTxSimulationTester,
  logger: Logger,
  tokenArtifact: ContractArtifact,
  expectToBeTrue: (x: boolean) => void,
) {
  const timer = new Timer();

  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);
  const receiver = AztecAddress.fromNumber(222);

  const token = await setUpToken(tester, tokenArtifact, admin, expectToBeTrue);

  const mintAmount = 100n;
  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  const mintResult = await tester.executeTxWithLabel(
    /*txLabel=*/ 'Token/mint_to_public',
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
  expectToBeTrue(mintResult.revertCode.isOK());
  await checkBalance(tester, token, sender, sender, mintAmount, expectToBeTrue);

  const authwitNonce = new Fr(0);
  const transferAmount = 50n;
  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  const transferResult = await tester.executeTxWithLabel(
    /*txLabel=*/ 'Token/transfer_in_public',
    /*sender=*/ sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'transfer_in_public',
        args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
      },
    ],
  );
  expectToBeTrue(transferResult.revertCode.isOK());
  await checkBalance(tester, token, sender, receiver, mintAmount - transferAmount, expectToBeTrue);
  await checkBalance(tester, token, sender, receiver, transferAmount, expectToBeTrue);

  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  const burnResult = await tester.executeTxWithLabel(
    /*txLabel=*/ 'Token/burn_public',
    /*sender=*/ receiver,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        address: token.address,
        fnName: 'burn_public',
        args: [/*from=*/ receiver, transferAmount, authwitNonce],
      },
    ],
  );
  expectToBeTrue(burnResult.revertCode.isOK());
  await checkBalance(tester, token, sender, receiver, 0n, expectToBeTrue);

  logger.info(`TokenContract test took ${timer.ms()}ms\n`);
}

export async function setUpToken(
  tester: PublicTxSimulationTester,
  tokenArtifact: ContractArtifact,
  admin: AztecAddress,
  expectToBeTrue: (x: boolean) => void,
  seed = 0,
) {
  const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
  const token = await tester.registerAndDeployContract(
    constructorArgs,
    /*deployer=*/ admin,
    tokenArtifact,
    /*skipNullifierInsertion=*/ false,
    seed,
  );

  // EXECUTE! This means that if using AvmProvingTester subclass, it will PROVE the transaction!
  const result = await tester.executeTxWithLabel(
    /*txLabel=*/ 'Token/constructor',
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'constructor',
        args: constructorArgs,
        address: token.address,
      },
    ],
  );
  expectToBeTrue(result.revertCode.isOK());
  return token;
}

async function checkBalance(
  tester: PublicTxSimulationTester,
  token: ContractInstanceWithAddress,
  sender: AztecAddress,
  account: AztecAddress,
  expectedBalance: bigint,
  expectToBeTrue: (x: boolean) => void,
) {
  // Strictly simulate this! No need to "execute" (aka prove if using AvmProvingTester subclass).
  const balResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'Token/balance_of_public',
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
  expectToBeTrue(balResult.revertCode.isOK());
  // should be 1 call with 1 return value that is expectedBalance
  expectToBeTrue(balResult.processedPhases.length == 1);
  expectToBeTrue(balResult.processedPhases[0].returnValues.length == 1);
  expectToBeTrue(balResult.processedPhases[0].returnValues[0].values!.length == 1);
  expectToBeTrue(balResult.processedPhases[0].returnValues[0].values![0].toBigInt() == expectedBalance);
}
