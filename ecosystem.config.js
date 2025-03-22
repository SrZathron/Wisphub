module.exports = {
    apps: [{
      name: 'whatsapp-bot',
      script: 'index.js',
      env: {
        NODE_EXTRA_CA_CERTS: '/home/server/Wisphub/ssl/ca_bundle.crt'
      }
    }]
  };