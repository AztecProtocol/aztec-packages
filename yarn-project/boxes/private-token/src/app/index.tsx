import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Reset } from 'styled-reset';
// import Home from './page.js';
import { L2Tx } from '@aztec/types';
import { TxHash } from '@aztec/aztec.js';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Reset />
    {/* <Home /> */}
    {L2Tx.random().blockHash.toString()}
    {TxHash.ZERO.toString()}
  </React.StrictMode>,
);
