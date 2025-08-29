import type { Fr } from '@aztec/foundation/fields';
import type { FieldsOf } from '@aztec/foundation/types';

import { AztecAddress } from '../aztec-address/index.js';
import { type AbiType, FunctionType } from './abi.js';
import { FunctionSelector } from './function_selector.js';

/** A request to call a function on a contract. */
export class FunctionCall {
  constructor(
    /** The name of the function to call */
    public name: string,
    /** The recipient contract */
    public to: AztecAddress,
    /** The function being called */
    public selector: FunctionSelector,
    /** Type of the function */
    public type: FunctionType,
    /** Only applicable for enqueued public function calls. `hideMsgSender = true` will set the msg_sender field (the caller's address) to "null", meaning the public function (and observers around the world) won't know which smart contract address made the call. */
    public hideMsgSender: boolean,
    /** Whether this call can make modifications to state or not */
    public isStatic: boolean,
    /** The encoded args */
    public args: Fr[],
    /** The return type for decoding */
    public returnTypes: AbiType[],
  ) {}

  static getFields(fields: FieldsOf<FunctionCall>) {
    return [
      fields.name,
      fields.to,
      fields.selector,
      fields.type,
      fields.hideMsgSender,
      fields.isStatic,
      fields.args,
      fields.returnTypes,
    ] as const;
  }

  static from(fields: FieldsOf<FunctionCall>): FunctionCall {
    return new FunctionCall(...FunctionCall.getFields(fields));
  }

  /**
   * Creates an empty function call.
   * @returns an empty function call.
   */
  public static empty() {
    return {
      name: '',
      to: AztecAddress.ZERO,
      selector: FunctionSelector.empty(),
      type: FunctionType.PUBLIC,
      hideMsgSender: false,
      isStatic: false,
      args: [],
      returnTypes: [],
    };
  }
}
