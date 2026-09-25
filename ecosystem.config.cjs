// PM2 process config — keeps Rebesta Fresh running forever
module.exports = {
  apps: [{
    name: 'rebesta-store',
    cwd: '/opt/rebesta-store',
    script: 'src/server.js',
    env: { NODE_ENV: 'production' },
    env_production: { NODE_ENV: 'production' },
    autorestart: true,
    max_memory_restart: '500M'
  }]
};
