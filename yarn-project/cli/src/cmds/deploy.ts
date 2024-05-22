import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { ContractDeployer, type EthAddress, type Fq, Fr, Point, PublicKey } from '@aztec/aztec.js';
import { type PublicKeys } from '@aztec/circuits.js';
import { getInitializer } from '@aztec/foundation/abi';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { createCompatibleClient } from '../client.js';
import { encodeArgs } from '../encoding.js';
import { GITHUB_TAG_PREFIX } from '../github.js';
import { getContractArtifact } from '../utils.js';

export async function deploy(
  artifactPath: string,
  json: boolean,
  rpcUrl: string,
  publicKeys: PublicKeys,
  rawArgs: any[],
  portalAddress: EthAddress,
  salt: Fr,
  privateKey: Fr,
  signingPrivateKey: Fq,
  initializer: string | undefined,
  wait: boolean,
  debugLogger: DebugLogger,
  log: LogFn,
  logJson: (output: any) => void,
) {
  const contractArtifact = await getContractArtifact(artifactPath, log);
  const constructorArtifact = getInitializer(contractArtifact, initializer);

  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const nodeInfo = await client.getNodeInfo();
  const expectedAztecNrVersion = `${GITHUB_TAG_PREFIX}-v${nodeInfo.nodeVersion}`;
  if (contractArtifact.aztecNrVersion && contractArtifact.aztecNrVersion !== expectedAztecNrVersion) {
    log(
      `\nWarning: Contract was compiled with a different version of Aztec.nr: ${contractArtifact.aztecNrVersion}. Consider updating Aztec.nr to ${expectedAztecNrVersion}\n`,
    );
  }

  const wallet = await getSchnorrAccount(client, privateKey, signingPrivateKey, Fr.ZERO).getWallet();
  const deployer = new ContractDeployer(contractArtifact, wallet, publicKeys.hash(), initializer);

  let args = [];
  if (rawArgs.length > 0) {
    if (!constructorArtifact) {
      throw new Error(`Cannot process constructor arguments as no constructor was found`);
    }
    debugLogger.debug(`Input arguments: ${rawArgs.map((x: any) => `"${x}"`).join(', ')}`);
    args = encodeArgs(rawArgs, constructorArtifact!.parameters);
    debugLogger.debug(`Encoded arguments: ${args.join(', ')}`);
  }

  const deploy = deployer.deploy(...args);

  await deploy.create({ contractAddressSalt: salt });
  const tx = deploy.send({ contractAddressSalt: salt });
  const txHash = await tx.getTxHash();
  debugLogger.debug(`Deploy tx sent with hash ${txHash}`);
  if (wait) {
    const deployed = await tx.wait();
    const { address, partialAddress } = deployed.contract;
    if (json) {
      logJson({ address: address.toString(), partialAddress: partialAddress.toString() });
    } else {
      log(`\nContract deployed at ${address.toString()}\n`);
      log(`Contract partial address ${partialAddress.toString()}\n`);
    }
  } else {
    const { address, partialAddress } = deploy;
    if (json) {
      logJson({
        address: address?.toString() ?? 'N/A',
        partialAddress: partialAddress?.toString() ?? 'N/A',
        txHash: txHash.toString(),
      });
    } else {
      log(`\nContract Address: ${address?.toString() ?? 'N/A'}`);
      log(`Contract Partial Address: ${partialAddress?.toString() ?? 'N/A'}`);
      log(`Deployment transaction hash: ${txHash}\n`);
    }
  }
}
