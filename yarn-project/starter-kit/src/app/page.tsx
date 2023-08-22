import { ContractAbi } from '@aztec/foundation/abi';
import '../App.css';

import aztecLogo from '../assets/aztec_logo.svg';
import Banner from './banner';
import DynamicContractForm from './contractForm';
// TODO: make this read a noir contract ABI and generate a simple frontend based on that input


/**
 * 
 * @param ContractAbiData - a contract ABI, generate frontend based on this
 * @returns 
 */
export default function Home({ ContractAbiData}: {/**
 * ContractAbiData - a contract ABI, generate frontend based on this
 */
ContractAbiData: ContractAbi}) {
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


      <DynamicContractForm contractAbi={ContractAbiData}/>
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
