import { ARGS_LENGTH, AztecAddress, EcdsaSignature, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256 } from '@aztec/foundation/crypto';
import { KeyStore, PublicKey } from '@aztec/key-store';
import { ExecutionRequest, SignedTxExecutionRequest, TxExecutionRequest } from '@aztec/types';
import partition from 'lodash.partition';
import times from 'lodash.times';
import { AccountImplementation } from './index.js';
import { encodeArguments } from '@aztec/acir-simulator';
import { AccountContractAbi } from '@aztec/noir-contracts/examples';
import { generateFunctionSelector } from '../index.js';

export class EcdsaAccountContract implements AccountImplementation {
  constructor(private address: AztecAddress, private pubKey: PublicKey, private keyStore: KeyStore) {}

  async createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<SignedTxExecutionRequest> {
    this.checkSender(executions);
    this.checkIsNotDeployment(txContext);

    const [privateCalls, publicCalls] = partition(executions, exec => exec.functionData.isPrivate).map(execs =>
      execs.map(exec => ({
        args: exec.args,
        selector: exec.functionData.functionSelectorBuffer,
        target: exec.to,
      })),
    );

    const payload = buildPayload(privateCalls, publicCalls);
    const hash = hashPayload(payload);
    const signature = await this.keyStore.ecdsaSign(hash, this.pubKey);
    const signatureAsFrArray = Array.from(signature.toBuffer()).map(byte => new Fr(byte));
    const args = [payload, signatureAsFrArray];
    const abi = this.getEntrypointAbi();
    const selector = generateFunctionSelector(abi.name, abi.parameters);
    const txRequest = TxExecutionRequest.fromExecutionRequest({
      args: encodeArguments(abi, args),
      from: this.address,
      functionData: new FunctionData(selector, true, false),
    });

    return new SignedTxExecutionRequest(txRequest, EcdsaSignature.empty());
  }

  private getEntrypointAbi() {
    const abi = AccountContractAbi.functions.find(f => f.name === 'entrypoint');
    if (!abi) throw new Error(`Entrypoint abi for account contract not found`);
    return abi;
  }

  private checkIsNotDeployment(txContext: TxContext) {
    if (txContext.isContractDeploymentTx) {
      throw new Error(`Cannot yet deploy contracts from an account contract`);
    }
  }

  private checkSender(executions: ExecutionRequest[]) {
    const wrongSender = executions.find(e => !e.from.equals(this.address));
    if (wrongSender) {
      throw new Error(
        `Sender ${wrongSender.from.toString()} does not match account address ${this.address.toString()}`,
      );
    }
  }
}

const ACCOUNT_MAX_PRIVATE_CALLS = 1;
const ACCOUNT_MAX_PUBLIC_CALLS = 1;

type FunctionCall = {
  args: Fr[];
  selector: Buffer;
  target: AztecAddress;
};

type EntrypointPayload = {
  // eslint-disable-next-line camelcase
  flattened_args: Fr[];
  // eslint-disable-next-line camelcase
  flattened_selectors: Fr[];
  // eslint-disable-next-line camelcase
  flattened_targets: Fr[];
  nonce: Fr;
};

function buildPayload(privateCalls: FunctionCall[], publicCalls: FunctionCall[]): EntrypointPayload {
  const nonce = Fr.random();
  const emptyCall = { args: times(ARGS_LENGTH, Fr.zero), selector: Buffer.alloc(32), target: AztecAddress.ZERO };

  const calls = [
    ...padArrayEnd(privateCalls, emptyCall, ACCOUNT_MAX_PRIVATE_CALLS),
    ...padArrayEnd(publicCalls, emptyCall, ACCOUNT_MAX_PUBLIC_CALLS),
  ];

  return {
    // eslint-disable-next-line camelcase
    flattened_args: calls.flatMap(call => padArrayEnd(call.args, Fr.ZERO, ARGS_LENGTH)),
    // eslint-disable-next-line camelcase
    flattened_selectors: calls.map(call => Fr.fromBuffer(call.selector)),
    // eslint-disable-next-line camelcase
    flattened_targets: calls.map(call => call.target.toField()),
    nonce,
  };
}

function hashPayload(payload: EntrypointPayload) {
  // TODO: Switch to keccak when avaiable in Noir
  return sha256(Buffer.concat(flattenPayload(payload).map(fr => fr.toBuffer())));
}

function flattenPayload(payload: EntrypointPayload) {
  return [...payload.flattened_args, ...payload.flattened_selectors, ...payload.flattened_targets, payload.nonce];
}
