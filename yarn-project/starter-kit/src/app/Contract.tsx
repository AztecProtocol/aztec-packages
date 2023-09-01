import React, { useEffect, useState } from 'react';
// import { CircuitsWasm } from '@aztec/aztec-rpc';
import { CompleteAddress } from '@aztec/aztec.js';
import { ContractAbi, FunctionAbi } from '@aztec/foundation/abi';
import { AztecRPC } from '@aztec/types';
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';
// import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/artifacts';

import ContractFunctionForm from './contractFunction';

interface Props {
    contractAbi: ContractAbi;
    rpcClient: AztecRPC;
}

interface WalletDropdownProps {
    onSelectChange: (value: CompleteAddress) => void;
    rpcClient: AztecRPC;
}

// TODO: use the wallet selected inside the contract component
function WalletDropdown({ onSelectChange, rpcClient }: WalletDropdownProps) {
        const [wallets, setOptions] = useState<CompleteAddress[]>([]);

        useEffect(() => {
        const loadOptions = async () => {
            const fetchedOptions = await rpcClient.getAccounts();
            setOptions(fetchedOptions);
            console.log('fetchedOptions', fetchedOptions.map(x => (x.toString(), x.partialAddress)));
            onSelectChange(fetchedOptions[0]);
        };
        loadOptions();
    }, []); 
    // Empty dependency array ensures this useEffect runs once when the component mounts.

    return (
        <select 
            className="min-w-64 border rounded px-3 py-2" 
 onChange={(e) => {
    const selectedWallet = wallets.find(wallet => wallet.toString() === e.target.value);
    if (selectedWallet) {
        onSelectChange(selectedWallet);
    } else {
        console.log('wallet not found', e.target.value);
    }
}}>
            {wallets.map((wallet: CompleteAddress)=> {return (
                <option key={wallet.partialKey} value={wallet}>
                    {wallet.partialKey}
                </option>
            );})}
        </select>
    );
}

/**
 * @param contractAbi - contract ABI JSON, parsed as a ContractAbi object
 * @returns a formik form for interacting with the contract
 */
const DynamicContractForm: React.FC<Props> = ({ contractAbi, rpcClient }) =>
{
    const [selectedWallet, setSelectedWallet] = useState<CompleteAddress | null>(null);

    // TODO: can we make these actually wallets, not complete addresses
    const handleSelectWallet = (wallet: CompleteAddress) => {
        console.log(wallet);
        setSelectedWallet(wallet);
    };

    return (
        <div>
            <div>
                {"Wallet (not hooked in yet): " + `${selectedWallet ? selectedWallet.partialAddress: ' none'}`}
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