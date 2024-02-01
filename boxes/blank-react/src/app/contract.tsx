import { contractArtifact } from '../config.js';
// import { ContractFunctionForm, Popup } from './components/index.js';
import { AztecAddress, CompleteAddress, FunctionArtifact } from '@aztec/aztec.js';
import { ReactNode, useEffect, useState } from 'react';

const functionTypeSortOrder = {
  secret: 0,
  open: 1,
  unconstrained: 2,
};

interface Props {
  wallet: CompleteAddress;
}

export function Contract({ address }: { address: AztecAddress }) {
  useEffect(() => {
    console.log(address);
  }, []);

  const showForm = ({ currentTarget }: React.FormEvent<HTMLSelectElement>) => {
    const index = parseInt(currentTarget.value);
    console.log(contractArtifact.functions[index]);
  };

  return (
    <div>
      <h1>Name: {contractArtifact.name}</h1>
      <label htmlFor="contractFunctions">View Functions:</label>
      <select name="contractFunctions" id="contractFunctions" onChange={showForm}>
        {contractArtifact.functions.map((fn, index) => {
          console.log(fn.functionType);
          return (
            fn.functionType === 'unconstrained' && (
              <option key={index} value={index}>
                {fn.name}
              </option>
            )
          );
        })}
      </select>
    </div>
  );
}

// export function Contract({ wallet }: Props) {
//   const [contractAddress, setContractAddress] = useState<AztecAddress | undefined>();
//   const [processingFunction, setProcessingFunction] = useState('');
//   const [errorMsg, setError] = useState('');
//   const [selectedFunctionIndex, setSelectedFunctionIndex] = useState<number>(-1);
//   const [result, setResult] = useState('');

//   const handleSubmitForm = (functionName: string) => setProcessingFunction(functionName);
//   const handleContractDeployed = (address: AztecAddress) => {
//     setContractAddress(address);
//     setResult(`Contract deployed at: ${address}`);
//   };
//   const handleResult = (returnValues: any) => {
//     // TODO: serialize returnValues to string according to the returnTypes defined in the function abi.
//     setResult(`Return values: ${returnValues}`);
//   };
//   const handleClosePopup = () => {
//     setResult('');
//     setError('');
//     setProcessingFunction('');
//   };

//   const constructorAbi = contractArtifact.functions.find(f => f.name === 'constructor')!;
//   const hasResult = !!(result || errorMsg);

//   function renderCardContent(contractAddress?: AztecAddress): ReactNode {
//     if (contractAddress) {
//       const functions = contractArtifact.functions
//         .filter(f => f.name !== 'constructor' && !f.isInternal)
//         .sort((a, b) => functionTypeSortOrder[a.functionType] - functionTypeSortOrder[b.functionType]);

//       if (selectedFunctionIndex === -1) {
//         return (
//           <div>
//             <div>
//               <div>{`${contractArtifact.name}`}</div>
//             </div>
//             <div>
//               {functions.map((functionAbi: FunctionArtifact, index: number) => (
//                 <button
//                   onClick={() => {
//                     setSelectedFunctionIndex(index);
//                   }}
//                 >
//                   {functionAbi.name}
//                 </button>
//               ))}
//             </div>
//           </div>
//         );
//       }

//       const selectedFunctionAbi = functions[selectedFunctionIndex];

//       return (
//         <>
//           <ContractFunctionForm
//             key={selectedFunctionAbi.name}
//             wallet={wallet}
//             contractAddress={contractAddress}
//             contractArtifact={contractArtifact}
//             functionArtifact={selectedFunctionAbi}
//             defaultAddress={wallet.address.toString()}
//             isLoading={processingFunction === selectedFunctionAbi.name && !hasResult}
//             disabled={processingFunction === selectedFunctionAbi.name && hasResult}
//             onSubmit={() => handleSubmitForm(selectedFunctionAbi.name)}
//             onSuccess={handleResult}
//             onError={setError}
//           />
//         </>
//       );
//     }

//     return (
//       <ContractFunctionForm
//         wallet={wallet}
//         contractArtifact={contractArtifact}
//         functionArtifact={constructorAbi}
//         defaultAddress={wallet.address.toString()}
//         buttonText="Deploy"
//         isLoading={!!processingFunction && !hasResult}
//         disabled={!!processingFunction && hasResult}
//         onSubmit={() => handleSubmitForm('constructor')}
//         onSuccess={handleContractDeployed}
//         onError={setError}
//       />
//     );
//   }

//   return (
//     <>
//       {renderCardContent(contractAddress)}
//       {!!(errorMsg || result) && (
//         <Popup isWarning={!!errorMsg} onClose={handleClosePopup}>
//           {errorMsg || result}
//         </Popup>
//       )}
//     </>
//   );
// }
