import {
    AztecAddress,
    CompleteAddress,
    ContractBase,
    ContractDeployer,
    DeployMethod,
    Fr,
    PrivateKey,
    getAccountWallets, isContractDeployed
} from "@aztec/aztec.js";
// note: import was fixed by loading from index.js instead of main.js by messing in the
// node_modules/aztecjs/package.json
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
import { SchnorrSingleKeyAccountContractAbi } from '@aztec/noir-contracts/artifacts';
import { AztecRPC } from '@aztec/types';
// TODO: consider removing dependency on this?  then we can just read the contract ABI
import { PrivateTokenContract } from '../artifacts/PrivateToken';

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
    const wallet = await getAccountWallets(rpcClient, SchnorrSingleKeyAccountContractAbi, privateKey, privateKey, accountCreationSalt);
    console.log('wallet', wallet);


    // next line is erroring out with 404
    // const _contract = await jsonClient.getContractData(contractAddress);
    // undefined when we ask for bytecode
    // console.log(_contract);
    // const _contract = await jsonClient.getContractDataAndBytecode(contractAddress);
    const isDeployed = await isContractDeployed(rpcClient, contractAddress);
    console.log(isDeployed);
    const contractAddress2 = AztecAddress.fromString('0x070a10f77db469768cd7068a284be1dc78e9b7f80bd706b98c8e6fb9effb2468');
    const contract: ContractBase = await PrivateTokenContract.at(contractAddress2, wallet);
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
     [key: string]: string| number | number[] | boolean;
}

function generateYupSchema(functionAbi: FunctionAbi) {
        const parameterSchema: NoirFunctionYupSchema = {}
        const initialValues: NoirFunctionFormValues = {}
        for (const param of functionAbi.parameters) {
        // set some super crude default values
      switch (param.type.kind) {
        case 'field':
            // note: these are hex strings instead, because they are really bigints in JS, but yup doesn't support bigint
          parameterSchema[param.name] = Yup.string().required();
          if (param.name === 'owner'){
            // ALICE public key
            initialValues[param.name] = '0x2e13f0201905944184fc2c09d29fcf0cac07647be171656a275f63d99b819360';
          } else {
            initialValues[param.name] = '0xF4240';  // 1,000,000
          }
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

async function deployContract(owner: CompleteAddress, contractAbi: ContractAbi, rpcClient: AztecRPC, functionAbi: FunctionAbi, constructorArgs: any){

    console.log('constructor abi', contractAbi);

    console.log('owner', owner, owner.address);
    console.log('constructorArgs', constructorArgs);
    console.log(functionAbi);

    console.log(functionAbi.parameters.map(x => BigInt(constructorArgs[x.name])));
    const tx = new DeployMethod(owner.publicKey, rpcClient, contractAbi, 
        [BigInt(constructorArgs['initial_supply']), owner.address]
        // functionAbi.parameters.map(x => BigInt(constructorArgs[x.name]))
    ).send();
    console.log('sent');
    await tx.wait();
    const receipt = await tx.getReceipt();
    console.log(`Contract Deployed: ${receipt.contractAddress}`);
    return receipt.txHash.toString();
    const deployer = new ContractDeployer(contractAbi, rpcClient, publicKey);

}

async function handleFunctionCall(owner: CompleteAddress, functionType: string, contractAbi: ContractAbi, contractAddress: string,
     functionAbi: FunctionAbi, functionName: string, functionArgs: any,
    rpcClient: AztecRPC){
        console.log('owner', owner);
       if (functionType === 'unconstrained') {
              return await viewTx(contractAddress, functionName, functionArgs);
       } else if (functionName === 'constructor') {
        // eslint-disable-next-line no-console
        console.log('about to get wallet', privateKey);

        const wallet = await getAccountWallets(rpcClient, SchnorrSingleKeyAccountContractAbi, [privateKey], [privateKey], [accountCreationSalt]);
        console.log('got wallet', wallet);
        console.log(`Function ${functionName} calling with:`, functionArgs);
        console.log("fn args", functionArgs);

        return await deployContract(owner, contractAbi, rpcClient, functionAbi, functionArgs);
            const initialBalance = BigInt(functionArgs['initial_supply']);
            // const owner =  BigInt(functionArgs['owner']);
            console.log('converted args', initialBalance, owner);
            const contract = await PrivateTokenContract.deploy(wallet, initialBalance, owner).send();
            // const contract = await PrivateTokenContract.deploy(wallet, initialBalance, owner).send().deployed();

            console.log('contract from other way', contract);
            const tx = PrivateTokenContract.deploy(wallet, BigInt(functionArgs['initial_supply']), BigInt(functionArgs['owner'])).send();
            // const tx = PrivateTokenContract.deploy(rpcClient, BigInt(functionArgs['initial_supply']), BigInt(functionArgs['owner'])).send();
            console.log('tx sent', tx);
            await tx.isMined({ interval: 0.1});
            const receipt = await tx.getReceipt();
            console.log("sc addr", receipt.contractAddress!);
            // await deployContract(contractAbi, functionArgs, 
            //     // TODO: let them pick a salt
            //         Fr.ZERO, rpcClient);
        } else {
        console.log(`querying Contract address: ${contractAddress}`);
        return await executeFunction(contractAddress, functionName, functionArgs, rpcClient);
        }
}

import React from 'react';
// Make sure to import any other dependencies and types you might need

interface ContractFunctionFormProps {
    owner: CompleteAddress;
    contractAbi: ContractAbi;
    functionAbi: FunctionAbi;
    rpcClient: AztecRPC;
}
const ContractFunctionForm: React.FC<ContractFunctionFormProps> = ({ owner, contractAbi, functionAbi, rpcClient }) => {
    const functionName: string = functionAbi.name;

    const {validationSchema, initialValues} = generateYupSchema(functionAbi);
    const formik = useFormik({
                    initialValues: initialValues,
                    validationSchema: validationSchema,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onSubmit: async (values: any) => {
                        return await handleFunctionCall(owner, functionAbi.functionType, contractAbi, contractAddress, functionAbi, functionName, values, rpcClient);
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