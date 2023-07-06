import { encodeArguments } from '@aztec/acir-simulator';
import { AztecAddress, CircuitsWasm, Fr, FunctionData, TxContext } from '@aztec/circuits.js';
import { ContractAbi } from '@aztec/foundation/abi';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256 } from '@aztec/foundation/crypto';
import { PublicKey } from '@aztec/key-store';
import { ExecutionRequest, PackedArguments, PartialContractAddress, TxExecutionRequest } from '@aztec/types';
import partition from 'lodash.partition';
import { generateFunctionSelector } from '../index.js';
import { AccountImplementation } from './index.js';

export type TouchIdAuthResult = {
  clientDataJson: Buffer;
  authData: Buffer;
  signature: Buffer;
  challenge: Buffer;
};

function getMockAuthResult(): TouchIdAuthResult {
  return {
    clientDataJson: Buffer.from(
      '{"type":"webauthn.get","challenge":"vZbKGUIVYiS5_etVydZznrjdmJIWlk6ENzZ1AjZ9KPw","origin":"http://localhost:8080","crossOrigin":false}',
    ),
    challenge: Buffer.from('191d0f6c04570629e044431139965331f4909bba1f86ed2538ef41d6841a8f6b', 'hex'),
    authData: Buffer.from('49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000000', 'hex'),
    signature: Buffer.from(
      '1869ce6f71e02b77426dec03e342079d75745c8d40a8ac0be73f812724d5ee2ddf37dda13335e00a0918286ac5f3130b43b6791393371d22378c6660a4be4f92',
      'hex',
    ),
  };
}

/**
 * Account backed by an account contract
 */
export class TouchIdAccountContract implements AccountImplementation {
  constructor(
    private address: AztecAddress,
    private pubKey: PublicKey,
    private partialContractAddress: PartialContractAddress,
    private contractAbi: ContractAbi,
    private wasm: CircuitsWasm,
  ) {}

  init() {}

  getAddress(): AztecAddress {
    return this.address;
  }

  async createAuthenticatedTxRequest(
    executions: ExecutionRequest[],
    txContext: TxContext,
  ): Promise<TxExecutionRequest> {
    this.checkSender(executions);
    this.checkIsNotDeployment(txContext);

    const [privateCalls, publicCalls] = partition(executions, exec => exec.functionData.isPrivate).map(execs =>
      execs.map(exec => ({
        args: exec.args,
        selector: exec.functionData.functionSelectorBuffer,
        target: exec.to,
      })),
    );

    const { payload, packedArguments: callsPackedArguments } = await buildPayload(privateCalls, publicCalls, this.wasm);
    const _hash = hashPayload(payload);

    const authResult = getMockAuthResult();
    const publicKeyAsBuffer = this.pubKey.toBuffer();
    const args = [
      payload,
      publicKeyAsBuffer,
      this.partialContractAddress,
      authResult.signature,
      authResult.authData,
      authResult.clientDataJson,
      authResult.challenge,
    ];
    const abi = this.getEntrypointAbi();
    const selector = generateFunctionSelector(abi.name, abi.parameters);
    const packedArgs = await PackedArguments.fromArgs(encodeArguments(abi, args), this.wasm);
    const txRequest = TxExecutionRequest.from({
      argsHash: packedArgs.hash,
      origin: this.address,
      functionData: new FunctionData(selector, true, false),
      txContext,
      packedArguments: [...callsPackedArguments, packedArgs],
    });

    return txRequest;
  }

  private getEntrypointAbi() {
    const abi = this.contractAbi.functions.find(f => f.name === 'entrypoint');
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

/** A call to a function in a noir contract */
export type FunctionCall = {
  /** The encoded arguments */
  args: Fr[];
  /** The function selector */
  selector: Buffer;
  /** The address of the contract */
  target: AztecAddress;
};

/** Encoded payload for the account contract entrypoint */
export type EntrypointPayload = {
  // eslint-disable-next-line camelcase
  /** Concatenated arguments for every call */
  flattened_args_hashes: Fr[];
  // eslint-disable-next-line camelcase
  /** Concatenated selectors for every call */
  flattened_selectors: Fr[];
  // eslint-disable-next-line camelcase
  /** Concatenated target addresses for every call */
  flattened_targets: Fr[];
  /** A nonce for replay protection */
  nonce: Fr;
};

/** Assembles an entrypoint payload from a set of private and public function calls */
async function buildPayload(
  privateCalls: FunctionCall[],
  publicCalls: FunctionCall[],
  wasm: CircuitsWasm,
): Promise<{
  /**
   * The payload for the entrypoint function
   */
  payload: EntrypointPayload;
  /**
   * The packed arguments of functions called
   */
  packedArguments: PackedArguments[];
}> {
  const nonce = Fr.random();
  const emptyCall = { args: [], selector: Buffer.alloc(32), target: AztecAddress.ZERO };

  const calls = [
    ...padArrayEnd(privateCalls, emptyCall, ACCOUNT_MAX_PRIVATE_CALLS),
    ...padArrayEnd(publicCalls, emptyCall, ACCOUNT_MAX_PUBLIC_CALLS),
  ];

  const packedArguments = [];

  for (const call of calls) {
    packedArguments.push(await PackedArguments.fromArgs(call.args, wasm));
  }

  return {
    payload: {
      // eslint-disable-next-line camelcase
      flattened_args_hashes: packedArguments.map(args => args.hash),
      // eslint-disable-next-line camelcase
      flattened_selectors: calls.map(call => Fr.fromBuffer(call.selector)),
      // eslint-disable-next-line camelcase
      flattened_targets: calls.map(call => call.target.toField()),
      nonce,
    },
    packedArguments,
  };
}

/** Hashes an entrypoint payload (useful for signing) */
function hashPayload(payload: EntrypointPayload) {
  // TODO: Switch to keccak when avaiable in Noir
  return sha256(Buffer.concat(flattenPayload(payload).map(fr => fr.toBuffer())));
}

/** Flattens an entrypoint payload */
function flattenPayload(payload: EntrypointPayload) {
  return [
    ...payload.flattened_args_hashes,
    ...payload.flattened_selectors,
    ...payload.flattened_targets,
    payload.nonce,
  ];
}
