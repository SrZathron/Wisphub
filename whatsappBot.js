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
const AUTHORIZED_NUMBERS = ['5492664031203', '5492664298513']; // Tus números
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
    }
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
            clients.push({ number, timestamp: new Date().toISOString() });
            fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
        } else if (action === 'remove' && index !== -1) {
            clients.splice(index, 1);
            fs.writeFileSync(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf-8');
        }
    } catch (error) {
        console.error('Error en gestión de clientes:', error);
    }
};

const getClientList = () => {
    try {
        return fs.existsSync(CLIENTS_FILE) 
            ? JSON.parse(fs.readFileSync(CLIENTS_FILE, 'utf-8')).map(c => c.number)
            : [];
    } catch (error) {
        console.error('Error leyendo clientes:', error);
        return [];
    }
};

// ================================================== //
//               ENVÍO CON DELAY PROGRESIVO           //
// ================================================== //
const sendMessages = async (messages) => {
    const total = messages.length;
    
    for (let i = 0; i < total; i++) {
        const { chatId, content } = messages[i];
        
        try {
            // Procesar comandos especiales
            if (content.toLowerCase() === '!tormenta') {
                await sendAlert(chatId.split('@')[0], 'tormenta.jpg', 
                    '*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*');
            } else if (content.toLowerCase() === '!cambios') {
                await sendAlert(chatId.split('@')[0], '2025.jpg', 
                    '¡Feliz 2025! Comienza el año conectado con PuntoNet.');
            } else {
                await client.sendMessage(chatId, content);
            }
            
            console.log(`✅ ${chatId}: Mensaje enviado`);

            // Aplicar delay progresivo a partir del 3er mensaje
            if (i >= 2) {
                const delay = Math.min(MAX_DELAY_MS, (MAX_DELAY_MS / (total - 2)) * (i - 1));
                console.log(`⏳ Esperando ${(delay / 1000).toFixed(2)}s`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

        } catch (error) {
            console.error(`❌ ${chatId}: ${error.message}`);
        }
    }
};

// ================================================== //
//               FUNCIÓN PARA ALERTAS                 //
// ================================================== //
const sendAlert = async (number, imageName, message) => {
    const imagePath = path.join(__dirname, 'imagenes', imageName);
    const chatId = `${number}@c.us`;

    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(chatId, media, { caption: message });
        } else {
            await client.sendMessage(chatId, message);
        }
    } catch (error) {
        throw new Error(`Error enviando alerta: ${error.message}`);
    }
};

// ================================================== //
//               MANEJO DE COMANDOS WHATSAPP          //
// ================================================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        if (!AUTHORIZED_NUMBERS.includes(sender)) return;

        // Comando de envío masivo
        if (body.startsWith('Enviar:')) {
            const [command] = body.split(':todos')[0].split('Enviar:')[1].trim().split(':');
            const allRecipients = [...new Set([...getClientList(), ...AUTHORIZED_NUMBERS])];
            
            console.log(`\n📤 Envío masivo iniciado a ${allRecipients.length} contactos`);
            await sendMessages(allRecipients.map(num => ({
                chatId: `${num}@c.us`,
                content: command
            })));
        }

        // Comando eliminar
        if (body.startsWith('Eliminar:')) {
            const number = formatNumber(body.split('Eliminar:')[1].trim());
            await updateClients(number, 'remove');
            await msg.reply(`🗑️ Número eliminado: ${number}`);
        }

    } catch (error) {
        console.error('Error procesando comando:', error);
    }
});

// ================================================== //
//               ENDPOINT PARA WISPHUB                //
// ================================================== //
const app = express();
const port = 5001;

app.use(bodyParser.json());
app.post('/send', async (req, res) => {
    try {
        const messages = Array.isArray(req.body) ? req.body : [req.body];
        const formattedMessages = messages.map(msg => ({
            chatId: `${formatNumber(msg.to)}@c.us`,
            content: msg.message
        }));

        console.log(`📦 Recibidos ${formattedMessages.length} mensajes desde Wisphub`);
        await sendMessages(formattedMessages);
        
        res.json({ 
            status: 'success',
            processed: formattedMessages.length
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================================================== //
//               INICIALIZACIÓN                       //
// ================================================== //
client.initialize();
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🟢 Bot listo para enviar mensajes'));
client.on('disconnected', (reason) => {
    console.log('🔴 Reconectando...', reason);
    client.initialize();
});

app.listen(port, () => {
    console.log(`🌐 Servidor escuchando en puerto ${port}`);
});