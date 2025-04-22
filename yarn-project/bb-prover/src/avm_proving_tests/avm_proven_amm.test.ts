import { Fr } from '@aztec/foundation/fields';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

describe('AVM Witgen & Circuit apps tests: AMM', () => {
  jest.setTimeout(TIMEOUT);
  const admin = AztecAddress.fromNumber(42);
  const liquidityProvider = AztecAddress.fromNumber(111);
  const otherLiquidityProvider = AztecAddress.fromNumber(222);
  const swapper = AztecAddress.fromNumber(333);

  let token0: ContractInstanceWithAddress;
  let token1: ContractInstanceWithAddress;
  let liquidityToken: ContractInstanceWithAddress;
  let amm: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);
  });

  // TODO(dbanks12): add tester support for authwit and finish implementing this test
  it.skip('amm operations', async () => {
    token0 = await deployToken(/*seed=*/ 0);
    token1 = await deployToken(/*seed=*/ 1);
    liquidityToken = await deployToken(/*seed=*/ 2);
    amm = await deployAMM();

    // set the AMM as the minter for the liquidity token
    await tester.simProveVerify(
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
      /*expectRevert=*/ false,
    );

    await mint(/*to=*/ liquidityProvider, /*amount=*/ INITIAL_TOKEN_BALANCE, token0);
    await mint(/*to=*/ liquidityProvider, /*amount=*/ INITIAL_TOKEN_BALANCE, token1);
    await mint(/*to=*/ otherLiquidityProvider, /*amount=*/ INITIAL_TOKEN_BALANCE, token0);
    await mint(/*to=*/ otherLiquidityProvider, /*amount=*/ INITIAL_TOKEN_BALANCE, token1);
    await mint(/*to=*/ swapper, /*amount=*/ INITIAL_TOKEN_BALANCE, token0);

    //const ammBalancesBefore = await getAmmBalances();
    //const lpBalancesBefore = await getWalletBalances(liquidityProvider);

    //const amount0Max = lpBalancesBefore.token0;
    //const amount0Min = lpBalancesBefore.token0 / 2n;
    //const amount1Max = lpBalancesBefore.token1;
    //const amount1Min = lpBalancesBefore.token1 / 2n;

    //const nonceForAuthwits = Fr.random();
  });

  const deployToken = async (seed = 0) => {
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const token = await tester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ admin,
      TokenContractArtifact,
      /*skipNullifierInsertion=*/ false,
      seed,
    );

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
    return token;
  };

  const deployAMM = async (seed = 0) => {
    const constructorArgs = [token0, token1, liquidityToken];
    const amm = await tester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ admin,
      AMMContractArtifact,
      /*skipNullifierInsertion=*/ false,
      seed,
    );

    await tester.simProveVerify(
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
      /*expectRevert=*/ false,
    );
    return amm;
  };

  const mint = async (to: AztecAddress, amount: bigint, token: ContractInstanceWithAddress) => {
    await tester.simProveVerify(
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
      /*expectRevert=*/ false,
    );
    return token;
  };
});
