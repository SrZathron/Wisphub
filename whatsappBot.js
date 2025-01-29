const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const port = 5001;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configuración del cliente de WhatsApp (sin cambios)
const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
    console.log('QR recibido, escanéalo con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Cliente de WhatsApp listo para enviar mensajes.');
});

client.on('auth_failure', (msg) => {
    console.error('Fallo en la autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
});

client.initialize();

// Función para formatear el número (sin cambios)
const formatNumber = (number) => {
    if (number.startsWith('54') && !number.startsWith('549')) {
        return number.replace(/^54/, '549');
    }
    return number;
};

// ========== SECCIÓN MODIFICADA ========== //
const sendMessagesWithDelay = async (messages) => {
    const maxDelayMs = 10000; // 10 segundos máximo
    const numMessages = messages.length;

    if (numMessages <= 3) {
        for (const msg of messages) {
            await client.sendMessage(msg.chatId, msg.mensaje);
        }
        return;
    }

    const incremento = maxDelayMs / (numMessages - 1);

    for (let i = 0; i < numMessages; i++) {
        const { chatId, mensaje } = messages[i];

        try {
            await client.sendMessage(chatId, mensaje);
            console.log(`[${i + 1}/${numMessages}] Enviado a ${chatId}`);
        } catch (error) {
            console.error(`Error en ${chatId}:`, error.message);
        }

        if (i < numMessages - 1) {
            const delay = Math.min(incremento * (i + 1), maxDelayMs);
            console.log(`⏳ Espera: ${(delay / 1000).toFixed(2)}s`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};
// ========== FIN DE SECCIÓN MODIFICADA ========== //

// Handlers de comandos !tormenta y !cambios (sin cambios)
const handleTormentaCommand = async (to) => {
    const textoTormenta = `*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*`;

    const imagePath = '/home/lioespider75/Wisphub/imagenes/tormenta.jpg';
    const chatId = `${to}@c.us`;

    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: textoTormenta });
            console.log(`Mensaje de tormenta enviado a ${to} con imagen.`);
        } else {
            console.warn('No se encontró la imagen en la ruta especificada.');
            await client.sendMessage(chatId, textoTormenta);
            console.log(`Mensaje de tormenta enviado a ${to} sin imagen.`);
        }
    } catch (error) {
        console.error(`Error al enviar el mensaje de tormenta a ${to}:`, error);
    }
};

const handleCambiosCommand = async (to) => {
    const textoCambios = `Comienza el 2025 conectado con alegría y esperanza. Les envía sus mejores deseos, PuntoNet. ¡Feliz Año Nuevo!`;

    const imagePath = '/home/lioespider75/Wisphub/imagenes/2025.jpg';
    const chatId = `${to}@c.us`;

    try {
        if (fs.existsSync(imagePath)) {
            console.log('Imagen encontrada. Enviando mensaje con imagen...');
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: textoCambios });
            console.log(`Mensaje de cambios enviado a ${to} con imagen.`);
        } else {
            console.warn('No se encontró la imagen en la ruta especificada. Enviando solo texto...');
            await client.sendMessage(chatId, textoCambios);
            console.log(`Mensaje de cambios enviado a ${to} sin imagen.`);
        }
    } catch (error) {
        console.error(`Error al enviar el mensaje de cambios a ${to}:`, error);
        throw new Error(`Error en handleCambiosCommand: ${error.message}`);
    }
};

// Endpoint /send (solo se modificó el llamado a sendMessagesWithDelay)
app.post('/send', async (req, res) => {
    console.log('Datos recibidos:', req.body);

    if (req.body.messages && Array.isArray(req.body.messages)) {
        const messages = req.body.messages;

        if (!messages.every(msg => msg.chatId && msg.mensaje)) {
            return res.status(400).json({ error: 'El arreglo "messages" debe contener objetos con "chatId" y "mensaje".' });
        }

        try {
            await sendMessagesWithDelay(messages); // Línea modificada
            return res.json({ status: 'Todos los mensajes fueron enviados correctamente.' });
        } catch (error) {
            console.error('Error al enviar mensajes:', error);
            return res.status(500).json({ error: 'Ocurrió un error al enviar múltiples mensajes.' });
        }
    }

    // Resto del código SIN CAMBIOS
    const to = req.body.to || req.body.destinatario;
    const message = req.body.message || req.body.mensaje;

    if (!to || !message) {
        return res.status(400).json({ error: 'Se requieren los campos "to" y "message" o sus equivalentes.' });
    }

    const formattedNumber = formatNumber(to);
    const chatId = `${formattedNumber}@c.us`;

    try {
        if (message.toLowerCase() === '!cambios') {
            console.log('Solicitud de comando !cambios recibida.');
            await handleCambiosCommand(formattedNumber);
        } else if (message.toLowerCase() === '!tormenta') {
            console.log('Solicitud de comando !tormenta recibida.');
            await handleTormentaCommand(formattedNumber);
        } else {
            console.log(`Enviando mensaje a ${chatId}: ${message}`);
            await client.sendMessage(chatId, message);
        }
        return res.json({ status: 'Mensaje enviado correctamente', to: formattedNumber, message });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        return res.status(500).json({ error: 'Ocurrió un error al intentar enviar el mensaje.' });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('Error de sintaxis en el JSON:', err);
        return res.status(400).json({ error: 'El cuerpo de la solicitud tiene un formato incorrecto.' });
    }
    next();
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${port}`);
});