import {
    AztecAddress,
    CompleteAddress, ContractBase, Fr, PrivateKey,
    getAccountWallets, isContractDeployed
} from "@aztec/aztec.js";
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
import { SchnorrSingleKeyAccountContractAbi } from '@aztec/noir-contracts/artifacts';
import { AztecRPC } from '@aztec/types';
// TODO: consider removing dependency on this?  then we can just read the contract ABI
import { PrivateTokenContract } from '../artifacts/PrivateToken';
import { deployContract } from '../scripts/deploy_contract';

import { useFormik } from 'formik';
import * as Yup from 'yup';

// the file right now is a big mess:
// just trying to get any frontend call to the sandbox to execute correctly

const contractAddress = AztecAddress.fromString(import.meta.env.VITE_CONTRACT_ADDRESS);
// const walletAddress: AztecAddress = import.meta.env.VITE_WALLET_ADDRESS;
// const privateKey: PrivateKey = import.meta.env.VITE_PRIVATE_KEY;
// Address 0x2e13f0201905944184fc2c09d29fcf0cac07647be171656a275f63d99b819360
// const privateKey2 = PrivateKey.fromString('b2803ec899f76f6b2ac011480d24028f1a29587f8a3a92f7ee9d48d8c085c284');
// Address 0x0d557417a3ce7d7b356a8f15d79a868fd8da2af9c5f4981feb9bcf0b614bd17e
// const privateKey = Buffer.from('6bb46e9a80da2ff7bfff71c2c50eaaa4b15f7ed5ad1ade4261b574ef80b0cdb0', 'hex');
const privateKey: PrivateKey = PrivateKey.fromString('6bb46e9a80da2ff7bfff71c2c50eaaa4b15f7ed5ad1ade4261b574ef80b0cdb0');
const accountCreationSalt = Fr.ZERO;




async function executeFunction(contractAddress: string, functionName: string, functionArgs: any,
    rpcClient: AztecRPC
    ) {

    // const fnAbi: FunctionAbi = getAbiFunction(contractAbi, functionName);
    // console.log('privateKey2 is', privateKey2.toString('hex'));
    console.log('privateKey is', privateKey.toString('hex'));

    console.log('creating wallet with ', SchnorrSingleKeyAccountContractAbi, privateKey, accountCreationSalt, 1);
    // const wallet: Wallet = await createAccounts(jsonClient, SchnorrSingleKeyAccountContractAbi, 
        //  privateKey,  accountCreationSalt, 2);
    const accounts: CompleteAddress[] = await rpcClient.getAccounts();
    // const wallet: CompleteAddress = accounts[0];

    // console.log(wallet, wallet.toReadableString());  // not a wallet!  it' san account
    const wallet = await getAccountWallets(rpcClient, SchnorrSingleKeyAccountContractAbi, privateKey, privateKey, accountCreationSalt);
    console.log(wallet);

    // console.log('getting wallet'); // next line is erroring out with 404
    // const _contract = await jsonClient.getContractData(contractAddress);
    // undefined when we ask for bytecode
    // console.log(_contract);
    // const _contract = await jsonClient.getContractDataAndBytecode(contractAddress);
    const isDeployed = await isContractDeployed(rpcClient, contractAddress);
    console.log(isDeployed);
    const contract: ContractBase = await PrivateTokenContract.at(contractAddress, wallet);
    console.log(contract);
    console.log(contract.abi);
    console.log(contract.methods);  // why is this undefined?
    // const contract = await Contract.at(contractAddress, contractAbi, wallet);
    // console.log(contract);
    const tx = contract.methods[functionName](...functionArgs).send();
    await tx.isMined();
    const receipt = await tx.getReceipt();


    return receipt;

    // this next line is erroring with reading "length" from an undefined object

    // const wallet = await getaccountwallets(
    //     client,
    //     schnorrsinglekeyaccountcontractabi,
    //     [privatekey],
    //     [privatekey],
    //     [accountcreationsalt],
    //   ).catch((err) => {
        // console.log(err)});
      console.log('wallet address: ', wallet);
      console.log(wallet.address);
          }

