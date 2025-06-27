import { type AztecAddress, CallAuthwitWithPreimage, type ContractArtifact } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { type AbiDecoded, decodeFromAbi, getFunctionArtifact } from '@aztec/stdlib/abi';
import type { OffchainEffect } from '@aztec/stdlib/tx';

import { format } from 'util';

export async function printAuthwits(
  offchainEffects: OffchainEffect[],
  artifactRetriever: (address: AztecAddress) => Promise<ContractArtifact | undefined>,
  log: LogFn,
) {
  log(format('\nAuthwits requested by the tx:\n'));
  const callAuthwitSelector = await CallAuthwitWithPreimage.getSelector();
  const callAuthwitEffects = offchainEffects.filter(effect => effect.data[0].equals(callAuthwitSelector.toField()));
  for (const callAuthwitEffect of callAuthwitEffects) {
    const callAuthwit = await CallAuthwitWithPreimage.fromFields(callAuthwitEffect.data);
    const artifact = await artifactRetriever(callAuthwitEffect.contractAddress);
    if (!artifact) {
      log(format(' -', `Call authorization. Inner hash: ${callAuthwit.innerHash.toString()}\n`));
      log(format('  ', `Contract: unknown@${callAuthwitEffect.contractAddress}`));
      log(
        format(
          ' ',
          `${callAuthwit.functionSelector.toString()}(\n${callAuthwit.args.map(arg => `    ${arg.toString()}`).join(',\n')}\n  )`,
        ),
      );
    } else {
      const functionAbi = await getFunctionArtifact(artifact, callAuthwit.functionSelector);
      const callData = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        callAuthwit.args,
      ) as AbiDecoded[];
      const parameters = functionAbi.parameters.map((param, i) => ({ name: param.name, value: callData[i] }));
      log(format(' -', `Call authorization. Inner hash: ${callAuthwit.innerHash.toString()}`));
      log(format('  ', `Contract: ${artifact.name}@${callAuthwitEffect.contractAddress}`));
      log(format('  ', `${functionAbi.name}(\n${parameters.map(p => `    ${p.name}: ${p.value}`).join(',\n')}\n  )`));
    }
    log(`\n`);
  }
}
