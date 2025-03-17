const puppeteer = require('puppeteer');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

// ================================================== //
//                     CONSTANTES                     //
// ================================================== //
const AUTHORIZED_NUMBERS = (process.env.AUTHORIZED_NUMBERS || '5492664031203,5492664298513').split(',');
const MAX_DELAY_MS = process.env.MAX_DELAY || 10000;
const WISPHUB_API = process.env.WISPHUB_API || 'https://wisphub.net/api';
const PORT = process.env.PORT || 5000;



// ================================================== //
//               FUNCIÓN DE FORMATO CRÍTICA           //
// ================================================== //
const formatNumber = (number) => {
    // Limpiar y normalizar el número
    let cleaned = number.replace(/[^\d+]/g, '')
                        .replace(/^\+/, '')  // Eliminar el + inicial si existe
                        .replace(/^0+/, ''); // Eliminar ceros iniciales
    
    // Agregar prefijo 54 si es necesario
    if (!cleaned.startsWith('54')) cleaned = `54${cleaned}`;
    
    // Asegurar el 9 después del código de país
    if (cleaned.startsWith('54') && !cleaned.startsWith('549')) {
        cleaned = `549${cleaned.slice(2)}`;
    }
    
    // Validación final
    if (cleaned.length < 10) throw new Error('Número inválido');
    if (!cleaned.match(/^549\d{8,}$/)) throw new Error('Formato incorrecto');
    
    return cleaned;
};

let failedMessages = 0;

