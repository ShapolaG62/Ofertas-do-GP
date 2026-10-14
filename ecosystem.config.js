module.exports = {
  apps: [
    {
      name: 'ofertas-do-gp',
      script: 'server.js',
      instances: 1, // manter 1: o minerador e o banco SQLite não devem rodar em paralelo
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
