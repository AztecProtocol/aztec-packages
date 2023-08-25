import React from 'react';
// import { CircuitsWasm } from '@aztec/aztec-rpc';
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
import {AztecRPC} from '@aztec/types';
// TODO: can we do a normal import of AztecJs?
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';
// import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/artifacts';

import ContractFunctionForm from './contractFunction';

interface Props {
    contractAbi: ContractAbi;
    rpcClient: AztecRPC;
}

/**
 * Not working...
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
// eslint-disable-next-line jsdoc/require-jsdoc
const DynamicContractForm: React.FC<Props> = ({ contractAbi, rpcClient }) =>
{
    console.log('dynamiccontractform client is ', rpcClient);
    return (
        <div>
            <h1>
                {contractAbi.name + ' Noir Smart Contract'}
            </h1>
            <div>
            {contractAbi.functions.map((functionAbi: FunctionAbi) => {
                return ContractFunctionForm(contractAbi, functionAbi, rpcClient);
            })}
            </div>
        </div>
    );
}

export default DynamicContractForm;