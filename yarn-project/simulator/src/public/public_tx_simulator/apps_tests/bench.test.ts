import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AMMContractArtifact } from '@aztec/noir-contracts.js/AMM';
import { AvmGadgetsTestContractArtifact } from '@aztec/noir-contracts.js/AvmGadgetsTest';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { Metrics } from '@aztec/telemetry-client';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { benchmarkSetup } from '../../../test/bench.js';
import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('Public TX simulator apps tests: benchmarks', () => {
  const logger = createLogger('public-tx-apps-tests-bench');

  let tester: PublicTxSimulationTester;

  let telemetryClient: TelemetryClient;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ telemetryClient, teardown } = benchmarkSetup(
      ///*telemetryConfig=*/ {},
      /*metrics=*/ [
        Metrics.PUBLIC_EXECUTOR_SIMULATION_MANA_USED,
        Metrics.PUBLIC_EXECUTOR_SIMULATION_TOTAL_INSTRUCTIONS,
      ],
    ));
    tester = await PublicTxSimulationTester.create(telemetryClient);
  });

  afterAll(async () => {
    await teardown();
  });

  it('TokenContract', async () => {
    const admin = AztecAddress.fromNumber(42);
    const sender = AztecAddress.fromNumber(111);
    const receiver = AztecAddress.fromNumber(222);

    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const token = await tester.registerAndDeployContract(constructorArgs, /*deployer=*/ admin, TokenContractArtifact);

    const constructorResult = await tester.simulateTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.constructor',
    );
    expect(constructorResult.revertCode.isOK()).toBe(true);

    const startTime = performance.now();

    const mintAmount = 100n;
    const mintResult = await tester.simulateTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.mint_to_public',
    );
    expect(mintResult.revertCode.isOK()).toBe(true);

    const nonce = new Fr(0);
    const transferAmount = 50n;
    const transferResult = await tester.simulateTx(
      /*sender=*/ sender,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, nonce],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.transfer_in_public',
    );
    expect(transferResult.revertCode.isOK()).toBe(true);

    const balResult = await tester.simulateTx(
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
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.balance_of_public',
    );
    expect(balResult.revertCode.isOK()).toBe(true);

    const burnResult = await tester.simulateTx(
      /*sender=*/ receiver,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'burn_public',
          args: [/*from=*/ receiver, transferAmount, nonce],
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'TokenContract.burn_public',
    );
    expect(burnResult.revertCode.isOK()).toBe(true);

    const endTime = performance.now();
    logger.verbose(`BENCH: TokenContract public tx simulator test took ${endTime - startTime}ms\n`);
  });

  it('AVM simulator bulk test', async () => {
    const deployer = AztecAddress.fromNumber(42);

    const avmTestContract = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      deployer,
      /*contractArtifact=*/ AvmTestContractArtifact,
    );

    // Get a deployed contract instance to pass to the contract
    // for it to use as "expected" values when testing contract instance retrieval.
    const expectContractInstance = avmTestContract;
    const argsField = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const argsU8 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => new Fr(x));
    const args = [
      argsField,
      argsU8,
      /*getInstanceForAddress=*/ expectContractInstance.address,
      /*expectedDeployer=*/ expectContractInstance.deployer,
      /*expectedClassId=*/ expectContractInstance.currentContractClassId,
      /*expectedInitializationHash=*/ expectContractInstance.initializationHash,
    ];

    const bulkResult = await tester.simulateTx(
      /*sender=*/ deployer,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: avmTestContract.address,
          fnName: 'bulk_testing',
          args,
        },
      ],
      /*teardownCall=*/ undefined, // use default
      /*feePayer=*/ undefined, // use default
      /*firstNullifier=*/ undefined, // use default
      /*globals=*/ undefined, // use default
      /*metricsTag=*/ 'AvmTestContract.bulk_testing',
    );
    expect(bulkResult.revertCode.isOK()).toBe(true);
  });

  describe('AVM gadgets', () => {
    const deployer = AztecAddress.fromNumber(42);
    let avmGadgetsTestContract: ContractInstanceWithAddress;

    beforeAll(async () => {
      avmGadgetsTestContract = await tester.registerAndDeployContract(
        /*constructorArgs=*/ [],
        deployer,
        /*contractArtifact=*/ AvmGadgetsTestContractArtifact,
      );
    });

    describe.each(
      // sha sizes
      [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 255, 256, 511, 512, 2048],
    )('sha256_hash_%s', (length: number) => {
      it(`sha256_hash_${length}`, async () => {
        const result = await tester.simulateTx(
          /*sender=*/ deployer,
          /*setupCalls=*/ [],
          /*appCalls=*/ [
            {
              address: avmGadgetsTestContract.address,
              fnName: `sha256_hash_${length}`,
              args: [/*input=*/ Array.from({ length: length }, () => randomInt(2 ** 8))],
            },
          ],
          /*teardownCall=*/ undefined, // use default
          /*feePayer=*/ undefined, // use default
          /*firstNullifier=*/ undefined, // use default
          /*globals=*/ undefined, // use default
          /*metricsTag=*/ `AvmGadgetsTestContract.sha256_hash_${length}`,
        );
        expect(result.revertCode.isOK()).toBe(true);
      });
    });

    it('keccak_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => randomInt(2 ** 8))],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.keccak_hash',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('keccak_f1600', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'keccak_f1600',
            args: [/*input=*/ Array.from({ length: 25 }, () => randomInt(2 ** 32))],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.keccak_f1600',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('poseidon2_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'poseidon2_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.poseidon2_hash',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.pedersen_hash',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });

    it('pedersen_hash_with_index', async () => {
      const result = await tester.simulateTx(
        /*sender=*/ deployer,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          {
            address: avmGadgetsTestContract.address,
            fnName: 'pedersen_hash_with_index',
            args: [/*input=*/ Array.from({ length: 10 }, () => Fr.random())],
          },
        ],
        /*teardownCall=*/ undefined, // use default
        /*feePayer=*/ undefined, // use default
        /*firstNullifier=*/ undefined, // use default
        /*globals=*/ undefined, // use default
        /*metricsTag=*/ 'AvmGadgetsTestContract.pedersen_hash_with_index',
      );
      expect(result.revertCode.isOK()).toBe(true);
    });
  });

  it('AMM Contract', async () => {
    const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

    const admin = AztecAddress.fromNumber(42);

    const token0 = await deployToken(admin, /*seed=*/ 0);
    const token1 = await deployToken(admin, /*seed=*/ 1);
    const liquidityToken = await deployToken(admin, /*seed=*/ 2);
    logger.debug(`Deploying AMM`);
    const amm = await deployAMM(admin, token0, token1, liquidityToken);

    // set the AMM as the minter for the liquidity token
    const result = await tester.simulateTx(
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
    expect(result.revertCode.isOK()).toBe(true);

    // AMM must have balance of both tokens to initiate the private portion of add_liquidity.
    await mint(admin, /*to=*/ amm.address, /*amount=*/ INITIAL_TOKEN_BALANCE, token0);
    await mint(admin, /*to=*/ amm.address, /*amount=*/ INITIAL_TOKEN_BALANCE, token1);

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
      /*metricsTag=*/ 'AMM._add_liquidity',
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
      /*metricsTag=*/ 'AMM._swap_exact_tokens_for_tokens',
    );
    expect(swapResult.revertCode.isOK()).toBe(true);

    const liquidity = 100n;
    // Mimic remove_liquidity's `transfer_to_public` by minting liquidity tokens to the AMM.
    await mint(admin, /*to=*/ amm.address, /*amount=*/ liquidity, liquidityToken);

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
      /*metricsTag=*/ 'AMM._remove_liquidity',
    );
    expect(removeLiquidityResult.revertCode.isOK()).toBe(true);
  });

  const deployAMM = async (
    deployer: AztecAddress,
    token0: ContractInstanceWithAddress,
    token1: ContractInstanceWithAddress,
    liquidityToken: ContractInstanceWithAddress,
    seed = 0,
  ) => {
    const constructorArgs = [token0, token1, liquidityToken];
    const amm = await tester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ deployer,
      AMMContractArtifact,
      /*skipNullifierInsertion=*/ false,
      seed,
    );

    const result = await tester.simulateTx(
      /*sender=*/ deployer,
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
    expect(result.revertCode.isOK()).toBe(true);
    return amm;
  };

  const deployToken = async (deployer: AztecAddress, seed = 0) => {
    const constructorArgs = [deployer, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const token = await tester.registerAndDeployContract(
      constructorArgs,
      /*deployer=*/ deployer,
      TokenContractArtifact,
      /*skipNullifierInsertion=*/ false,
      seed,
    );

    const result = await tester.simulateTx(
      /*sender=*/ deployer,
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
      /*metricsTag=*/ 'TokenContract.constructor',
    );
    expect(result.revertCode.isOK()).toBe(true);
    return token;
  };

  const mint = async (admin: AztecAddress, to: AztecAddress, amount: bigint, token: ContractInstanceWithAddress) => {
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
      /*metricsTag=*/ 'TokenContract.mint_to_public',
    );
    expect(result.revertCode.isOK()).toBe(true);
    return token;
  };
});
