import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/fluent.css';
import './App.css';
import { setupTauriBridge } from './utils/tauriBridge';

setupTauriBridge();

// Disable default browser context menu (Back, Refresh, Save as, Print, etc.) globally
window.addEventListener(
  'contextmenu',
  (e) => {
    e.preventDefault();
  },
  false
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
