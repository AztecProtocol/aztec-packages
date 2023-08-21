"use client";

import { ContractAbi } from '@aztec/foundation/abi';
import { useEffect, useState } from 'react';

import Image from 'next/image';
import Banner from './banner';
import DynamicContractForm from './contractForm';
// TODO: make this read a noir contract ABI and generate a simple frontend based on that input


type HomePageProps = {
  jsonData: ContractAbi[];  // Again, consider using a more specific type than `any` if you know the structure of your JSON data
};

export default function Home({ ContractAbiData}: {ContractAbiData: HomePageProps}) {
    const [abi, setAbi] = useState(null);


  useEffect(() => {
    // Fetch the ABI data from the API route
    async function fetchAbi() {
      try {
        const response = await fetch('/api/contractAbi');
        const data = await response.json();
        setAbi(data);
      } catch (error) {
        console.error("Failed to fetch ABI:", error);
      }
    }
    fetchAbi();
  }, []);


  return (

    <main className="flex min-h-screen flex-col items-center justify-between">
      <div>
      <Banner background="black" direction="forward"/>
      <Banner background="purple" direction="reverse"/>
  </div>

      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">

        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
            <Image
              className="relative dark:drop-shadow-[0_0_0.3rem_#ffffff70] dark:invert"
              src="/logo.svg"
              alt="Aztec Logo"
              width={180}
              height={37}
              priority
            />
        </div>
      </div>

      <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-radial before:from-white before:to-transparent before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-conic after:from-sky-200 after:via-blue-200 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-sky-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px] z-[-1]">

      <div>
      {abi ? <DynamicContractForm contractAbi={abi[0]}/>: ''}
</div>
    </div>


<div>
      <Banner background="purple" direction="forward"/>
      <Banner background="black" direction="reverse"/>
</div>
    </main>

  )
}
