import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicProcessorTestEnv } from '../../fixtures/index.js';

describe('Public Processor app tests: TokenContract', () => {
  const logger = createLogger('public-processor-apps-tests-token');

  const NUM_TRANSFERS = 10;
  const admin = AztecAddress.fromNumberUnsafe(42);
  const sender = AztecAddress.fromNumberUnsafe(111);

  let token: ContractInstanceWithAddress;
  let env: PublicProcessorTestEnv;
  let tester: PublicProcessorTestEnv['tester'];
  let processor: PublicProcessorTestEnv['processor'];

  beforeEach(async () => {
    env = await PublicProcessorTestEnv.create();
    ({ tester, processor } = env);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  afterEach(async () => {
    await env[Symbol.asyncDispose]();
  });

  it('token constructor, mint, many transfers', async () => {
    const timer = new Timer();

    const mintAmount = 1_000_000n;
    const transferAmount = 10n;
    const authwitNonce = new Fr(0);

    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];

    token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);
    const constructorTx = await tester.createTx(
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

    const mintTx = await tester.createTx(
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

    const transferTxs = [];
    for (let i = 0; i < NUM_TRANSFERS; i++) {
      const receiver = AztecAddress.fromNumberUnsafe(200 + i); // different receiver each time
      transferTxs.push(
        await tester.createTx(
          /*sender=*/ sender,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            {
              address: token.address,
              fnName: 'transfer_in_public',
              args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
            },
          ],
        ),
      );
    }

    const results = await processor.process([constructorTx, mintTx, ...transferTxs]);
    const processedTxs = results[0];
    const failedTxs = results[1];
    expect(processedTxs.length).toBe(NUM_TRANSFERS + 2); // constructor, mint, transfers
    expect(failedTxs.length).toBe(0);

    logger.verbose(`TokenContract public processor test took ${timer.ms()}ms\n`);
  });
});
