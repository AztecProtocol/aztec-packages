import React, { useEffect, useState } from 'react';
// import { CircuitsWasm } from '@aztec/aztec-rpc';
import { ContractAbi, FunctionAbi } from "@aztec/foundation/abi";
import {AztecRPC} from '@aztec/types';
import {Wallet} from '@aztec/aztec.js';
// TODO: can we do a normal import of AztecJs?
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';
// import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/artifacts';

import ContractFunctionForm from './contractFunction';

interface Props {
    contractAbi: ContractAbi;
    rpcClient: AztecRPC;
}

interface WalletDropdownProps {
    onSelectChange: (value: string) => void;
    rpcClient: AztecRPC;
}

// TODO: use the wallet selected inside the contract component
function WalletDropdown({ onSelectChange, rpcClient }: WalletDropdownProps) {
        const [wallets, setOptions] = useState<string[]>([]);

        useEffect(() => {
        const loadOptions = async () => {
            const fetchedOptions = await rpcClient.getAccounts();
            setOptions(fetchedOptions);
            onSelectChange(fetchedOptions[0]);
        };

        loadOptions();
    }, []); // Empty dependency array ensures this useEffect runs once when the component mounts.

    return (
        <select 
            className="min-w-64 border rounded px-3 py-2" 
 onChange={(e) => onSelectChange(e.target.value)}>
            {wallets.map((wallet: Wallet)=> {return (
                <option key={wallet.publicKey} value={wallet}>
                    {wallet.name}
                </option>
            );})}
        </select>
    );
            }

/**
 * Not working...
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
// eslint-disable-next-line jsdoc/require-jsdoc
const DynamicContractForm: React.FC<Props> = ({ contractAbi, rpcClient }) =>
{
    const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

    // make these actually wallets, not complete addresses
    const handleSelectWallet = (wallet: Wallet) => {
        setSelectedWallet(wallet);
        console.log('set wallet to ', wallet);
    };

    return (
        <div>
            <div>
                {"Wallet: " + `${selectedWallet ? selectedWallet: ' none'}`}
                <WalletDropdown onSelectChange={handleSelectWallet} rpcClient={rpcClient} />
            </div>
            <h1>
                {contractAbi.name + ' Noir Smart Contract'}
            </h1>
            <div>
            {contractAbi.functions.map((functionAbi: FunctionAbi) => {
                return <ContractFunctionForm key={functionAbi.name} contractAbi={contractAbi} functionAbi={functionAbi} rpcClient={rpcClient}/>;
            })}
            </div>
        </div>
    );
}

export default DynamicContractForm;