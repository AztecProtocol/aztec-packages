import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

export async function ammTest(tester: PublicTxSimulationTester, logger: Logger) {
  const startTime = performance.now();

  const admin = AztecAddress.fromNumber(42);

  logger.debug(`Deploying tokens`);
  const token0 = await deployToken(tester, admin, /*seed=*/ 0);
  const token1 = await deployToken(tester, admin, /*seed=*/ 1);
  const liquidityToken = await deployToken(tester, admin, /*seed=*/ 2);
  logger.debug(`Deploying AMM`);
  const constructorArgs = [token0, token1, liquidityToken];
  const amm = await tester.registerAndDeployContract(
    constructorArgs,
    /*deployer=*/ admin,
    AMMContractArtifact,
    /*skipNullifierInsertion=*/ false,
    /*seed=*/ 3,
  );

  const ammConstructorResult = await tester.simulateTx(
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'constructor',
        args: constructorArgs,
        address: amm.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'AMM.constructor',
  );
  expect(ammConstructorResult.revertCode.isOK()).toBe(true);

  // set the AMM as the minter for the liquidity token
  const setMinterResult = await tester.simulateTx(
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'set_minter',
        args: [/*minter=*/ amm, /*approve=*/ true],
        address: liquidityToken.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'AMM.set_minter',
  );
  expect(setMinterResult.revertCode.isOK()).toBe(true);

  // AMM must have balance of both tokens to initiate the private portion of add_liquidity.
  await mint(tester, admin, /*to=*/ amm.address, /*amount=*/ INITIAL_TOKEN_BALANCE, token0);
  await mint(tester, admin, /*to=*/ amm.address, /*amount=*/ INITIAL_TOKEN_BALANCE, token1);

  const refundToken0PartialNote = {
    commitment: new Fr(42),
  };
  const refundToken1PartialNote = {
    commitment: new Fr(66),
  };
  const liquidityPartialNote = {
    commitment: new Fr(99),
  };

  const amount0Max = (INITIAL_TOKEN_BALANCE * 6n) / 10n;
  const amount0Min = (INITIAL_TOKEN_BALANCE * 4n) / 10n;
  const amount1Max = (INITIAL_TOKEN_BALANCE * 5n) / 10n;
  const amount1Min = (INITIAL_TOKEN_BALANCE * 4n) / 10n;

  // Public storage slot for partial notes must be nonzero
  await tester.setPublicStorage(token0.address, refundToken0PartialNote.commitment, new Fr(1));
  await tester.setPublicStorage(token1.address, refundToken1PartialNote.commitment, new Fr(1));
  await tester.setPublicStorage(liquidityToken.address, liquidityPartialNote.commitment, new Fr(1));

  logger.debug(`Adding liquidity`);
  const addLiquidityResult = await tester.simulateTx(
    /*sender=*/ amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: '_add_liquidity',
        args: [
          /*config=*/ {
            token0: token0.address,
            token1: token1.address,
            // eslint-disable-next-line camelcase
            liquidity_token: liquidityToken.address,
          },
          refundToken0PartialNote,
          refundToken1PartialNote,
          liquidityPartialNote,
          amount0Max,
          amount1Max,
          amount0Min,
          amount1Min,
        ],
        address: amm.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'AMM.add_liquidity',
  );
  expect(addLiquidityResult.revertCode.isOK()).toBe(true);
  logger.debug(`Added liquidity`);

  const tokenOutPartialNote = {
    commitment: new Fr(111),
  };
  await tester.setPublicStorage(token1.address, tokenOutPartialNote.commitment, new Fr(1));

  const swapResult = await tester.simulateTx(
    /*sender=*/ amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: '_swap_exact_tokens_for_tokens',
        args: [token0.address, token1.address, amount0Max, amount1Min, tokenOutPartialNote],
        address: amm.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'AMM.swap',
  );
  expect(swapResult.revertCode.isOK()).toBe(true);

  const liquidity = 100n;
  // Mimic remove_liquidity's `transfer_to_public` by minting liquidity tokens to the AMM.
  await mint(tester, admin, /*to=*/ amm.address, /*amount=*/ liquidity, liquidityToken);

  const token0OutPartialNote = {
    commitment: new Fr(222),
  };
  const token1OutPartialNote = {
    commitment: new Fr(333),
  };
  // Public storage slot for partial notes must be nonzero
  await tester.setPublicStorage(token0.address, token0OutPartialNote.commitment, new Fr(1));
  await tester.setPublicStorage(token1.address, token1OutPartialNote.commitment, new Fr(1));

  const removeLiquidityResult = await tester.simulateTx(
    /*sender=*/ amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: '_remove_liquidity',
        args: [
          /*config=*/ {
            token0: token0.address,
            token1: token1.address,
            // eslint-disable-next-line camelcase
            liquidity_token: liquidityToken.address,
          },
          liquidity,
          token0OutPartialNote,
          token1OutPartialNote,
          /*amount0Min=*/ 1n,
          /*amount1Min=*/ 1n,
        ],
        address: amm.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'AMM.remove_liquidity',
  );
  expect(removeLiquidityResult.revertCode.isOK()).toBe(true);

  const endTime = performance.now();

  logger.verbose(`AMM public tx simulator test took ${endTime - startTime}ms\n`);
}

async function deployToken(tester: PublicTxSimulationTester, admin: AztecAddress, seed = 0) {
  const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
  const token = await tester.registerAndDeployContract(
    constructorArgs,
    /*deployer=*/ admin,
    TokenContractArtifact,
    /*skipNullifierInsertion=*/ false,
    seed,
  );

  const result = await tester.simulateTx(
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
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'Token.constructor',
  );
  expect(result.revertCode.isOK()).toBe(true);
  return token;
}

async function mint(
  tester: PublicTxSimulationTester,
  admin: AztecAddress,
  to: AztecAddress,
  amount: bigint,
  token: ContractInstanceWithAddress,
) {
  const result = await tester.simulateTx(
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'mint_to_public',
        args: [to, amount],
        address: token.address,
      },
    ],
    /*teardownCall=*/ undefined,
    /*feePayer=*/ undefined,
    /*firstNullifier=*/ undefined,
    /*globals=*/ undefined,
    /*metricsTag=*/ 'Token.mint_to_public',
  );
  expect(result.revertCode.isOK()).toBe(true);
  return token;
}
