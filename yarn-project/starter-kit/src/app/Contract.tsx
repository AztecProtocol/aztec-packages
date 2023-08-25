import React from 'react';
// import { CircuitsWasm } from '@aztec/aztec-rpc';
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
// TODO: can we do a normal import of AztecJs?
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';
// import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/artifacts';

import ContractFunctionForm from './contractFunction';

interface Props {
    contractAbi: ContractAbi;
    client: AztecRPCServer;
}

/**
 * Not working...
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
// eslint-disable-next-line jsdoc/require-jsdoc
const DynamicContractForm: React.FC<Props> = ({ contractAbi, client }) =>
{
    return (
        <div>
            <h1>
                {contractAbi.name + ' Noir Smart Contract'}
            </h1>
            <div>
            {contractAbi.functions.map((functionAbi: FunctionAbi) => {
                return ContractFunctionForm(functionAbi);
            })}
            </div>
        </div>
    );
}

export default DynamicContractForm;