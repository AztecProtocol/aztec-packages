import { GeneratorIndex } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';
import { deployToken } from './token_test.js';

const INITIAL_TOKEN_BALANCE = 1_000_000_000n;
/**
 * THIS TEST IS BRITTLE! If it breaks, don't try fixing it.
 * `.skip` it or literally just delete it and notify AVM team.
 * You do NOT need permission to remove this test!
 */
export async function ammTest(tester: PublicTxSimulationTester, logger: Logger) {
  const startTime = performance.now();

  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

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

  const ammConstructorResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'AMM/constructor',
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'constructor',
        args: constructorArgs,
        address: amm.address,
      },
    ],
  );
  expect(ammConstructorResult.revertCode.isOK()).toBe(true);

  logger.debug(`Setting AMM as minter for liquidity token`);

  // set the AMM as the minter for the liquidity token
  const setMinterResult = await tester.simulateTxWithLabel(
    /*txLabel=*/ 'AMM/set_minter',
    /*sender=*/ admin,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      {
        fnName: 'set_minter',
        args: [/*minter=*/ amm, /*approve=*/ true],
        address: liquidityToken.address,
      },
    ],
  );
  expect(setMinterResult.revertCode.isOK()).toBe(true);

  logger.debug(`Adding liquidity`);
  const amount0Max = (INITIAL_TOKEN_BALANCE * 6n) / 10n;
  const amount0Min = (INITIAL_TOKEN_BALANCE * 4n) / 10n;
  const amount1Max = (INITIAL_TOKEN_BALANCE * 5n) / 10n;
  const amount1Min = (INITIAL_TOKEN_BALANCE * 4n) / 10n;

  const addLiquidityResult = await addLiquidity(
    tester,
    sender,
    /*amm=*/ amm,
    /*token0=*/ token0,
    /*token1=*/ token1,
    /*liquidityToken=*/ liquidityToken,
    /*amount0Max=*/ amount0Max,
    /*amount1Max=*/ amount1Max,
    /*amount0Min=*/ amount0Min,
    /*amount1Min=*/ amount1Min,
  );
  expect(addLiquidityResult.revertCode.isOK()).toBe(true);

  logger.debug(`Swapping tokens`);
  const swapResult = await swapExactTokensForTokens(
    tester,
    sender,
    /*amm=*/ amm,
    /*tokenIn=*/ token0,
    /*tokenOut=*/ token1,
    /*amountIn=*/ amount0Min / 10n, // something smaller than total liquidity
    /*amountOutMin=*/ amount1Min / 100n, // something even smaller
  );
  expect(swapResult.revertCode.isOK()).toBe(true);

  logger.debug(`Removing liquidity`);
  const removeLiquidityResult = await removeLiquidity(
    tester,
    sender,
    /*amm=*/ amm,
    /*token0=*/ token0,
    /*token1=*/ token1,
    /*liquidityToken=*/ liquidityToken,
    /*liquidity=*/ 100n,
    /*amount0Min=*/ 1n, // remove some tiny amount
    /*amount1Min=*/ 1n,
  );
  expect(removeLiquidityResult.revertCode.isOK()).toBe(true);

  const endTime = performance.now();

  logger.info(`AMM public tx simulator test took ${endTime - startTime}ms\n`);
}

async function addLiquidity(
  tester: PublicTxSimulationTester,
  sender: AztecAddress,
  amm: ContractInstanceWithAddress,
  token0: ContractInstanceWithAddress,
  token1: ContractInstanceWithAddress,
  liquidityToken: ContractInstanceWithAddress,
  amount0Max: bigint,
  amount1Max: bigint,
  amount0Min: bigint,
  amount1Min: bigint,
  _nonce?: bigint,
) {
  const refundToken0PartialNote = {
    commitment: new Fr(42),
  };
  const refundToken1PartialNote = {
    commitment: new Fr(66),
  };
  const liquidityPartialNote = {
    commitment: new Fr(99),
  };
  const refundToken0PartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    refundToken0PartialNote,
    amm.address,
  );
  const refundToken1PartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    refundToken1PartialNote,
    amm.address,
  );
  const liquidityPartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    liquidityPartialNote,
    amm.address,
  );

  // We need to inject the validity commitments into the nullifier tree as that would be performed by the private token
  // functions that are not invoked in this test.
  await tester.insertNullifier(token0.address, refundToken0PartialNoteValidityCommitment);
  await tester.insertNullifier(token1.address, refundToken1PartialNoteValidityCommitment);
  await tester.insertNullifier(liquidityToken.address, liquidityPartialNoteValidityCommitment);

  return await tester.simulateTxWithLabel(
    /*txLabel=*/ 'AMM/add_liquidity',
    /*sender=*/ sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      // token0.transfer_to_public enqueues a call to _increase_public_balance
      {
        sender: token0.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_increase_public_balance',
        args: [/*to=*/ amm.address, /*amount=*/ amount0Max],
        address: token0.address,
      },
      // token1.transfer_to_public enqueues a call to _increase_public_balance
      {
        sender: token1.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_increase_public_balance',
        args: [/*to=*/ amm.address, /*amount=*/ amount1Max],
        address: token1.address,
      },
      // amm.add_liquidity enqueues a call to _add_liquidity
      {
        sender: amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
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
  );
}