// hack: add `any` at the end to get the array schema to typecheck
type NoirFunctionYupSchema = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: Yup.NumberSchema | Yup.ArraySchema<number[], {}> | Yup.BooleanSchema | any;
};
type NoirFunctionFormValues = {
     [key: string]: number | number[] | boolean;
}

function generateYupSchema(functionAbi: FunctionAbi) {
        const parameterSchema: NoirFunctionYupSchema = {}
        const initialValues: NoirFunctionFormValues = {}
        for (const param of functionAbi.parameters) {
        // set some super crude default values
      switch (param.type.kind) {
        case 'field':
          parameterSchema[param.name] = Yup.number().required();
          initialValues[param.name] = 100;
          break;
        case 'array':
          // eslint-disable-next-line no-case-declarations
          const arrayLength = param.type.length;
          parameterSchema[param.name] = Yup.array().of(Yup.number()).min(arrayLength).max(arrayLength);
          initialValues[param.name] = Array(arrayLength).fill(200);
          break;
        case 'boolean':
            parameterSchema[param.name] = Yup.boolean().required();
            initialValues[param.name] = false;
            break;
      }
    }

    return {validationSchema: Yup.object().shape(parameterSchema), initialValues};
}


async function viewTx(contractAddress: string, functionName: string, functionArgs: any) {
    console.log(`viewing Contract address: ${contractAddress} function ${functionName} with args ${functionArgs}`);
    console.log('IMPLEMENT HERE');
    return;
}

async function handleFunctionCall(functionType: string, contractAbi: ContractAbi, contractAddress: string, functionName: string, functionArgs: any,
    rpcClient: AztecRPC){
       if (functionType === 'unconstrained') {
              return await viewTx(contractAddress, functionName, functionArgs);
       } else if (functionName === 'constructor') {
        // eslint-disable-next-line no-console
        console.log(`Function ${functionName} calling with:`, functionArgs);
            console.log('deploying contract with null pubkey');
            await deployContract(contractAbi, functionArgs, 
                // TODO: let them pick a salt
                    Fr.ZERO, rpcClient);
        } else {
        console.log(`querying Contract address: ${contractAddress}`);
        return await executeFunction(contractAddress, functionName, functionArgs, rpcClient);
        }
}

import React from 'react';
// Make sure to import any other dependencies and types you might need

interface ContractFunctionFormProps {
    contractAbi: ContractAbi;
    functionAbi: FunctionAbi;
    rpcClient: AztecRPC;
}
const ContractFunctionForm: React.FC<ContractFunctionFormProps> = ({ contractAbi, functionAbi, rpcClient }) => {
    const functionName: string = functionAbi.name;

    const {validationSchema, initialValues} = generateYupSchema(functionAbi);
    const formik = useFormik({
                    initialValues: initialValues,
                    validationSchema: validationSchema,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onSubmit: async (values: any) => {
                        return await handleFunctionCall(functionAbi.functionType, contractAbi, contractAddress, functionName, values, rpcClient);
                    },
                });
    return (                   
        <div key={functionName} className="bg-black">
            <h1>{functionName}</h1>
            <form onSubmit={formik.handleSubmit}>
                <div className="item-center px-24 flex">
                {functionAbi.parameters.map(input => (
                    <div key={input.name}>
                        <label htmlFor={input.name}>
                            {input.name} ({input.type.kind})
                        </label>
                        <div className="grid w-full text-black items-center grid-cols-5">
                        <input
                            className="block w-full border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            id={input.name}
                            name={input.name}
                            type="text"
                            onChange={formik.handleChange}
                            value={formik.values[input.name]}
                        />
                        </div>
                        {formik.touched[input.name] && formik.errors[input.name] && (
                            <div>{formik.errors[input.name]?.toString()}</div>
                        )}
                    </div>
                ))}
                <button type="submit">Call {functionName}</button>
                </div>
            </form>
        </div>
                    );
                                    }
export default ContractFunctionForm;