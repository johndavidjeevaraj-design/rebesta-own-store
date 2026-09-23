import { config } from './config.js';
import { createStoreApp } from './app.js';

const app = createStoreApp();
app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ event: 'store.started', host: config.host, port: config.port, appUrl: config.appUrl }));
});
