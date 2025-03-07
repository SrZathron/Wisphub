const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// ================================================== //
//                     CONSTANTES                     //
// ================================================== //
const CLIENTS_FILE = path.join(__dirname, 'clientes.json');
const AUTHORIZED_NUMBERS = ['5492664031203', '5492664298513'];
const MAX_DELAY_MS = 10000; // 10 segundos máximo

// ================================================== //
//               CONFIGURACIÓN WHATSAPP               //
// ================================================== //
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    },
    takeoverOnConflict: true
});

// ================================================== //
//                 FUNCIÓN DE NÚMEROS                 //
// ================================================== //
const formatNumber = (number) => {
    const cleaned = number.replace(/\D/g, '');
    
    if (/^549\d{10}$/.test(cleaned)) return cleaned;
    if (/^54\d{10}$/.test(cleaned)) return `549${cleaned.slice(2)}`;
    if (/^\d{10}$/.test(cleaned)) return `549${cleaned}`;
    
    throw new Error(`Formato inválido: ${number}`);
};

// ================================================== //
//              GESTIÓN DE CLIENTES                   //
// ================================================== //
const updateClients = async (number, action = 'add') => {
    try {
        const clients = fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8'))
            : [];

        const index = clients.findIndex(c => c.number === number);
        
        if (action === 'add' && index === -1) {
            clients.push({
                number,
                timestamp: new Date().toISOString(),
                lastMessage: new Date().toISOString()
            });
        } else if (action === 'remove' && index !== -1) {
            clients.splice(index, 1);
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

// ================================================== //
//               SISTEMA DE DELAY Y LOGS              //
// ================================================== //
const sendMessagesWithDelay = async (messages) => {
    const totalMessages = messages.length;
    
    if (totalMessages <= 3) {
        console.log('\n=== ENVÍO RÁPIDO ===');
        for (const msg of messages) {
            try {
                await processCommand(msg.number, msg.content);
                console.log(`[INMEDIATO] Enviado a ${msg.number}`);
            } catch (error) {
                console.error(`[ERROR] ${msg.number}: ${error.message}`);
            }
        }
        return;
    }

    console.log('\n=== ENVÍO CON DELAY PROGRESIVO ===');
    const delayIncrement = MAX_DELAY_MS / (totalMessages - 1);
    
    for (let i = 0; i < totalMessages; i++) {
        const { number, content } = messages[i];
        
        try {
            await processCommand(number, content);
            console.log(`[ENVIADO] ${number}${i > 0 ? ' (con delay)' : ''}`);
        } catch (error) {
            console.error(`[FALLIDO] ${number}: ${error.message}`);
        }

        if (i < totalMessages - 1) {
            const currentDelay = Math.min(delayIncrement * (i + 1), MAX_DELAY_MS);
            console.log(`⏳ Esperando ${(currentDelay / 1000).toFixed(2)}s`);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
    }
};

// ================================================== //
//               MANEJO DE COMANDOS                   //
// ================================================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        if (!AUTHORIZED_NUMBERS.includes(sender)) {
            console.log(`[BLOQUEADO] Intento de acceso de ${sender}`);
            return;
        }

        if (body.startsWith('Enviar:')) {
            const command = body.split('Enviar:')[1].split(':todos')[0].trim();
            const allRecipients = [...new Set([...getClientList(), ...AUTHORIZED_NUMBERS])];
            
            console.log(`\n=== INICIANDO ENVÍO MASIVO ===\nDestinatarios: ${allRecipients.length}`);
            
            const messages = allRecipients.map(number => ({
                number: number,
                content: command
            }));

            await sendMessagesWithDelay(messages);
            
            console.log('\n=== ENVÍO COMPLETADO ===');
            await msg.reply(`✅ Enviado a ${allRecipients.length} contactos`);
        }

        if (body.startsWith('Eliminar:')) {
            const targetNumber = body.split('Eliminar:')[1].trim();
            await updateClients(targetNumber, 'remove');
            console.log(`[ELIMINADO] ${targetNumber}`);
            await msg.reply(`🗑️ Eliminado: ${targetNumber}`);
        }

    } catch (error) {
        console.error('[ERROR CRÍTICO]', error);
        await msg.reply(`❌ Error: ${error.message}`);
    }
});

// ================================================== //
//                 FUNCIONES PRINCIPALES              //
// ================================================== //
const processCommand = async (number, command) => {
    try {
        switch (command.toLowerCase()) {
            case '!tormenta':
                await sendAlert(number, 'tormenta.jpg', *Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*);
                break;
            case '!cambios':
                await sendAlert(number, '2025.jpg', '¡Feliz Año Nuevo! Comienza el 2025 conectado con PuntoNet.');
                break;
            default:
                await client.sendMessage(`${number}@c.us`, command);
        }
        await updateClients(number);
    } catch (error) {
        throw new Error(`Error procesando comando: ${error.message}`);
    }
};

const sendAlert = async (number, imageName, message) => {
    const imagePath = path.join(__dirname, 'imagenes', imageName);
    const chatId = `${number}@c.us`;
    
    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: message });
            console.log(`⚡ Alerta con imagen enviada a ${number}`);
        } else {
            await client.sendMessage(chatId, message);
            console.log(`⚡ Alerta sin imagen enviada a ${number}`);
        }
    } catch (error) {
        throw new Error(error.message);
    }
};

// ================================================== //
//                 CONFIGURACIÓN SERVER               //
// ================================================== //
const app = express();
const port = 5001;

app.use(bodyParser.json());
app.post('/send', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) return res.status(400).json({ error: 'Datos requeridos' });
        
        const formattedNumber = formatNumber(to);
        console.log(`[SOLICITUD MANUAL] Iniciando envío a ${formattedNumber}`);
        await processCommand(formattedNumber, message);
        
        res.json({ 
            status: 'success', 
            number: formattedNumber,
            log: `Envío registrado a ${formattedNumber}`
        });

    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            detalle: 'Error en el servidor'
        });
    }
});

// ================================================== //
//                 INICIALIZACIÓN                     //
// ================================================== //
client.initialize();
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('[ESTADO] Bot autenticado y listo'));
client.on('disconnected', (reason) => console.log('[DESCONECTADO]', reason));

app.listen(port, () => {
    console.log(`[SERVIDOR] Activo en puerto ${port}`);
});
