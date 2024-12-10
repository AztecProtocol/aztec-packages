import { createCompatibleClient } from '@aztec/aztec.js';
import { compileContract, createEthereumChain, createL1Clients, deployL1Contract } from '@aztec/ethereum';
import { type LogFn, type Logger } from '@aztec/foundation/log';

import { InvalidOptionArgumentError } from 'commander';
// @ts-expect-error solc-js doesn't publish its types https://github.com/ethereum/solc-js/issues/689
import solc from 'solc';
import { type Hex, getContract } from 'viem';

export async function deployUltraHonkVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrl: string,
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  pxeRpcUrl: string,
  bbBinaryPath: string,
  bbWorkingDirectory: string,
  log: LogFn,
  debugLogger: Logger,
) {
  if (!bbBinaryPath || !bbWorkingDirectory) {
    throw new InvalidOptionArgumentError('Missing path to bb binary and working directory');
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - Importing bb-prover even in devDeps results in a circular dependency error through @aztec/simulator. Need to ignore because this line doesn't cause an error in a dev environment
  const { BBCircuitVerifier } = await import('@aztec/bb-prover');
  const verifier = await BBCircuitVerifier.new({ bbBinaryPath, bbWorkingDirectory, bbSkipCleanup: false });

  const { publicClient, walletClient } = createL1Clients(
    ethRpcUrl,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrl, l1ChainId).chainInfo,
  );

  if (!rollupAddress && pxeRpcUrl) {
    const pxe = await createCompatibleClient(pxeRpcUrl, debugLogger);
    const { l1ContractAddresses } = await pxe.getNodeInfo();
    rollupAddress = l1ContractAddresses.rollupAddress.toString();
  }

  if (!rollupAddress) {
    throw new InvalidOptionArgumentError('Missing rollup address');
  }

  const { RollupAbi } = await import('@aztec/l1-artifacts');

  const rollup = getContract({
    abi: RollupAbi,
    address: rollupAddress,
    client: walletClient,
  });

  // REFACTOR: Extract this method to a common package. We need a package that deals with L1
  // but also has a reference to L1 artifacts and bb-prover.
  const setupVerifier = async (
    artifact: Parameters<(typeof verifier)['generateSolidityContract']>[0], // Cannot properly import the type here due to the hack above
  ) => {
    const contract = await verifier.generateSolidityContract(artifact, 'UltraHonkVerifier.sol');
    log(`Generated UltraHonkVerifier contract for ${artifact}`);
    const { abi, bytecode } = compileContract('UltraHonkVerifier.sol', 'HonkVerifier', contract, solc);
    log(`Compiled UltraHonkVerifier contract for ${artifact}`);
    const { address: verifierAddress } = await deployL1Contract(walletClient, publicClient, abi, bytecode);
    log(`Deployed real ${artifact} verifier at ${verifierAddress}`);
    await rollup.write.setEpochVerifier([verifierAddress.toString()]);
    log(`Set ${artifact} verifier in ${rollup.address} rollup contract to ${verifierAddress}`);
  };

  await setupVerifier('RootRollupArtifact');

  log(`Rollup accepts only real proofs now`);
}

export async function deployMockVerifier(
  rollupAddress: Hex | undefined,
  ethRpcUrl: string,
  l1ChainId: string,
  privateKey: string | undefined,
  mnemonic: string,
  pxeRpcUrl: string,
  log: LogFn,
  debugLogger: Logger,
) {
  const { publicClient, walletClient } = createL1Clients(
    ethRpcUrl,
    privateKey ?? mnemonic,
    createEthereumChain(ethRpcUrl, l1ChainId).chainInfo,
  );
  const { MockVerifierAbi, MockVerifierBytecode, RollupAbi } = await import('@aztec/l1-artifacts');

  const { address: mockVerifierAddress } = await deployL1Contract(
    walletClient,
    publicClient,
    MockVerifierAbi,
    MockVerifierBytecode,
  );
  log(`Deployed MockVerifier at ${mockVerifierAddress.toString()}`);

  if (!rollupAddress && pxeRpcUrl) {
    const pxe = await createCompatibleClient(pxeRpcUrl, debugLogger);
    const { l1ContractAddresses } = await pxe.getNodeInfo();
    rollupAddress = l1ContractAddresses.rollupAddress.toString();
  }

  if (!rollupAddress) {
    throw new InvalidOptionArgumentError('Missing rollup address');
  }

  const rollup = getContract({
    abi: RollupAbi,
    address: rollupAddress,
    client: walletClient,
  });

  await rollup.write.setEpochVerifier([mockVerifierAddress.toString()]);
  log(`Rollup accepts only fake proofs now`);
}
