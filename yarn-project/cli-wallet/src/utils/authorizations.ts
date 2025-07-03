import { type AztecAddress, CallAuthorizationRequest, type ContractArtifact } from '@aztec/aztec.js';
import type { LogFn } from '@aztec/foundation/log';
import { type AbiDecoded, decodeFromAbi, getFunctionArtifact } from '@aztec/stdlib/abi';
import type { OffchainEffect } from '@aztec/stdlib/tx';

import { format } from 'util';

export async function printAuthorizations(
  offchainEffects: OffchainEffect[],
  artifactRetriever: (address: AztecAddress) => Promise<ContractArtifact | undefined>,
  log: LogFn,
) {
  log(format('\nAuthorizations requested by the tx:\n'));
  const callAuthorizationSelector = await CallAuthorizationRequest.getSelector();
  const callAuthorizationEffects = offchainEffects.filter(effect =>
    effect.data[0].equals(callAuthorizationSelector.toField()),
  );
  for (const callAuthorizationEffect of callAuthorizationEffects) {
    const callAuthorizationRequest = await CallAuthorizationRequest.fromFields(callAuthorizationEffect.data);
    const artifact = await artifactRetriever(callAuthorizationEffect.contractAddress);
    if (!artifact) {
      log(format(' -', `Call authorization. Inner hash: ${callAuthorizationRequest.innerHash.toString()}\n`));
      log(format('  ', `Contract: unknown@${callAuthorizationEffect.contractAddress}`));
      log(
        format(
          ' ',
          `${callAuthorizationRequest.functionSelector.toString()}(\n${callAuthorizationRequest.args.map(arg => `    ${arg.toString()}`).join(',\n')}\n  )`,
        ),
      );
    } else {
      const functionAbi = await getFunctionArtifact(artifact, callAuthorizationRequest.functionSelector);
      const callData = decodeFromAbi(
        functionAbi.parameters.map(param => param.type),
        callAuthorizationRequest.args,
      ) as AbiDecoded[];
      const parameters = functionAbi.parameters.map((param, i) => ({ name: param.name, value: callData[i] }));
      log(format(' -', `Call authorization. Inner hash: ${callAuthorizationRequest.innerHash.toString()}`));
      log(format('  ', `Contract: ${artifact.name}@${callAuthorizationEffect.contractAddress}`));
      log(
        format(
          '  ',
          /* eslint-disable-next-line @typescript-eslint/no-base-to-string */
          `${functionAbi.name}(\n${parameters.map(p => `    ${p.name}: ${p.value}`).join(',\n')}\n  )`,
        ),
      );
    }
    log(`\n`);
  }
}
