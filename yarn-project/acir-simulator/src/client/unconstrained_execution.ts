import { ACVMField, acvm, fromACVMField, toACVMField, toACVMWitness } from '../acvm/index.js';
import { AztecAddress, Fr } from '@aztec/foundation';
import { CallContext, PrivateHistoricTreeRoots, TxRequest, FunctionData } from '@aztec/circuits.js';
import { DBOracle } from './db_oracle.js';
import { frToAztecAddress, frToNumber } from '../acvm/deserialize.js';
import { FunctionAbi } from '@aztec/noir-contracts';
import { createDebugLogger } from '@aztec/foundation/log';
import { decodeReturnValues } from '../abi_coder/decoder.js';
import { ClientExecution } from './client_execution.js';
import { select_return_flattened as selectReturnFlattened } from '@noir-lang/noir_util_wasm';

const notAvailable = () => {
  return Promise.reject(new Error(`Not available for unconstrained function execution`));
};

export class UnconstrainedFunctionExecution extends ClientExecution<any[]> {
  constructor(
    // Global to the tx
    db: DBOracle,
    request: TxRequest,
    historicRoots: PrivateHistoricTreeRoots,
    // Concrete to this execution
    abi: FunctionAbi,
    contractAddress: AztecAddress,
    functionData: FunctionData,
    args: Fr[],
    callContext: CallContext,

    private log = createDebugLogger('aztec:simulator:unconstrained_execution'),
  ) {
    super(db, request, historicRoots, abi, contractAddress, functionData, args, callContext);
  }

  public async run(): Promise<any[]> {
    this.log(
      `Executing unconstrained function ${this.contractAddress.toShortString()}:${this.functionData.functionSelector.toString(
        'hex',
      )}`,
    );

    const acir = Buffer.from(this.abi.bytecode, 'hex');
    const initialWitness = toACVMWitness(1, this.args);

    const { partialWitness } = await acvm(acir, initialWitness, {
      getSecretKey: async ([address]: ACVMField[]) => [
        toACVMField(await this.db.getSecretKey(this.contractAddress, frToAztecAddress(fromACVMField(address)))),
      ],
      getNotes2: ([storageSlot]: ACVMField[]) => this.getNotes(this.contractAddress, storageSlot, 2),
      getRandomField: () => Promise.resolve([toACVMField(Fr.random())]),
      viewNotesPage: ([acvmSlot, acvmLimit, acvmOffset]) =>
        this.viewNotes(
          this.contractAddress,
          acvmSlot,
          frToNumber(fromACVMField(acvmLimit)),
          frToNumber(fromACVMField(acvmOffset)),
        ),
      notifyCreatedNote: notAvailable,
      notifyNullifiedNote: notAvailable,
      callPrivateFunction: notAvailable,
      storageRead: notAvailable,
      storageWrite: notAvailable,
    });

    const returnValues: ACVMField[] = selectReturnFlattened(acir, partialWitness);

    return decodeReturnValues(this.abi, returnValues.map(fromACVMField));
  }
}
