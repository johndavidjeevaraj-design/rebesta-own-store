import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './home/Home';
import Shop from './shop/Shop';
import ProductPage from './product/Product';
import Cart from './cart/Cart';
import { ToastProvider } from './components/Toaster';
import './styles.css';

/* One bundle, four HTML entries (index / shop / product / cart) — picked by pathname. */
const path = location.pathname.replace(/\/+$/, '') || '/';
const page =
  path.startsWith('/products/') ? <ProductPage /> :
  (path === '/shop' || path === '/offers' || path === '/greens') ? <Shop /> :
  path === '/cart' ? <Cart /> :
  <Home />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {page}
    </ToastProvider>
  </StrictMode>
);
