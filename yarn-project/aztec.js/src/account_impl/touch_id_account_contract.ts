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
import { TouchIdAuthResult, WalletConnectTouchIdAuthProvider } from '../auth/touchid.js';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { toFriendlyJSON } from '@aztec/circuits.js/utils';

const MOCK = false;

/**
 * Account backed by an account contract
 */
export class TouchIdAccountContract implements AccountImplementation {
  private auth: WalletConnectTouchIdAuthProvider;
  private logger: DebugLogger;

  constructor(
    private address: AztecAddress,
    private pubKey: PublicKey,
    private partialContractAddress: PartialContractAddress,
    private contractAbi: ContractAbi,
    private wasm: CircuitsWasm,
  ) {
    this.auth = new WalletConnectTouchIdAuthProvider();
    this.logger = createDebugLogger('aztec:account:touch_id');
  }

  init(): Promise<void> {
    return !MOCK ? this.auth.init() : Promise.resolve();
  }

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

    let authResult: TouchIdAuthResult;
    let challenge: Buffer;

    if (MOCK) {
      challenge = Buffer.from('7d3ab9998e5b2be54cd363fac7b2ac4975f5e35cd848d94687effb42fab658bd', 'hex');
      const mockAuthResult = {
        clientDataJson:
          '0x7b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a22665471356d5935624b2d564d3032503678374b735358583134317a59534e6c47682d5f3751767132574c30222c226f726967696e223a22687474703a2f2f6c6f63616c686f73743a38303830222c2263726f73734f726967696e223a66616c73657d',
        authData: '0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97630500000000',
        signature:
          '0xb873055b86078d70ac15416200e95228f4647389a935a9e2958914ac6feab0f3cc5e283035795855ee1d1317813090182656e095e8dd673097c0be0bbd80e94b',
      };
      authResult = {
        clientDataJson: Buffer.from(mockAuthResult.clientDataJson.replace('0x', ''), 'hex'),
        authData: Buffer.from(mockAuthResult.authData.replace('0x', ''), 'hex'),
        signature: Buffer.from(mockAuthResult.signature.replace('0x', ''), 'hex'),
      };
    } else {
      challenge = hashPayload(payload);
      this.logger(`Requesting signature from wallet connect for challenge 0x${challenge.toString('hex')}`);
      authResult = await this.auth.authenticateTx(challenge);
    }

    authResult.signature = fixSignature(authResult.signature);
    this.logger(`Auth result: ${toFriendlyJSON(authResult)}`);

    if (authResult.clientDataJson.length !== 134) {
      throw new Error(`Invalid length for clientDataJson (expected 134 but got ${authResult.clientDataJson.length})`);
    }

    if (authResult.authData.length !== 37) {
      throw new Error(`Invalid length for authData (expected 37 but got ${authResult.authData.length})`);
    }

    if (authResult.signature.length !== 64) {
      throw new Error(`Invalid length for signature (expected 64 but got ${authResult.signature.length})`);
    }

    if (challenge.length !== 32) {
      throw new Error(`Invalid length for challenge (expected 32 but got ${challenge.length})`);
    }

    const publicKeyAsBuffer = this.pubKey.toBuffer();
    const args = [
      payload,
      publicKeyAsBuffer,
      this.partialContractAddress,
      authResult.signature,
      authResult.authData,
      authResult.clientDataJson,
      challenge,
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

function fixSignature(sig: Buffer) {
  const s = sig.slice(32, 64);

  // Invert s
  const scalar = BigInt('0x' + s.toString('hex'));
  // The order 'n' of secp256r1 as a BigInt
  const n = BigInt('115792089210356248762697446949407573529996955224135760342422259061068512044369');
  // Compute (n - scalar) mod n
  const negated = (n - scalar) % n;
  const s2 = Buffer.from(negated.toString(16), 'hex');
  const fixed = Buffer.concat([sig.subarray(0, 32), s2]);
  return fixed;
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
