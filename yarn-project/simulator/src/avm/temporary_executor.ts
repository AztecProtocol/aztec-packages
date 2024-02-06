
import { GlobalVariables } from '@aztec/circuits.js';
import {Fr} from "@aztec/foundation/fields";

import { PublicExecution } from '../public/execution.js';
import { AvmExecutionEnvironment } from './avm_execution_environment.js';

export function temporaryMapToExecutionEnvironment(current: PublicExecution, globalVariables: GlobalVariables) : AvmExecutionEnvironment{
  // TODO: need to temporarily include functionSelector in here
  return new AvmExecutionEnvironment(
    current.contractAddress,
    current.callContext.storageContractAddress,
    current.callContext.msgSender, // TODO: origin is not available
    current.callContext.msgSender,
    current.callContext.portalContractAddress,
    /*feePerL1Gas=*/Fr.zero(),
    /*feePerL2Gas=*/Fr.zero(),
    /*feePerDaGas=*/Fr.zero(),
    /*contractCallDepth=*/Fr.zero(),
    globalVariables,
    current.callContext.isStaticCall,
    current.callContext.isDelegateCall,
    current.args,
    current.functionData.selector
  )
}