// ================================================== //
//               CONFIGURACIÓN WHATSAPP               //
// ================================================== //
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'sessions'),
        storeTimeout: 60000
    }),
    puppeteer: {
        executablePath: puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--single-process',
            '--no-zygote',
            '--aggressive-cache-discard',
            '--disk-cache-size=50000000'
        ],
        headless: true,
        timeout: 60000
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// ================================================== //
//               FUNCIONES WISPHUB API                //
// ================================================== //
const getWisphubClients = async () => {
    try {
        const response = await fetch(`${WISPHUB_API}/clients`, {
            headers: { 
                'Authorization': `Bearer ${process.env.WISPHUB_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000
        });
        
        if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
        
        return (await response.json()).map(client => ({
            number: client.phone.replace(/\+/g, ''),
            name: client.name,
            status: client.status
        }));
        
    } catch (error) {
        console.error('Error obteniendo clientes:', error.message);
        return [];
    }
};

// ================================================== //
//               MANEJO DE COMANDOS WHATSAPP         //
// ================================================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        // Verificar autorización
        if (!AUTHORIZED_NUMBERS.includes(sender)) {
            console.log(`🚫 Acceso denegado a ${sender}`);
            return msg.reply('❌ No estás autorizado para usar este bot');
        }

        // Solo procesar comandos que empiecen con !enviar:
        if (!body.startsWith('!enviar:')) return;

        // Extraer contenido después de !enviar:
        const contenido = body.split('!enviar:')[1].trim();
        
        // Obtener lista de clientes
        const clientes = await getWisphubClients();
        const numeros = [...new Set([
            ...clientes.map(c => c.number),
            ...AUTHORIZED_NUMBERS
        ])];

        // Determinar tipo de contenido
        const esComandoEspecial = contenido.startsWith('!');

        // Preparar mensajes
        const mensajes = numeros.map(number => ({
            number,
            content: contenido,
            esComando: esComandoEspecial
        }));

        // Enviar con delay
        await sendMessagesWithDelay(mensajes);
        
        await msg.reply(`✅ Envío completado a ${numeros.length} contactos`);

    } catch (error) {
        console.error('Error procesando mensaje:', error.message);
        await msg.reply(`❌ Error: ${error.message}`);
    }
});

// ================================================== //
//               SISTEMA DE ENVÍOS MEJORADO          //
// ================================================== //
const sendMessagesWithDelay = async (messages) => {
    failedMessages = 0;
    const totalMessages = messages.length;
    
    const processMessage = async ({ number, content, esComando }) => {
        try {
            if (esComando) {
                await processCommand(number, content);
            } else {
                await client.sendMessage(`${number}@c.us`, content);
            }
            console.log(`✓ Enviado a ${number}`);
        } catch (error) {
            console.error(`✗ Error con ${number}: ${error.message}`);
            failedMessages++;
        }
    };

    if (totalMessages <= 3) {
        console.log('\n=== ENVÍO RÁPIDO ===');
        for (const msg of messages) {
            await processMessage(msg);
        }
        return;
    }

    console.log('\n=== ENVÍO CON DELAY PROGRESIVO ===');
    const delayIncrement = MAX_DELAY_MS / (totalMessages - 1);
    
    for (let i = 0; i < totalMessages; i++) {
        await processMessage(messages[i]);
        
        if (i < totalMessages - 1) {
            const currentDelay = Math.min(delayIncrement * (i + 1), MAX_DELAY_MS);
            console.log(`⏳ Esperando ${(currentDelay / 1000).toFixed(1)}s`);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
    }
};

// ================================================== //
//               COMANDOS ESPECIALIZADOS             //
// ================================================== //
const processCommand = async (number, rawCommand) => {
    try {
        const command = rawCommand.trim();
        if (!command.startsWith('!')) return;
        
        const [comando, ...args] = command.slice(1).split(':');
        
        switch(comando.toLowerCase()) {
            case 'tormenta':
                await sendAlert(
                    number, 
                    'tormenta.jpg', 
                    '*Aviso Importante de PuntoNet*\n\nEstimados clientes,\n\nDebido a la presencia de descargas atmosféricas, les recomendamos desconectar sus equipos de internet para evitar posibles daños.\n\nSaludos,\n*Equipo PuntoNet*'
                );
                break;
                
            case 'cambios':
                await sendAlert(
                    number, 
                    '2025.jpg', 
                    '¡Feliz Año Nuevo! 🎆\nComienza el 2025 conectado con PuntoNet.\n\nNuevas velocidades disponibles desde el 01/01.'
                );
                break;
                
            case 'enviar':
                if (!args[0]) throw new Error('Formato: !enviar:mensaje');
                await handleEnvioMasivo(number, args[0]);
                break;
                
            case 'help':
                await client.sendMessage(`${number}@c.us`, 
                    '📋 *Comandos disponibles:*\n' +
                    '!tormenta - Envía alerta meteorológica\n' +
                    '!cambios - Muestra novedades del servicio\n' +
                    '!enviar:mensaje - Envío masivo\n' +
                    '!help - Muestra esta ayuda'
                );
                break;
                
            default:
                throw new Error(`Comando no reconocido: ${comando}`);
        }
        
    } catch (error) {
        throw new Error(`Falló el comando: ${error.message}`);
    }
};

// ================================================== //
//               FUNCIONES DE ALERTAS                //
// ================================================== //
const sendAlert = async (number, imageName, message) => {
    const imagePath = path.join(__dirname, 'imagenes', imageName);
    try {
        if (!fs.existsSync(imagePath)) throw new Error('Recurso no encontrado');
        
        const media = MessageMedia.fromFilePath(imagePath);
        await client.sendMessage(`${number}@c.us`, media, { 
            caption: message,
            sendMediaAsDocument: true
        });
        console.log(`⚡ Alerta enviada a ${number}`);
    } catch (error) {
        console.error(`⚠ Fallo en alerta a ${number}: ${error.message}`);
        await client.sendMessage(`${number}@c.us`, message);
    }
};

// ================================================== //
//               MANEJO DE ENVÍOS MASIVOS            //
// ================================================== //
const handleEnvioMasivo = async (senderNumber, mensaje) => {
    try {
        const recipients = await getWisphubClients();
        if (!recipients.length) throw new Error('No hay destinatarios disponibles');
        
        // Aplicar formato especial a los números
        const numbers = recipients.map(c => {
            try {
                return formatNumber(c.number);
            } catch (error) {
                console.error(`Número inválido: ${c.number}`, error.message);
                return null;
            }
        }).filter(n => n !== null);

        // Eliminar duplicados y agregar números autorizados
        const numerosUnicos = [...new Set([...numbers, ...AUTHORIZED_NUMBERS])];

        console.log(`\n📤 Envío masivo desde ${senderNumber} a ${numerosUnicos.length} contactos`);
        
        await sendMessagesWithDelay(numerosUnicos.map(number => ({ 
            number, 
            content: `🔔 Notificación PuntoNet:\n${mensaje}` 
        })));

        await client.sendMessage(`${senderNumber}@c.us`, 
            `✅ Envío completado\n• Enviados: ${numerosUnicos.length - failedMessages}\n• Fallidos: ${failedMessages}`
        );
    } catch (error) {
        throw new Error(error.message);
    }
};
// ================================================== //
//               CONFIGURACIÓN SERVIDOR              //
// ================================================== //
const app = express();

// Configuración mejorada del body-parser
app.use(bodyParser.json()); // Para application/json
app.use(bodyParser.urlencoded({ extended: true })); // Para application/x-www-form-urlencoded

// Middleware para verificar errores de parsing
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud' });
    }
    next();
});

let server;

app.post('/send', async (req, res) => {
    try {
        // Verificación mejorada del cuerpo
        if (!req.body || Object.keys(req.body).length === 0) {
            throw new Error('Cuerpo de solicitud vacío');
        }

        const { to, message } = req.body;
        
        // Validación mejorada
        if (!to || !message) {
            throw new Error('Formato requerido: { "to": "número", "message": "texto o comando" }');
        }
        
        const formattedNumber = formatNumber(to);
        
        // Determinar si es comando o mensaje normal
        if (message.startsWith('!')) {
            await processCommand(formattedNumber, message);
        } else {
            await client.sendMessage(`${formattedNumber}@c.us`, message);
        }
        
        res.json({ 
            success: true,
            number: formattedNumber,
            message: 'Mensaje procesado'
        });
        
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        });
    }
});

// ================================================== //
//               MANEJO DE CIERRE LIMPIO             //
// ================================================== //
const gracefulShutdown = async () => {
    console.log('\n🔌 Iniciando apagado seguro...');
    try {
        await client.destroy();
        console.log('✅ Cliente de WhatsApp cerrado');
        
        if (server) {
            server.close(() => console.log('🚪 Servidor HTTP detenido'));
        }
        
        setTimeout(() => process.exit(0), 5000);
    } catch (error) {
        console.error('⚠ Error en el cierre:', error);
        process.exit(1);
    }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// ================================================== //
//               INICIALIZACIÓN                      //
// ================================================== //
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🚀 Bot autenticado y listo'));
client.on('disconnected', reason => console.log('🔌 Desconectado:', reason));

const startServer = async () => {
    try {
        await client.initialize();
        server = app.listen(PORT, () => {
            console.log(`🌐 Servidor activo en puerto ${PORT}`);
        });
    } catch (error) {
        console.error('⚠ Error fatal:', error);
        process.exit(1);
    }
};

startServer();