import React from 'react';
import { createRoot } from 'react-dom/client';
import { BlueprintProvider } from '@blueprintjs/core';
import './icons.js';
import '@blueprintjs/core/lib/css/blueprint.css';
import '@blueprintjs/core/lib/css/blueprint-design-tokens.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <BlueprintProvider>
    <App />
  </BlueprintProvider>
);
