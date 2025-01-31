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
                lastMessage: null
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
//               MANEJO DE COMANDOS                   //
// ================================================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        if (!AUTHORIZED_NUMBERS.includes(sender)) {
            console.log(`Intento no autorizado de: ${sender}`);
            return;
        }

        // Comando ENVIAR
        if (body.startsWith('Enviar:')) {
            const command = body.split('Enviar:')[1].split(':todos')[0].trim();
            const allRecipients = [...new Set([...getClientList(), ...AUTHORIZED_NUMBERS])];
            
            console.log('Destinatarios:', allRecipients);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const number of allRecipients) {
                try {
                    await processCommand(number, command);
                    successCount++;
                } catch (error) {
                    errorCount++;
                    console.error(`Error en ${number}:`, error.message);
                }
            }
            
            await msg.reply(`✅ ${successCount} enviados | ❌ ${errorCount} fallidos`);
        }

        // Comando ELIMINAR
        if (body.startsWith('Eliminar:')) {
            const targetNumber = body.split('Eliminar:')[1].trim();
            await updateClients(targetNumber, 'remove');
            await msg.reply(`Número eliminado: ${targetNumber}`);
        }

    } catch (error) {
        console.error('Error crítico:', error);
        await msg.reply(`Error: ${error.message}`);
    }
});

// ================================================== //
//                 FUNCIONES PRINCIPALES              //
// ================================================== //
const processCommand = async (number, command) => {
    const chatId = `${number}@c.us`;
    
    try {
        switch (command.toLowerCase()) {
            case '!tormenta':
                await sendAlert(number, 'tormenta.jpg', '*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos tomar la precaución de desconectar sus equipos de internet, incluyendo antenas y routers, para evitar posibles daños.\n\nLa seguridad y el cuidado de sus equipos es nuestra prioridad. Si necesitan asistencia adicional, no duden en contactarnos.\n\nSaludos cordiales,\n\n*El equipo de PuntoNet*');
                break;
            case '!cambios':
                await sendAlert(number, '2025.jpg', '*Actualización 2025*');
                break;
            default:
                await client.sendMessage(chatId, command);
        }
        await updateClients(number);
    } catch (error) {
        throw new Error(`Error: ${error.message}`);
    }
};

const sendAlert = async (number, imageName, message) => {
    const imagePath = path.join(__dirname, 'imagenes', imageName);
    
    try {
        if (fs.existsSync(imagePath)) {
            const media = MessageMedia.fromFilePath(imagePath);
            await client.sendMessage(`${number}@c.us`, media, { caption: message });
        } else {
            await client.sendMessage(`${number}@c.us`, message);
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
        await processCommand(formattedNumber, message);
        
        res.json({ status: 'success', number: formattedNumber });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================================================== //
//                 INICIALIZACIÓN                     //
// ================================================== //
client.initialize();
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Bot autenticado'));
client.on('disconnected', (reason) => console.log('Desconectado:', reason));

app.listen(port, () => {
    console.log(`Servidor activo en puerto ${port}`);
});