const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs'); // Para manejar archivos locales

const app = express();
const port = 5000;

app.use(bodyParser.json());

// Configuración del cliente de WhatsApp
const client = new Client({
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs'); // Para manejar archivos locales

const app = express();
const port = 5000;

app.use(bodyParser.json());

// Configuración del cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Escanea el QR para iniciar sesión
client.on('qr', (qr) => {
    console.log('QR recibido, escanéalo con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Cliente de WhatsApp listo para enviar mensajes.');
});

// Manejar errores
client.on('auth_failure', (msg) => {
    console.error('Fallo en la autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
});

client.initialize();

// Función para calcular el delay dinámico
const calculateDelay = (messageCount) => {
    const delay = Math.min(10, 2 + Math.floor((messageCount - 3) / 2)); // Máximo 10 segundos
    return delay * 1000;
};

// Función para enviar mensajes con delay
const sendMessagesWithDelay = async (messages) => {
    for (let i = 0; i < messages.length; i++) {
        const { chatId, mensaje } = messages[i];
        try {
            await client.sendMessage(chatId, mensaje);
            console.log(`Mensaje enviado a ${chatId}: ${mensaje}`);
        } catch (error) {
            console.error(`Error al enviar mensaje a ${chatId}:`, error);
        }

        if (i < messages.length - 1) {
            const delay = calculateDelay(messages.length - i);
            console.log(`Esperando ${delay / 1000} segundos antes de enviar el siguiente mensaje...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
};

// Función para manejar el comando !tormenta
const handleTormentaCommand = async (message, chat) => {
    const textoTormenta = `*Aviso Importante de PuntoNet*

Estimados clientes,

Debido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.

La seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.

Saludos cordiales,

*El equipo de PuntoNet*`;

    // Ruta de la imagen (asegúrate de que exista en el servidor)
    const imagePath = './tormenta.jpg';

    try {
        // Envía la imagen con el mensaje
        await chat.sendMessage(textoTormenta, { media: fs.readFileSync(imagePath) });
        console.log('Mensaje de tormenta enviado.');
    } catch (error) {
        console.error('Error al enviar el mensaje de tormenta:', error);
    }
};

// Detectar mensajes entrantes
client.on('message', async (message) => {
    const chat = await message.getChat();

    // Detectar el comando !tormenta
    if (message.body.toLowerCase() === '!tormenta') {
        console.log('Comando !tormenta detectado.');
        await handleTormentaCommand(message, chat);
    }
});

// Endpoint para recibir solicitudes de envío de mensajes
app.post('/send', async (req, res) => {
    const { numeros, mensaje } = req.body;

    if (!numeros || !mensaje) {
        return res.status(400).json({ error: 'Se requieren los campos "numeros" (array) y "mensaje".' });
    }

    try {
        const messages = numeros.map((numero) => ({
            chatId: `${numero}@c.us`,
            mensaje,
        }));

        sendMessagesWithDelay(messages);

        res.json({ status: 'Mensajes enviados correctamente', numeros, mensaje });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).json({ error: 'Ocurrió un error al intentar enviar los mensajes.' });
    }
});

// Iniciar el servidor Express
app.listen(port, () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${port}`);
});
