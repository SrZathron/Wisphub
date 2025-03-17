module.exports = {
  apps: [
    {
      name: 'whatsapp-bot',
      script: 'whatsappBot.js',
      instances: 1, // Número de instancias
      exec_mode: 'fork', // Modo fork (no cluster)
      watch: true, // Opcional: para reiniciar cuando haya cambios en el código
    }
  ]
};

