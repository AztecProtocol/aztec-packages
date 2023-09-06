import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import '../../tailwind.config.cjs';
import { Home } from './home.js';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Home />
  </React.StrictMode>,
);
