import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Home from './home/Home';
import Shop from './shop/Shop';
import ProductPage from './product/Product';
import Cart from './cart/Cart';
import OrderSuccess from './pages/OrderSuccess';
import Track from './pages/Track';
import Login from './pages/Login';
import Account from './pages/Account';
import { ToastProvider } from './components/Toaster';
import './styles.css';

/* One bundle, eight HTML entries — picked by pathname. */
const path = location.pathname.replace(/\/+$/, '') || '/';
const page =
  path.startsWith('/products/') ? <ProductPage /> :
  (path === '/shop' || path === '/offers' || path === '/greens') ? <Shop /> :
  path === '/cart' ? <Cart /> :
  path === '/order-success' ? <OrderSuccess /> :
  path === '/track' ? <Track /> :
  path === '/login' ? <Login /> :
  path === '/account' ? <Account /> :
  <Home />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {page}
    </ToastProvider>
  </StrictMode>
);
