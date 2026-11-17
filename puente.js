const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { execSync, exec } = require('child_process');

// Estilos ANSI para consola
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

// Historial y métricas en memoria para el panel
const trafficLogs = [];
let totalRequests = 0;

// Estado del puente
const PUERTO_PUENTE = 4000;
let puenteConfig = {
    configured: false,
    targetPort: null,
    ipLocal: '127.0.0.1',
    todasInterfaces: [],
    wifiSSID: '',
    wifiPass: '',
    qrProject: '',
    qrWifi: ''
};

// Obtener todas las interfaces IPv4 activas
function obtenerInterfacesRed() {
    const interfaces = os.networkInterfaces();
    const resultados = [];
    for (const nombre in interfaces) {
        for (const red of interfaces[nombre]) {
            if (red.family === 'IPv4' && !red.internal) {
                resultados.push({
                    name: nombre,
                    address: red.address
                });
            }
        }
    }
    return resultados;
}

// Seleccionar la mejor IP (prioriza interfaces Wi-Fi o Ethernet sobre Bluetooth/virtuales)
function seleccionarMejorIp(interfaces) {
    if (!interfaces || interfaces.length === 0) return '127.0.0.1';

    const preferidas = interfaces.find(i => 
        /wi-?fi|wlan|wireless|ethernet|eth|en0/i.test(i.name) && 
        !/bluetooth|virtual|vEthernet|vmnet|loopback/i.test(i.name) &&
        !i.address.startsWith('169.254.')
    );
    if (preferidas) return preferidas.address;

    const noAutoconf = interfaces.find(i => 
        !i.address.startsWith('169.254.') && 
        !/bluetooth/i.test(i.name)
    );
    if (noAutoconf) return noAutoconf.address;

    return interfaces[0].address;
}

