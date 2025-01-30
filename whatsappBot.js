const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

process.on('unhandledRejection', (error) => {
    console.error('⚠️  Error no manejado:', error);
});

const app = express();
const port = 5001;

// Configuración
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Archivos y constantes
const CLIENTS_FILE = path.join(__dirname, 'clientes.json');
const AUTHORIZED_NUMBERS = ['5491122334455', '5495543212345']; // Tus 2 números

// ======================= FUNCIÓN DE FORMATEO MEJORADA ======================= //
const formatNumber = (number) => {
    const cleaned = number.replace(/\D/g, '');
    
    if (/^549\d{10}$/.test(cleaned)) return cleaned;
    if (/^54\d{10}$/.test(cleaned)) return `549${cleaned.slice(2)}`;
    if (/^\d{10}$/.test(cleaned)) return `549${cleaned}`;
    
    throw new Error(`Número inválido: ${number}`);
};

// ================== CONFIGURACIÓN DE WHATSAPP CON RECONEXIÓN ================= //
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas'
        ]
    },
    takeoverOnConflict: true
});

// Eventos del cliente
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ Bot autenticado'));
client.on('auth_failure', msg => console.error('❌ Fallo de autenticación:', msg));
client.on('disconnected', async (reason) => {
    console.log('⏳ Reconectando... Motivo:', reason);
    await client.initialize();
});

// ======================== GESTIÓN DE CLIENTES MEJORADA ======================== //
const updateClients = async (number, action = 'add') => {
    try {
        const clients = fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'))
            : [];

        const exists = clients.some(c => c.number === number);
        
        if (action === 'add' && !exists) {
            clients.push({
                number,
                timestamp: new Date().toISOString(),
                lastMessage: new Date().toISOString()
            });
        } else if (action === 'remove') {
            const index = clients.findIndex(c => c.number === number);
            if (index !== -1) clients.splice(index, 1);
        }

        fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error en updateClients:', error);
    }
};

const getClientList = () => {
    try {
        return fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')).map(c => c.number)
            : [];
    } catch (error) {
        console.error('Error en getClientList:', error);
        return [];
    }
};

// ======================== NÚCLEO DE FUNCIONALIDADES ======================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        // Verificar autorización
        if (!AUTHORIZED_NUMBERS.includes(sender)) return;

        // Comando ENVIAR (Mejorado)
        if (body.startsWith('Enviar:')) {
            const [_, content] = body.split(':todos');
            const command = content.replace('Enviar:', '').trim();
            
            // Obtener TODOS los destinatarios: clientes + autorizados
            const storedClients = getClientList();
            const allRecipients = [...new Set([...storedClients, ...AUTHORIZED_NUMBERS])];

            if (allRecipients.length === 0) {
                return await msg.reply('❌ No hay contactos para enviar');
            }

            await msg.reply(`📤 Enviando a ${allRecipients.length} contactos...`);

            // Preparar mensajes incluyendo autorizados
            const messages = allRecipients.map(number => ({
                chatId: `${number}@c.us`,
                mensaje: command
            }));

            await sendMessagesWithDelay(messages);
            await msg.reply('✅ Envío completado');
        }

        // Comando ELIMINAR
        if (body.startsWith('Eliminar:')) {
            const number = body.split('Eliminar:')[1].trim();
            await updateClients(number, 'remove');
            await msg.reply(`🗑️ Número eliminado: ${number}`);
        }

    } catch (error) {
        console.error('Error en comando:', error);
        await msg.reply(`❌ Error: ${error.message}`);
    }
});

// ================== SISTEMA DE DELAY CON CONTROL DE ERRORES ================== //
const sendMessagesWithDelay = async (messages) => {
    const MAX_DELAY_MS = 10000;
    const totalMessages = messages.length;

    if (totalMessages <= 3) {
        for (const msg of messages) {
            await processMessage(msg);
        }
        return;
    }

    const delayStep = MAX_DELAY_MS / (totalMessages - 1);
    
    for (let i = 0; i < totalMessages; i++) {
        try {
            await processMessage(messages[i]);
            console.log(`[${i + 1}/${totalMessages}] Enviado`);

            if (i < totalMessages - 1) {
                const currentDelay = Math.min(delayStep * (i + 1), MAX_DELAY_MS);
                console.log(`⏳ Espera: ${(currentDelay / 1000).toFixed(2)}s`);
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        } catch (error) {
            console.error(`Error en mensaje ${i + 1}:`, error.message);
        }
    }
};

const processMessage = async ({ chatId, mensaje }) => {
    const command = mensaje.trim().toLowerCase();
    const number = chatId.split('@')[0];

    try {
        switch (command) {
            case '!tormenta':
                await handleTormenta(number);
                break;
            case '!cambios':
                await handleCambios(number);
                break;
            default:
                await client.sendMessage(chatId, mensaje);
        }
    } catch (error) {
        console.error(`Error en ${number}:`, error);
        throw error;
    }
};

// ======================= HANDLERS DE COMANDOS CON IMÁGENES ======================= //
const handleTormenta = async (number) => {
    const imagePath = path.join(__dirname, 'imagenes/tormenta.jpg');
    const message = `*Aviso Importante*\n...`; // Mensaje completo

    try {
        const media = fs.existsSync(imagePath) 
            ? MessageMedia.fromFilePath(imagePath)
            : null;
        
        await client.sendMessage(
            `${number}@c.us`, 
            media || message,
            media ? { caption: message } : {}
        );
    } catch (error) {
        console.error(`Error en !tormenta (${number}):`, error);
        throw error;
    }
};

const handleCambios = async (number) => {
    const imagePath = path.join(__dirname, 'imagenes/2025.jpg');
    const message = `¡Feliz 2025!...`; // Mensaje completo

    try {
        const media = fs.existsSync(imagePath) 
            ? MessageMedia.fromFilePath(imagePath)
            : null;
        
        await client.sendMessage(
            `${number}@c.us`, 
            media || message,
            media ? { caption: message } : {}
        );
    } catch (error) {
        console.error(`Error en !cambios (${number}):`, error);
        throw error;
    }
};

// ======================= ENDPOINT PARA WISPHUB ======================= //
app.post('/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        const formattedNumber = formatNumber(to);
        await updateClients(formattedNumber);  // Almacenar automáticamente

        const chatId = `${formattedNumber}@c.us`;
        const command = message.trim().toLowerCase();

        if (command === '!tormenta') {
            await handleTormenta(formattedNumber);
        } else if (command === '!cambios') {
            await handleCambios(formattedNumber);
        } else {
            await client.sendMessage(chatId, message);
        }

        res.json({ 
            status: 'success',
            number: formattedNumber,
            message: message
        });

    } catch (error) {
        console.error('Error en /send:', error);
        res.status(400).json({ error: error.message });
    }
});

// ======================= INICIALIZACIÓN ======================= //
client.initialize();
app.listen(port, () => console.log(`🌍 Servidor en http://0.0.0.0:${port}`));