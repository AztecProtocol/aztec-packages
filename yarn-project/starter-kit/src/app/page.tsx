import '../App.css';

import { AztecRPC } from '@aztec/aztec.js';
import { useEffect, useState } from 'react';
// import * as AztecJs from '../../node_modules/@aztec/aztec.js/dest/main.js';

import aztecLogo from '../assets/aztec_logo.svg';
import Banner from './banner';
import DynamicContractForm from './Contract';
// import {PrivateTokenContract} from '../artifacts/PrivateToken';  // update this if using a different contract



/**
 * 
 * @param ContractAbiData - a contract ABI, generate frontend based on this
 * @returns 
 */
export default function Home() {
  const [data, setData] = useState(null);

  const contractAbiPath = `../artifacts/${import.meta.env.VITE_CONTRACT_ABI_FILE_NAME}`;
  const client: AztecRPC = null; //= AztecJs.createAztecClient(import.meta.env.VITE_SANDOX_RPC_URL);

  useEffect(() => {
    import(contractAbiPath)
      .then(json => {
        setData(json.default);
      })
      .catch(err => {
        console.error("Failed to load JSON:", err);
      });
  }, [contractAbiPath]);

  if (!data) return <div>Loading contract ABI JSON...</div>;

  return (

    <main className="flex min-h-screen flex-col items-center justify-between px-16">
      <div>
      <Banner background="black" direction="forward"/>
      <Banner background="purple" direction="reverse"/>
  </div>

      <div className="max-w-screen w-full items-center justify-between font-mono text-sm lg:flex">

        <div className="flex h-full w-full items-end bg-gradient-to-t from-white via-white dark:from-black dark:via-black">
                    <img src={aztecLogo} className="logo aztec" alt="Aztec logo" />
            </div>
            <div>

{/* {import.meta.env.VITE_CONTRACT_TYPESCRIPT_FILENAME !== "PrivateToken.ts" && "Update the Typscript import name for your contract in `src/app/page.tsx`!"} */}

      <DynamicContractForm contractAbi={data} client={client}/>
</div>
    </div>


<div className="flex w-full items-center flex-col">
</div>
  <div>
      <Banner background="purple" direction="forward"/>
      <Banner background="black" direction="reverse"/>
</div>
    </main>

  )
}
