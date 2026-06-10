import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ensureFreshBundle } from './utils/ensureFreshBundle';
import './styles.css';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
ensureFreshBundle(APP_VERSION);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
