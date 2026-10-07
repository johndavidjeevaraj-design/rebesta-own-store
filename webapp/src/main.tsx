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
import About from './pages/About';
import Faq from './pages/Faq';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';
import Refund from './pages/Refund';
import Subscriptions from './pages/Subscriptions';
import NotFound from './pages/NotFound';
import { ToastProvider } from './components/Toaster';
import './styles.css';

/* One bundle, fifteen HTML entries — picked by pathname.
   Unknown paths render NotFound (the server serves 404.html for them). */
const path = location.pathname.replace(/\/+$/, '') || '/';
const page =
  path === '/' ? <Home /> :
  path.startsWith('/products/') ? <ProductPage /> :
  (path === '/shop' || path === '/offers' || path === '/greens') ? <Shop /> :
  path === '/cart' ? <Cart /> :
  path === '/order-success' ? <OrderSuccess /> :
  path === '/track' ? <Track /> :
  path === '/login' ? <Login /> :
  path === '/account' ? <Account /> :
  path === '/about' ? <About /> :
  path === '/faq' ? <Faq /> :
  path === '/terms' ? <Terms /> :
  path === '/privacy' ? <Privacy /> :
  path === '/refund' ? <Refund /> :
  path === '/subscriptions' ? <Subscriptions /> :
  <NotFound />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      {page}
    </ToastProvider>
  </StrictMode>
);
