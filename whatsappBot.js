const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');

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

client.on('auth_failure', (msg) => {
    console.error('Fallo en la autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('Cliente desconectado:', reason);
});

client.initialize();

// Función para manejar el comando !tormenta
const handleTormentaCommand = async (to) => {
    const textoTormenta = `*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*`;

    const imagePath = '/home/server/whatsapp-bot/Imagenes/tormenta.jpg';
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

// Función para manejar el comando !cambios
const handleCambiosCommand = async (to) => {
    const textoCambios = `Queremos informarte que a partir de enero de 2025 habrá un ajuste en el valor del abono mensual. Esta decisión se debe al incremento en los costos de nuestros proveedores, servicios de luz y otros gastos operativos que impactan directamente en nuestra actividad.\n\nSeguimos comprometidos a ofrecerte el mejor servicio posible y trabajando para que el aumento sea lo más moderado posible.\n\nSi tenés alguna consulta, no dudes en escribirnos. ¡Gracias por tu comprensión y confianza en nosotros!\n\nSaludos,\nPuntonet Internet`;

    const imagePath = '/home/server/whatsapp-bot/Imagenes/cambios.jpg';
    const chatId = `${to}@c.us`;

    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: textoCambios });
            console.log(`Mensaje de cambios enviado a ${to} con imagen.`);
        } else {
            console.warn('No se encontró la imagen en la ruta especificada.');
            await client.sendMessage(chatId, textoCambios);
            console.log(`Mensaje de cambios enviado a ${to} sin imagen.`);
        }
    } catch (error) {
        console.error(`Error al enviar el mensaje de cambios a ${to}:`, error);
    }
};

// Función para formatear el número de teléfono
const formatNumber = (number) => {
    // Si el número empieza con +54 pero no tiene el "9" después del código de área
    if (number.startsWith('54') && !number.startsWith('549')) {
        return number.replace(/^54/, '549');
    }
    return number;
};

// Endpoint para recibir solicitudes de envío de mensajes
app.post('/send', async (req, res) => {
    const { to, message } = req.body;

    if (!to || !message) {
        return res.status(400).json({ error: 'Se requieren los campos "to" y "message".' });
    }

    // Formatear número para WhatsApp
    const formattedNumber = formatNumber(to);
    const chatId = `${formattedNumber}@c.us`;

    try {
        if (message.toLowerCase() === '!tormenta') {
            console.log('Solicitud de comando !tormenta recibida desde WispHub.');
            await handleTormentaCommand(formattedNumber);
        } else if (message.toLowerCase() === '!cambios') {
            console.log('Solicitud de comando !cambios recibida desde WispHub.');
            await handleCambiosCommand(formattedNumber);
        } else {
            await client.sendMessage(chatId, message);
            console.log(`Mensaje enviado a ${formattedNumber}: ${message}`);
        }
        res.json({ status: 'Mensaje enviado correctamente', to: formattedNumber, message });
    } catch (error) {
        console.error('Error al procesar la solicitud:', error);
        res.status(500).json({ error: 'Ocurrió un error al intentar enviar el mensaje.' });
    }
});

// Iniciar el servidor Express
app.listen(port, () => {
    console.log(`Servidor escuchando en http://0.0.0.0:${port}`);
});
