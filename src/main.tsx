import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { I18nProvider } from './i18n/I18nProvider';
import { ensureFreshBundle } from './utils/ensureFreshBundle';
import './styles.css';

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';
ensureFreshBundle(APP_VERSION);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
);
