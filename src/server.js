import { config } from './config.js';
import { createStoreApp } from './app.js';
import { writeAutoBackup } from './lib/store.js';

const app = createStoreApp();
const server = app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({ event: 'store.started', host: config.host, port: config.port, appUrl: config.appUrl }));
  writeAutoBackup();
  const backupTimer = setInterval(writeAutoBackup, 24 * 60 * 60 * 1000);
  backupTimer.unref();
});

const shutdown = signal => {
  console.log(JSON.stringify({ event: 'store.shutdown', signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