async function swapExactTokensForTokens(
  tester: PublicTxSimulationTester,
  sender: AztecAddress,
  amm: ContractInstanceWithAddress,
  tokenIn: ContractInstanceWithAddress,
  tokenOut: ContractInstanceWithAddress,
  amountIn: bigint,
  amountOutMin: bigint,
  _nonce?: bigint,
) {
  const tokenOutPartialNote = {
    commitment: new Fr(166),
  };
  const tokenOutPartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    tokenOutPartialNote,
    amm.address,
  );

  // We need to inject the validity commitment into the nullifier tree as that would be performed by the private token
  // function that is not invoked in this test.
  await tester.insertNullifier(tokenOut.address, tokenOutPartialNoteValidityCommitment);

  return await tester.simulateTxWithLabel(
    /*txLabel=*/ 'AMM/swap_exact_tokens_for_tokens',
    /*sender=*/ sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      // tokenIn.transfer_to_public enqueues a call to _increase_public_balance
      {
        sender: tokenIn.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_increase_public_balance',
        args: [/*to=*/ amm.address, /*amount=*/ amountIn],
        address: tokenIn.address,
      },
      {
        sender: amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_swap_exact_tokens_for_tokens',
        args: [tokenIn.address, tokenOut.address, amountIn, amountOutMin, tokenOutPartialNote],
        address: amm.address,
      },
    ],
  );
}

async function removeLiquidity(
  tester: PublicTxSimulationTester,
  sender: AztecAddress,
  amm: ContractInstanceWithAddress,
  token0: ContractInstanceWithAddress,
  token1: ContractInstanceWithAddress,
  liquidityToken: ContractInstanceWithAddress,
  liquidity: bigint,
  amount0Min: bigint,
  amount1Min: bigint,
  _nonce?: bigint,
) {
  const token0PartialNote = {
    commitment: new Fr(111),
  };
  const token1PartialNote = {
    commitment: new Fr(222),
  };
  const token0PartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    token0PartialNote,
    amm.address,
  );
  const token1PartialNoteValidityCommitment = await computePartialNoteValidityCommitment(
    token1PartialNote,
    amm.address,
  );

  // We need to inject the validity commitments into the nullifier tree as that would be performed by the private token
  // functions that are not invoked in this test.
  await tester.insertNullifier(token0.address, token0PartialNoteValidityCommitment);
  await tester.insertNullifier(token1.address, token1PartialNoteValidityCommitment);

  return await tester.simulateTxWithLabel(
    /*txLabel=*/ 'AMM/remove_liquidity',
    /*sender=*/ sender,
    /*setupCalls=*/ [],
    /*appCalls=*/ [
      // liquidityToken.transfer_to_public enqueues a call to _increase_public_balance
      {
        sender: liquidityToken.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_increase_public_balance',
        args: [/*to=*/ amm.address, /*amount=*/ liquidity],
        address: liquidityToken.address,
      },
      // amm.remove_liquidity enqueues a call to _remove_liquidity
      {
        sender: amm.address, // INTERNAL FUNCTION! Sender must be 'this'.
        fnName: '_remove_liquidity',
        args: [
          /*config=*/ {
            token0: token0.address,
            token1: token1.address,
            // eslint-disable-next-line camelcase
            liquidity_token: liquidityToken.address,
          },
          liquidity,
          token0PartialNote,
          token1PartialNote,
          amount0Min,
          amount1Min,
        ],
        address: amm.address,
      },
    ],
  );
}

async function computePartialNoteValidityCommitment(partialNote: { commitment: Fr }, completer: AztecAddress) {
  return await poseidon2HashWithSeparator(
    [partialNote.commitment, completer],
    GeneratorIndex.PARTIAL_NOTE_VALIDITY_COMMITMENT,
  );
}
