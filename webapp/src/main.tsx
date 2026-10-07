import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './home/Home';
import Shop from './shop/Shop';
import ProductPage from './product/Product';
import { ToastProvider } from './components/Toaster';
import './styles.css';

/* One bundle, three HTML entries (index / shop / product) — picked by pathname. */
const path = location.pathname.replace(/\/+$/, '') || '/';
const page =
  path.startsWith('/products/') ? <ProductPage /> :
  (path === '/shop' || path === '/offers' || path === '/greens') ? <Shop /> :
  <Home />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {page}
    </ToastProvider>
  </StrictMode>
);
