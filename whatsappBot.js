const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 5001;

// Configuración inicial
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Archivo para almacenar clientes y números autorizados
const CLIENTS_FILE = path.join(__dirname, 'clientes.json');
const AUTHORIZED_NUMBERS = ['5492664031203', '5492664298513']; // Cambia por tus números

// ========== FUNCIONES DE GESTIÓN ========== //
const updateClients = async (number, action = 'add') => {
    try {
        const clients = fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE)) 
            : [];

        if (action === 'add') {
            if (!clients.some(c => c.number === number)) {
                clients.push({ number, timestamp: new Date().toISOString() });
            }
        } else {
            const index = clients.findIndex(c => c.number === number);
            if (index !== -1) clients.splice(index, 1);
        }

        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2));
    } catch (error) {
        console.error('Error actualizando clientes:', error);
    }
};

const getAllClients = () => {
    try {
        return fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE)).map(c => c.number) 
            : [];
    } catch (error) {
        console.error('Error leyendo clientes:', error);
        return [];
    }
};

// ========== CONFIGURACIÓN DEL BOT ========== //
const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Cliente listo'));
client.on('auth_failure', msg => console.error('Fallo auth:', msg));
client.on('disconnected', reason => console.log('Desconectado:', reason));

client.initialize();

// ========== MANEJO DE COMANDOS POR WHATSAPP ========== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        // Verificar autorización
        if (!AUTHORIZED_NUMBERS.includes(sender)) return;

        // Comando ENVIAR
        if (body.startsWith('Enviar:')) {
            const [_, content] = body.split('Enviar:')[1].split(':todos');
            const command = content.trim().toLowerCase();
            const clients = getAllClients();

            if (clients.length === 0) {
                await msg.reply('❌ No hay clientes registrados');
                return;
            }

            await msg.reply(`🚀 Enviando a ${clients.length} clientes...`);

            // Usar comandos existentes (!tormenta, !cambios) o mensaje personalizado
            const messages = clients.map(chatId => ({
                chatId: `${chatId}@c.us`,
                mensaje: command.startsWith('!') ? command : content.trim()
            }));

            await sendMessagesWithDelay(messages);
            await msg.reply('✅ Envío masivo completado');
        }

        // Comando ELIMINAR
        if (body.startsWith('Eliminar:')) {
            const number = body.split('Eliminar:')[1].trim();
            await updateClients(number, 'remove');
            await msg.reply(`❌ Número ${number} eliminado`);
        }

    } catch (error) {
        console.error('Error procesando comando:', error);
    }
});

// ========== FUNCIONES ORIGINALES (COMPATIBLES) ========== //
const sendMessagesWithDelay = async (messages) => {
    const maxDelayMs = 10000;
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
            // Ejecutar comandos especiales si existen
            if (mensaje.toLowerCase() === '!tormenta') {
                await handleTormentaCommand(chatId.split('@')[0]);
            } else if (mensaje.toLowerCase() === '!cambios') {
                await handleCambiosCommand(chatId.split('@')[0]);
            } else {
                await client.sendMessage(chatId, mensaje);
            }
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

// Handlers originales (sin cambios)
const handleTormentaCommand = async (to) => {
    const textoTormenta = `*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*`;

    const imagePath = '/home/lioespider75/Wisphub/imagenes/tormenta.jpg';
    const chatId = `${to}@c.us`;

    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: textoTormenta });
        } else {
            await client.sendMessage(chatId, textoTormenta);
        }
    } catch (error) {
        console.error(`Error al enviar !tormenta a ${to}:`, error);
    }
};

const handleCambiosCommand = async (to) => { /* ... mismo código ... */ };

// ========== ENDPOINT /send (COMPATIBLE) ========== //
app.post('/send', async (req, res) => {
    // ... (código original sin cambios)

    try {
        const formattedNumber = formatNumber(to);
        const chatId = `${formattedNumber}@c.us`;

        // Almacenar número automáticamente
        await updateClients(formattedNumber);

        // Ejecutar comandos originales
        if (message.toLowerCase() === '!cambios') {
            await handleCambiosCommand(formattedNumber);
        } else if (message.toLowerCase() === '!tormenta') {
            await handleTormentaCommand(formattedNumber);
        } else {
            await client.sendMessage(chatId, message);
        }

        return res.json({ status: 'Mensaje enviado', to: formattedNumber, message });
    } catch (error) {
        // ... (manejo de errores original)
    }
});

// ... (resto del código sin cambios)

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