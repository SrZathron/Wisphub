const puppeteer = require('puppeteer');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
const https = require('https');
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
    let cleaned = number.replace(/[^\d+]/g, '')
                        .replace(/^\+/, '')
                        .replace(/^0+/, '');
    
    if (!cleaned.startsWith('54')) cleaned = `54${cleaned}`;
    
    if (cleaned.startsWith('54') && !cleaned.startsWith('549')) {
        cleaned = `549${cleaned.slice(2)}`;
    }
    
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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
            '--disable-gpu',
            '--disable-accelerated-2d-canvas',
            '--disable-software-rasterizer',
            '--disable-features=site-per-process,TranslateUI',
            '--window-size=800,600'
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
        const response = await fetch(`${WISPHUB_API}/clientes/activos`, {
            headers: { 
                'X-API-Key': process.env.WISPHUB_API_KEY
            },
            timeout: 5000
        });
        
        if (!response.ok) throw new Error(`Error ${response.status}: ${await response.text()}`);
        
        const data = await response.json();
        
        return data.data.map(client => ({
            number: client.telefono_movil.replace(/\+/g, ''),
            name: client.nombre_completo,
            status: client.estado_servicio
        }));
        
    } catch (error) {
        console.error('Error obteniendo clientes:', error.message);
        return [];
    }
};

// ================================================== //
//               MANEJO DE COMANDOS WHATSAPP          //
// ================================================== //
client.on('message', async msg => {
    try {
        const sender = msg.from.split('@')[0];
        const body = msg.body.trim();

        if (!AUTHORIZED_NUMBERS.includes(sender)) {
            console.log(`🚫 Acceso denegado a ${sender}`);
            return;
        }

        if (!body.startsWith('!enviar:')) return;

        const contenido = body.split('!enviar:')[1].trim();
        
        const clientes = await getWisphubClients();
        const numeros = [...new Set([
            ...clientes.map(c => c.number),
            ...AUTHORIZED_NUMBERS
        ])];

        const esComandoEspecial = contenido.startsWith('!');

        const mensajes = numeros.map(number => ({
            number,
            content: contenido,
            esComando: esComandoEspecial
        }));

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
//               COMANDOS ESPECIALIZADOS (MODIFICADO) //
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

            // NUEVO COMANDO AÑADIDO
            case 'clientes':
                const clientes = await getWisphubClients();
                if (clientes.length === 0) {
                    await client.sendMessage(`${number}@c.us`, '❌ No se encontraron clientes activos');
                    return;
                }
                
                const lista = clientes
                    .map((cliente, index) => 
                        `Cliente ${index + 1}: ${cliente.name} - ${cliente.number}`
                    )
                    .join('\n');
                
                await client.sendMessage(
                    `${number}@c.us`,
                    `📋 *Clientes activos (${clientes.length})*\n\n${lista}`
                );
                break;
                
            case 'help':
                await client.sendMessage(`${number}@c.us`, 
                    '📋 *Comandos disponibles:*\n' +
                    '!tormenta - Alerta meteorológica\n' +
                    '!cambios - Novedades del servicio\n' +
                    '!enviar:mensaje - Envío masivo\n' +
                    '!clientes - Lista de clientes activos\n' + // LÍNEA AÑADIDA
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
        
        const numbers = recipients.map(c => {
            try {
                return formatNumber(c.number);
            } catch (error) {
                console.error(`Número inválido: ${c.number}`, error.message);
                return null;
            }
        }).filter(n => n !== null);

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud' });
    }
    next();
});

// ================================================== //
//               CONFIGURACIÓN HTTPS                 //
// ================================================== //
const httpsOptions = {
    key: fs.readFileSync('/home/server/Wisphub/ssl/private.key'),
    cert: fs.readFileSync('/home/server/Wisphub/ssl/certificate.crt'),
    // Comentar esta línea si no usas CA bundle
    // ca: fs.readFileSync('/home/server/Wisphub/ssl/ca_bundle.crt')
};

// ================================================== //
//               MANEJO DE CIERRE LIMPIO             //
// ================================================== //
const gracefulShutdown = async () => {
    console.log('\n🔌 Iniciando apagado seguro...');
    
    try {
        // 1. Cerrar cliente de WhatsApp primero
        if (client.pupBrowser) {
            await client.pupBrowser.close();
            console.log('✅ Navegador Chromium cerrado');
        }
        
        // 2. Cerrar conexión WebSocket
        await client.destroy();
        console.log('✅ Cliente de WhatsApp cerrado');
        
        // 3. Detener servidor HTTP/HTTPS
        if (server) {
            server.close(() => {
                console.log('🚪 Servidor HTTP detenido');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
        
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
client.on('qr', qr => {
    console.log('⚠️ ESCANEA ESTE QR EN WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('✅ Autenticación exitosa');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Fallo autenticación:', msg);
});

client.on('ready', () => {
    console.log('🚀 Bot listo para operar');
    console.log('📡 Estado servidor:', server ? 'Activo' : 'Inactivo');
});

const startServer = async () => {
    try {
        await client.initialize();
        
        // Esperar 5 segundos antes de iniciar el servidor
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const server = https.createServer(httpsOptions, app)
            .listen(PORT, '0.0.0.0', () => {
                console.log(`🔒 Servidor HTTPS activo en puerto ${PORT}`);
            })
            .on('error', (err) => {
                console.error('⚠ Error al iniciar servidor:', err);
                process.exit(1);
            });
            
    } catch (error) {
        console.error('⚠ Error fatal:', error);
        process.exit(1);
    }
};

startServer();