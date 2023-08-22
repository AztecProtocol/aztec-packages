import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './app/page';
// TODO: allow the assert (something about babel)
import PrivateTokenJson from './artifacts/private_token_contract.json'; // assert { type: 'json' };

import { ContractAbi } from '@aztec/foundation/abi';
import './index.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Home ContractAbiData={PrivateTokenJson as ContractAbi}/>
  </React.StrictMode>
);