// Intentar detectar el SSID de Wi-Fi en Windows
function detectarWifiWindows() {
    try {
        const out = execSync('netsh wlan show interfaces', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/^\s*SSID\s*:\s*(.+)$/m);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch (e) {}
    return null;
}

// Formato QR Wi-Fi
function formatoWifiString(ssid, password = '', auth = 'WPA') {
    if (!ssid) return '';
    if (!password) {
        return `WIFI:T:nopass;S:${ssid};;`;
    }
    return `WIFI:T:${auth};S:${ssid};P:${password};;`;
}

// Abrir el navegador automáticamente en Windows
function abrirNavegador(url) {
    try {
        exec(`start "" "${url}"`);
    } catch (e) {}
}

// Banner ASCII
function imprimirBanner() {
    console.log(colors.cyan + `
    ╔══════════════════════════════════════════════════════════════╗
    ║                                                              ║
    ║        █████╗ ████████╗██╗      █████╗ ███████╗              ║
    ║       ██╔══██╗╚══██╔══╝██║     ██╔══██╗██╔════╝              ║
    ║       ███████║   ██║   ██║     ███████║███████╗              ║
    ║       ██╔══██║   ██║   ██║     ██╔══██║╚════██║              ║
    ║       ██║  ██║   ██║   ███████╗██║  ██║███████║   [P2P LOCAL]║
    ║       ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚══════╝              ║
    ║                                                              ║
    ╠══════════════════════════════════════════════════════════════╣
    ║  > Software: P2P Local Bridge - Professional Edition         ║
    ║  > Startup:  ATLAS Developers                                ║
    ║  > Licencia: Apache 2.0                                      ║
    ║  > Author:   Brian Iván Cruz Delgado                         ║
    ╚══════════════════════════════════════════════════════════════╝
    ` + colors.reset);
}

async function main() {
    imprimirBanner();

    const interfaces = obtenerInterfacesRed();
    const ipSeleccionada = seleccionarMejorIp(interfaces);
    const ssidDetectado = detectarWifiWindows() || '';

    puenteConfig.ipLocal = ipSeleccionada;
    puenteConfig.todasInterfaces = interfaces;
    puenteConfig.wifiSSID = ssidDetectado;

    const app = express();
    app.use(express.json());

    // Middleware de proxy dinámico
    let dynamicProxy = null;

    function actualizarProxy(targetPort) {
        puenteConfig.targetPort = targetPort;
        puenteConfig.configured = true;

        dynamicProxy = createProxyMiddleware({
            target: `http://localhost:${targetPort}`,
            changeOrigin: false,
            ws: true,
            xfwd: true,
            onProxyRes: (proxyRes, req, res) => {
                if (proxyRes.headers['location']) {
                    proxyRes.headers['location'] = proxyRes.headers['location'].replace(
                        `http://localhost:${targetPort}`,
                        `http://${puenteConfig.ipLocal}:${PUERTO_PUENTE}`
                    );
                }
            },
            onError: (err, req, res) => {
                console.error(`\n❌ Error conectando con el proyecto local en puerto ${targetPort}: ${err.message}`);
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                        <div style="font-family: sans-serif; text-align: center; padding: 40px; background: #0b0f19; color: #fff; min-height: 100vh;">
                            <h2 style="color: #ef4444;">⚠️ Error de Conexión en el Puente</h2>
                            <p style="color: #94a3b8;">No se pudo conectar a tu proyecto en <b>http://localhost:${targetPort}</b>.</p>
                            <p style="color: #94a3b8;">Verifica que tu servidor de desarrollo (React, Angular, Spring Boot, etc.) esté encendido y corriendo en ese puerto.</p>
                            <br>
                            <a href="/__bridge/admin" style="display: inline-block; background: #38bdf8; color: #000; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ir al Panel de Control</a>
                        </div>
                    `);
                }
            }
        });
    }

    // Ruta del Panel de Administración
    app.get('/__bridge/admin', (req, res) => {
        const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
        if (fs.existsSync(dashboardPath)) {
            res.sendFile(dashboardPath);
        } else {
            res.send('<h1>Panel no encontrado</h1>');
        }
    });

    // Endpoint de Estado
    app.get('/__bridge/status', (req, res) => {
        const urlProyecto = `http://${puenteConfig.ipLocal}:${PUERTO_PUENTE}`;
        res.json({
            configured: puenteConfig.configured,
            url: urlProyecto,
            adminUrl: `http://${puenteConfig.ipLocal}:${PUERTO_PUENTE}/__bridge/admin`,
            targetPort: puenteConfig.targetPort,
            bridgePort: PUERTO_PUENTE,
            ip: puenteConfig.ipLocal,
            allInterfaces: puenteConfig.todasInterfaces,
            totalRequests,
            wifi: {
                ssid: puenteConfig.wifiSSID,
                hasPassword: Boolean(puenteConfig.wifiPass)
            },
            qrProject: puenteConfig.qrProject,
            qrWifi: puenteConfig.qrWifi,
            recentTraffic: trafficLogs.slice(-50)
        });
    });

    // Endpoint para configurar el puerto desde el navegador
    app.post('/__bridge/configure', async (req, res) => {
        try {
            const { targetPort, wifiSSID, wifiPass } = req.body;
            if (!targetPort) {
                return res.status(400).json({ error: 'Puerto requerido' });
            }

            if (wifiSSID !== undefined) puenteConfig.wifiSSID = wifiSSID;
            if (wifiPass !== undefined) puenteConfig.wifiPass = wifiPass;

            const urlProyecto = `http://${puenteConfig.ipLocal}:${PUERTO_PUENTE}`;
            puenteConfig.qrProject = await QRCode.toDataURL(urlProyecto, { margin: 1, width: 320 });

            const wifiStr = formatoWifiString(puenteConfig.wifiSSID, puenteConfig.wifiPass);
            puenteConfig.qrWifi = wifiStr 
                ? await QRCode.toDataURL(wifiStr, { margin: 1, width: 320 })
                : puenteConfig.qrProject;

            actualizarProxy(targetPort);

            console.log(colors.green + `\n    🚀 ¡PUENTE CONFIGURADO CON ÉXITO!` + colors.reset);
            console.log(colors.cyan  + `    ──────────────────────────────────────────────────────────────` + colors.reset);
            console.log(colors.yellow + `    🌐 ENLACE AL PROYECTO WEB:` + colors.reset + `  ${urlProyecto}`);
            console.log(colors.magenta + `    🎛️  PANEL DE CONTROL:` + colors.reset + `       http://localhost:${PUERTO_PUENTE}/__bridge/admin`);
            console.log(colors.cyan  + `    ──────────────────────────────────────────────────────────────` + colors.reset);

            res.json({
                success: true,
                configured: true,
                url: urlProyecto,
                targetPort: puenteConfig.targetPort,
                bridgePort: PUERTO_PUENTE,
                allInterfaces: puenteConfig.todasInterfaces,
                totalRequests,
                wifi: {
                    ssid: puenteConfig.wifiSSID,
                    hasPassword: Boolean(puenteConfig.wifiPass)
                },
                qrProject: puenteConfig.qrProject,
                qrWifi: puenteConfig.qrWifi
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Actualizar WiFi QR
    app.post('/__bridge/wifi-qr', async (req, res) => {
        try {
            const { ssid, password } = req.body;
            puenteConfig.wifiSSID = ssid;
            puenteConfig.wifiPass = password;
            const newWifiString = formatoWifiString(ssid, password);
            puenteConfig.qrWifi = await QRCode.toDataURL(newWifiString, { margin: 1, width: 320 });
            res.json({ success: true, qrWifi: puenteConfig.qrWifi });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/__bridge/clear-logs', (req, res) => {
        trafficLogs.length = 0;
        res.json({ success: true });
    });

    // Middleware de logs
    app.use((req, res, next) => {
        if (!req.url.startsWith('/__bridge')) {
            totalRequests++;
            const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const clientIp = rawIp.replace('::ffff:', '');
            
            trafficLogs.push({
                time: new Date().toISOString(),
                method: req.method,
                path: req.originalUrl || req.url,
                ip: clientIp,
                userAgent: req.headers['user-agent'] || 'Desconocido'
            });

            if (trafficLogs.length > 200) trafficLogs.shift();
        }
        next();
    });

    // Proxy request handler
    app.use('/', (req, res, next) => {
        if (req.url.startsWith('/__bridge')) {
            return next();
        }

        if (!puenteConfig.configured || !dynamicProxy) {
            // Si aún no se configuró el puerto, redirigir al panel de configuración
            return res.redirect('/__bridge/admin');
        }

        return dynamicProxy(req, res, next);
    });

    // Servidor HTTP con soporte WebSocket
    const server = http.createServer(app);
    server.on('upgrade', (req, socket, head) => {
        if (!req.url.startsWith('/__bridge') && dynamicProxy) {
            dynamicProxy.upgrade(req, socket, head);
        }
    });

    server.listen(PUERTO_PUENTE, '0.0.0.0', () => {
        const localAdminUrl = `http://localhost:${PUERTO_PUENTE}/__bridge/admin`;
        console.log(colors.green + `    ✨ SERVIDOR WEB INICIADO CORRECTAMENTE!` + colors.reset);
        console.log(colors.yellow + `    🌐 Abriendo panel de configuración web en tu navegador:` + colors.reset);
        console.log(`       ${localAdminUrl}\n`);
        console.log(colors.gray + `    [INFO] No necesitas la consola: ingresa tu puerto directamente en la web.` + colors.reset);

        // Abre automáticamente la página web en el navegador del usuario
        abrirNavegador(localAdminUrl);
    });
}

main().catch(err => {
    console.error('Error al inicializar puente:', err);
});
