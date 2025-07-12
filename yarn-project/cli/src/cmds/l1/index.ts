import { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { withoutHexPrefix } from '@aztec/foundation/string';

import { type Command, Option } from 'commander';

import {
  ETHEREUM_HOSTS,
  MNEMONIC,
  PRIVATE_KEY,
  l1ChainIdOption,
  parseAztecAddress,
  parseBigint,
  parseEthereumAddress,
  pxeOption,
} from '../../utils/commands.js';

export { addL1Validator } from './update_l1_validators.js';

const l1RpcUrlsOption = new Option(
  '--l1-rpc-urls <string>',
  'List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated)',
)
  .env('ETHEREUM_HOSTS')
  .default([ETHEREUM_HOSTS])
  .makeOptionMandatory(true)
  .argParser((arg: string) => arg.split(',').map(url => url.trim()));

export function injectCommands(program: Command, log: LogFn, debugLogger: Logger) {
  program
    .command('deploy-l1-contracts')
    .description('Deploys all necessary Ethereum contracts for Aztec.')
    .addOption(l1RpcUrlsOption)
    .option('-pk, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option('--validators <string>', 'Comma separated list of validators')
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use in deployment', arg => parseInt(arg), 0)
    .addOption(l1ChainIdOption)
    .option('--salt <number>', 'The optional salt to use in deployment', arg => parseInt(arg))
    .option('--json', 'Output the contract addresses in JSON format')
    .option('--test-accounts', 'Populate genesis state with initial fee juice for test accounts')
    .option('--sponsored-fpc', 'Populate genesis state with a testing sponsored FPC contract')
    .option('--accelerated-test-deployments', 'Fire and forget deployment transactions, use in testing only', false)
    .option('--real-verifier', 'Deploy the real verifier', false)
    .action(async options => {
      const { deployL1Contracts } = await import('./deploy_l1_contracts.js');

      const initialValidators =
        options.validators?.split(',').map((validator: string) => EthAddress.fromString(validator)) || [];
      await deployL1Contracts(
        options.l1RpcUrls,
        options.l1ChainId,
        options.privateKey,
        options.mnemonic,
        options.mnemonicIndex,
        options.salt,
        options.testAccounts,
        options.sponsoredFpc,
        options.acceleratedTestDeployments,
        options.json,
        initialValidators,
        options.realVerifier,
        log,
        debugLogger,
      );
    });

  program
    .command('deploy-new-rollup')
    .description('Deploys a new rollup contract and adds it to the registry (if you are the owner).')
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .option('-pk, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option('--validators <string>', 'Comma separated list of validators')
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      MNEMONIC ?? 'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use in deployment', arg => parseInt(arg), 0)
    .addOption(l1ChainIdOption)
    .option('--salt <number>', 'The optional salt to use in deployment', arg => parseInt(arg))
    .option('--json', 'Output the contract addresses in JSON format')
    .option('--test-accounts', 'Populate genesis state with initial fee juice for test accounts')
    .option('--sponsored-fpc', 'Populate genesis state with a testing sponsored FPC contract')
    .option('--real-verifier', 'Deploy the real verifier', false)
    .action(async options => {
      const { deployNewRollup } = await import('./deploy_new_rollup.js');

      const initialValidators =
        options.validators?.split(',').map((validator: string) => EthAddress.fromString(validator)) || [];
      await deployNewRollup(
        options.registryAddress,
        options.l1RpcUrls,
        options.l1ChainId,
        options.privateKey,
        options.mnemonic,
        options.mnemonicIndex,
        options.salt,
        options.testAccounts,
        options.sponsoredFpc,
        options.json,
        initialValidators,
        options.realVerifier,
        log,
        debugLogger,
      );
    });

  program
    .command('deposit-governance-tokens')
    .description('Deposits governance tokens to the governance contract.')
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .requiredOption('--recipient <string>', 'The recipient of the tokens', parseEthereumAddress)
    .requiredOption('-a, --amount <string>', 'The amount of tokens to deposit', parseBigint)
    .option('--mint', 'Mint the tokens on L1', false)
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('-p, --private-key <string>', 'The private key to use to deposit', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use to deposit',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use to deposit', arg => parseInt(arg), 0)
    .action(async options => {
      const { depositGovernanceTokens } = await import('./governance_utils.js');
      await depositGovernanceTokens({
        registryAddress: options.registryAddress.toString(),
        recipient: options.recipient.toString(),
        amount: options.amount,
        mint: options.mint,
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        mnemonicIndex: options.mnemonicIndex,
        debugLogger,
      });
    });

  program
    .command('propose-with-lock')
    .description('Makes a proposal to governance with a lock')
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .requiredOption('-p, --payload-address <string>', 'The address of the payload contract', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('-pk, --private-key <string>', 'The private key to use to propose', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use to propose',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use to propose', arg => parseInt(arg), 0)
    .option('--json', 'Output the proposal ID in JSON format')
    .action(async options => {
      const { proposeWithLock } = await import('./governance_utils.js');
      await proposeWithLock({
        payloadAddress: options.payloadAddress.toString(),
        registryAddress: options.registryAddress.toString(),
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        mnemonicIndex: options.mnemonicIndex,
        debugLogger: debugLogger,
        json: options.json,
        log,
      });
    });

  program
    .command('vote-on-governance-proposal')
    .description('Votes on a governance proposal.')
    .requiredOption('-p, --proposal-id <string>', 'The ID of the proposal', parseBigint)
    .option('-a, --vote-amount <string>', 'The amount of tokens to vote', parseBigint)
    .requiredOption(
      '--in-favor <boolean>',
      'Whether to vote in favor of the proposal. Use "yea" for true, any other value for false.',
      arg => arg === 'yea' || arg === 'true' || arg === '1' || arg === 'yes',
    )
    .requiredOption('--wait <boolean>', 'Whether to wait until the proposal is active', arg => arg === 'true')
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('-pk, --private-key <string>', 'The private key to use to vote', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use to vote',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use to vote', arg => parseInt(arg), 0)
    .action(async options => {
      const { voteOnGovernanceProposal } = await import('./governance_utils.js');
      await voteOnGovernanceProposal({
        proposalId: options.proposalId,
        voteAmount: options.voteAmount,
        inFavor: options.inFavor,
        waitTilActive: options.wait,
        registryAddress: options.registryAddress.toString(),
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        mnemonicIndex: options.mnemonicIndex,
        debugLogger,
      });
    });

  program
    .command('execute-governance-proposal')
    .description('Executes a governance proposal.')
    .requiredOption('-p, --proposal-id <string>', 'The ID of the proposal', parseBigint)
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .requiredOption('--wait <boolean>', 'Whether to wait until the proposal is executable', arg => arg === 'true')
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('-pk, --private-key <string>', 'The private key to use to vote', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use to vote',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use to vote', arg => parseInt(arg), 0)
    .action(async options => {
      const { executeGovernanceProposal } = await import('./governance_utils.js');
      await executeGovernanceProposal({
        proposalId: options.proposalId,
        registryAddress: options.registryAddress.toString(),
        waitTilExecutable: options.wait,
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        mnemonicIndex: options.mnemonicIndex,
        debugLogger,
      });
    });

  program
    .command('get-l1-addresses')
    .description('Gets the addresses of the L1 contracts.')
    .requiredOption('-r, --registry-address <string>', 'The address of the registry contract', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .requiredOption('-v, --rollup-version <number>', 'The version of the rollup', arg => {
      if (arg === 'canonical' || arg === 'latest' || arg === '') {
        return 'canonical';
      }
      const version = parseInt(arg);
      if (isNaN(version)) {
        throw new Error('Invalid rollup version');
      }
      return version;
    })
    .addOption(l1ChainIdOption)
    .option('--json', 'Output the addresses in JSON format')
    .action(async options => {
      const { getL1Addresses } = await import('./get_l1_addresses.js');
      await getL1Addresses(
        options.registryAddress,
        options.rollupVersion,
        options.l1RpcUrls,
        options.l1ChainId,
        options.json,
        log,
      );
    });

  program
    .command('generate-l1-account')
    .description('Generates a new private key for an account on L1.')
    .option('--json', 'Output the private key in JSON format')
    .action(async () => {
      const { generateL1Account } = await import('./update_l1_validators.js');
      const account = generateL1Account();
      log(JSON.stringify(account, null, 2));
    });

  program
    .command('add-l1-validator')
    .description('Adds a validator to the L1 rollup contract.')
    .addOption(l1RpcUrlsOption)
    .option('-pk, --private-key <string>', 'The private key to use sending the transaction', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use sending the transaction',
      'test test test test test test test test test test test junk',
    )
    .addOption(l1ChainIdOption)
    .option('--attester <address>', 'ethereum address of the attester', parseEthereumAddress)
    .option('--staking-asset-handler <address>', 'ethereum address of the staking asset handler', parseEthereumAddress)
    .option('--proof <buffer>', 'The proof to use for the attestation', arg =>
      Buffer.from(withoutHexPrefix(arg), 'hex'),
    )
    .option(
      '--merkle-proof <string>',
      'The merkle proof to use for the attestation (comma separated list of 32 byte buffers)',
      arg => arg.split(','),
    )
    .action(async options => {
      const { addL1Validator } = await import('./update_l1_validators.js');
      await addL1Validator({
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        attesterAddress: options.attester,
        stakingAssetHandlerAddress: options.stakingAssetHandler,
        merkleProof: options.merkleProof,
        proofParams: options.proof,
        log,
        debugLogger,
      });
    });

  program
    .command('remove-l1-validator')
    .description('Removes a validator to the L1 rollup contract.')
    .addOption(l1RpcUrlsOption)
    .option('-pk, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .addOption(l1ChainIdOption)
    .option('--validator <address>', 'ethereum address of the validator', parseEthereumAddress)
    .option('--rollup <address>', 'ethereum address of the rollup contract', parseEthereumAddress)
    .action(async options => {
      const { removeL1Validator } = await import('./update_l1_validators.js');
      await removeL1Validator({
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        validatorAddress: options.validator,
        rollupAddress: options.rollup,
        log,
        debugLogger,
      });
    });

  program
    .command('fast-forward-epochs')
    .description('Fast forwards the epoch of the L1 rollup contract.')
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('--rollup <address>', 'ethereum address of the rollup contract', parseEthereumAddress)
    .option('--count <number>', 'The number of epochs to fast forward', arg => BigInt(parseInt(arg)), 1n)
    .action(async options => {
      const { fastForwardEpochs } = await import('./update_l1_validators.js');
      await fastForwardEpochs({
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        rollupAddress: options.rollup,
        numEpochs: options.count,
        log,
        debugLogger,
      });
    });

  program
    .command('trigger-seed-snapshot')
    .description('Triggers a seed snapshot for the next epoch.')
    .option('-pk, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .option('--rollup <address>', 'ethereum address of the rollup contract', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .action(async options => {
      const { triggerSeedSnapshot } = await import('./trigger_seed_snapshot.js');
      await triggerSeedSnapshot({
        rollupAddress: options.rollup,
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        log,
      });
    });

  program
    .command('debug-rollup')
    .description('Debugs the rollup contract.')
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('--rollup <address>', 'ethereum address of the rollup contract', parseEthereumAddress)
    .action(async options => {
      const { debugRollup } = await import('./update_l1_validators.js');
      await debugRollup({
        rpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        rollupAddress: options.rollup,
        log,
        debugLogger,
      });
    });

  program
    .command('prune-rollup')
    .description('Prunes the pending chain on the rollup contract.')
    .addOption(l1RpcUrlsOption)
    .option('-pk, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .addOption(l1ChainIdOption)
    .option('--rollup <address>', 'ethereum address of the rollup contract', parseEthereumAddress)
    .action(async options => {
      const { pruneRollup } = await import('./update_l1_validators.js');
      await pruneRollup({
        rpcUrls: options.rpcUrls,
        chainId: options.l1ChainId,
        privateKey: options.privateKey,
        mnemonic: options.mnemonic,
        rollupAddress: options.rollup,
        log,
        debugLogger,
      });
    });

  program
    .command('deploy-l1-verifier')
    .description('Deploys the rollup verifier contract')
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('--l1-private-key <string>', 'The L1 private key to use for deployment', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .option('-i, --mnemonic-index <number>', 'The index of the mnemonic to use in deployment', arg => parseInt(arg), 0)
    .requiredOption('--verifier <verifier>', 'Either mock or real', 'real')
    .action(async options => {
      const { deployMockVerifier, deployUltraHonkVerifier } = await import('./deploy_l1_verifier.js');
      if (options.verifier === 'mock') {
        await deployMockVerifier(options.l1RpcUrls, options.l1ChainId, options.l1PrivateKey, options.mnemonic, log);
      } else {
        await deployUltraHonkVerifier(
          options.l1RpcUrls,
          options.l1ChainId,
          options.l1PrivateKey,
          options.mnemonic,
          options.mnemonicIndex,
          log,
        );
      }
    });

  program
    .command('bridge-erc20')
    .description('Bridges ERC20 tokens to L2.')
    .argument('<amount>', 'The amount of Fee Juice to mint and bridge.', parseBigint)
    .argument('<recipient>', 'Aztec address of the recipient.', parseAztecAddress)
    .addOption(l1RpcUrlsOption)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use for deriving the Ethereum address that will mint and bridge',
      'test test test test test test test test test test test junk',
    )
    .option('--mint', 'Mint the tokens on L1', false)
    .option('--private', 'If the bridge should use the private flow', false)
    .addOption(l1ChainIdOption)
    .requiredOption('-t, --token <string>', 'The address of the token to bridge', parseEthereumAddress)
    .requiredOption('-p, --portal <string>', 'The address of the portal contract', parseEthereumAddress)
    .option('--l1-private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option('--json', 'Output the claim in JSON format')
    .action(async (amount, recipient, options) => {
      const { bridgeERC20 } = await import('./bridge_erc20.js');
      await bridgeERC20(
        amount,
        recipient,
        options.l1RpcUrls,
        options.l1ChainId,
        options.l1PrivateKey,
        options.mnemonic,
        options.token,
        options.portal,
        options.private,
        options.mint,
        options.json,
        log,
        debugLogger,
      );
    });

  program
    .command('create-l1-account')
    .option('--json', 'Output the account in JSON format')
    .action(async options => {
      const { createL1Account } = await import('./create_l1_account.js');
      createL1Account(options.json, log);
    });

  program
    .command('get-l1-balance')
    .description('Gets the balance of an ERC token in L1 for the given Ethereum address.')
    .argument('<who>', 'Ethereum address to check.', parseEthereumAddress)
    .addOption(l1RpcUrlsOption)
    .option('-t, --token <string>', 'The address of the token to check the balance of', parseEthereumAddress)
    .addOption(l1ChainIdOption)
    .option('--json', 'Output the balance in JSON format')
    .action(async (who, options) => {
      const { getL1Balance } = await import('./get_l1_balance.js');
      await getL1Balance(who, options.token, options.l1RpcUrls, options.l1ChainId, options.json, log);
    });

  program
    .command('set-proven-through', { hidden: true })
    .description(
      'Instructs the L1 rollup contract to assume all blocks until the given number are automatically proven.',
    )
    .argument('[blockNumber]', 'The target block number, defaults to the latest pending block number.', parseBigint)
    .addOption(l1RpcUrlsOption)
    .addOption(pxeOption)
    .action(async (blockNumber, options) => {
      const { assumeProvenThrough } = await import('./assume_proven_through.js');
      await assumeProvenThrough(blockNumber, options.l1RpcUrls, options.rpcUrl, log);
    });

  program
    .command('advance-epoch')
    .description('Use L1 cheat codes to warp time until the next epoch.')
    .addOption(l1RpcUrlsOption)
    .addOption(pxeOption)
    .action(async options => {
      const { advanceEpoch } = await import('./advance_epoch.js');
      await advanceEpoch(options.l1RpcUrls, options.rpcUrl, log);
    });

  program
    .command('prover-stats', { hidden: true })
    .addOption(l1RpcUrlsOption)
    .addOption(l1ChainIdOption)
    .option('--start-block <number>', 'The L1 block number to start from', parseBigint, 1n)
    .option('--end-block <number>', 'The last L1 block number to query', parseBigint)
    .option('--batch-size <number>', 'The number of blocks to query in each batch', parseBigint, 100n)
    .option('--proving-timeout <number>', 'Cutoff for proving time to consider a block', parseBigint)
    .option('--l1-rollup-address <string>', 'Address of the rollup contract (required if node URL is not set)')
    .option(
      '--node-url <string>',
      'JSON RPC URL of an Aztec node to retrieve the rollup contract address (required if L1 rollup address is not set)',
    )
    .option('--raw-logs', 'Output raw logs instead of aggregated stats')
    .action(async options => {
      const { proverStats } = await import('./prover_stats.js');
      const { l1RpcUrls, chainId, l1RollupAddress, startBlock, endBlock, batchSize, nodeUrl, provingTimeout, rawLogs } =
        options;
      await proverStats({
        l1RpcUrls,
        chainId,
        l1RollupAddress,
        startBlock,
        endBlock,
        batchSize,
        nodeUrl,
        provingTimeout,
        rawLogs,
        log,
      });
    });

  return program;
}
