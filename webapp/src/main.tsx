import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './home/Home';
import { ToastProvider } from './components/Toaster';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Home />
    </ToastProvider>
  </StrictMode>
);
