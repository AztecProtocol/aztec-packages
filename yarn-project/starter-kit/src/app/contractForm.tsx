// import { CircuitsWasm } from '@aztec/aztec-rpc';
import { AztecAddress, CompleteAddress, ContractBase, Fr, PrivateKey, createAztecRpcClient, getAccountWallets, isContractDeployed } from '@aztec/aztec.js';
// import { CircuitsWasm } from '@aztec/circuits.js';
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
// TODO: can we do a normal import of AztecJs?
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';
// import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/artifacts';
import { SchnorrSingleKeyAccountContractAbi } from '@aztec/noir-contracts/artifacts';
import { PrivateTokenContract } from '../artifacts/PrivateToken';

import { useFormik } from 'formik';
import * as Yup from 'yup';


const contractAddress = AztecAddress.fromString(import.meta.env.VITE_CONTRACT_ADDRESS);
// const walletAddress: AztecAddress = import.meta.env.VITE_WALLET_ADDRESS;
// const privateKey: PrivateKey = import.meta.env.VITE_PRIVATE_KEY;
// const client = createAztecRpcClient(import.meta.env.VITE_SANDOX_RPC_URL);
const SANDBOX_URL = import.meta.env.VITE_SANDBOX_RPC_URL; 
// console.log('client is', client);
// Address 0x2e13f0201905944184fc2c09d29fcf0cac07647be171656a275f63d99b819360
// const privateKey2 = PrivateKey.fromString('b2803ec899f76f6b2ac011480d24028f1a29587f8a3a92f7ee9d48d8c085c284');
// Address 0x0d557417a3ce7d7b356a8f15d79a868fd8da2af9c5f4981feb9bcf0b614bd17e
// const privateKey = Buffer.from('6bb46e9a80da2ff7bfff71c2c50eaaa4b15f7ed5ad1ade4261b574ef80b0cdb0', 'hex');
const privateKey: PrivateKey = PrivateKey.fromString('6bb46e9a80da2ff7bfff71c2c50eaaa4b15f7ed5ad1ade4261b574ef80b0cdb0');
const accountCreationSalt = Fr.ZERO;


async function executeFunction(contractAbi: ContractAbi, contractAddress: string, functionName: string, functionArgs: any) {
    // const fnAbi: FunctionAbi = getAbiFunction(contractAbi, functionName);
    // console.log('privateKey2 is', privateKey2.toString('hex'));
    console.log('privateKey is', privateKey.toString('hex'));
    console.log(`Creating JSON RPC client to remote host ${SANDBOX_URL}`);
    const jsonClient = createAztecRpcClient(SANDBOX_URL);//, makeFetch([1, 2, 3], false))

    console.log('creating wallet with ' ,SchnorrSingleKeyAccountContractAbi, privateKey, accountCreationSalt, 1);
    // const wallet: Wallet = await createAccounts(jsonClient, SchnorrSingleKeyAccountContractAbi, 
        //  privateKey,  accountCreationSalt, 2);
    const accounts: CompleteAddress[] = await jsonClient.getAccounts();
    // const wallet: CompleteAddress = accounts[0];

    // console.log(wallet, wallet.toReadableString());
    const wallet = await getAccountWallets(jsonClient, SchnorrSingleKeyAccountContractAbi, privateKey, privateKey, accountCreationSalt);
    console.log(wallet);

    // console.log('getting wallet'); // next line is erroring out with 404
    // const _contract = await jsonClient.getContractData(contractAddress);
    // undefined when we ask for bytecode
    // console.log(_contract);
    // const _contract = await jsonClient.getContractDataAndBytecode(contractAddress);
    const isDeployed = await isContractDeployed(jsonClient, contractAddress);
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

    console.log('jsonClient is', jsonClient);
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

function generateYupSchema(functionAbi: FunctionAbi) {
        const parameterSchema = {}
        const initialValues = {}
        for (const param of functionAbi.parameters) {
      switch (param.type.kind) {
        case 'field':
          parameterSchema[param.name] = Yup.number().required(); // assuming fields are strings; adjust as necessary
          initialValues[param.name] = 100;
          break;
        case 'array':
          const arrayLength = param.type.length;
          parameterSchema[param.name] = Yup.array().of(Yup.number()).min(arrayLength).max(arrayLength);
          initialValues[param.name] = Array(arrayLength).fill(200);
          break;
      }
    }

    return {parameterSchema: Yup.object().shape(parameterSchema), initialValues};
}

/**
 * Not working...
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
// eslint-disable-next-line jsdoc/require-jsdoc
export default function DynamicContractForm({ contractAbi, client }: { contractAbi: ContractAbi, client: AztecRPCServer }) {
    return (
        <div>
            <h1>{contractAbi.name + ' Noir Smart Contract'}</h1>
            {contractAbi.functions.map(func => {
                // Create validation schema for this function
                const {validationSchema, initialValues} = generateYupSchema(func);

                const formik = useFormik({
                    initialValues: initialValues,
                    validationSchema: validationSchema,
                    onSubmit: async values => {
                        // eslint-disable-next-line no-console
                        console.log(`Function ${func.name} called with:`, values);
                        console.log(`Contract address: ${contractAddress}`);
                        return await executeFunction(contractAbi, contractAddress, func.name, values);
                    },
                });

                return (
                    <div key={func.name} className="bg-black">
                        <h1>{func.name}</h1>
                        <form onSubmit={formik.handleSubmit}>
                            <div className="item-center px-24 flex">
                            {func.parameters.map(input => (
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
                            <button type="submit">Call {func.name}</button>
                            </div>
                        </form>
                    </div>
                );
            })}
        </div>
    );
}