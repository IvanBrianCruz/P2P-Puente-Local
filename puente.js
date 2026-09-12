const os = require('os');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const readline = require('readline');

function obtenerIpLocal() {
    const interfaces = os.networkInterfaces();
    for (const nombre in interfaces) {
        for (const red of interfaces[nombre]) {
            if (red.family === 'IPv4' && !red.internal) {
                return red.address;
            }
        }
    }
    return '127.0.0.1';
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
   console.log("\x1b[36m%s\x1b[0m", `
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
    ║  > Software: P2P Local Bridge                                ║
    ║  > Startup:  ATLAS Developers                                ║
    ║  > Licencia: Apache 2.0                                      ║
    ║  > Author:   Cruz Delgado Ivan     2026                      ║
    ╚══════════════════════════════════════════════════════════════╝
        `);

rl.question('¿En qué puerto está tu proyecto local? (ej. 8080): ', (puertoAlumno) => {
    
    const app = express();
    const ipLocal = obtenerIpLocal();
    const PUERTO_PUENTE = 4000; 

    app.use('/', createProxyMiddleware({
        target: `http://localhost:${puertoAlumno}`,
        
        // 🔹 CAMBIO CLAVE: Al ponerlo en false, Java sabrá que la petición 
        // viene de tu IP de red y él mismo hará los redirects con tu IP.
        changeOrigin: false, 
        
        ws: true,
        xfwd: true,

        // Por si acaso, mantenemos la red de seguridad en las cabeceras de redirección
        onProxyRes: (proxyRes, req, res) => {
            if (proxyRes.headers['location']) {
                proxyRes.headers['location'] = proxyRes.headers['location'].replace(
                    `http://localhost:${puertoAlumno}`, 
                    `http://${ipLocal}:${PUERTO_PUENTE}`
                );
            }
        },

        onError: (err, req, res) => {
            console.error(`\n❌ Error de conexión con el proyecto Java: ${err.message}`);
        }
    }));

  app.listen(PUERTO_PUENTE, '0.0.0.0', () => {
        console.clear(); // Limpia la consola para que luzca como una app nativa
      console.log("\x1b[36m%s\x1b[0m", `
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
    ║  > Software: P2P Local Bridge                                ║
    ║  > Startup:  ATLAS Developers                                ║
    ║  > Licencia: Apache 2.0                                      ║
    ║  > Author:   Cruz Delgado Ivan     2026                      ║
    ╚══════════════════════════════════════════════════════════════╝
        `);
        console.log("\x1b[32m%s\x1b[0m", `    🚀 ¡PUENTE DEFINITIVO ACTIVADO CON ÉXITO!`);
        console.log("\x1b[33m%s\x1b[0m", `    🌐 URL Pública en la red Wi-Fi: http://${ipLocal}:${PUERTO_PUENTE}`);
        console.log("\x1b[37m%s\x1b[0m", `    ──────────────────────────────────────────────────────────────`);
        console.log("\x1b[90m%s\x1b[0m", `    [INFO] Mantén esta ventana abierta mientras presentas tu proyecto.\n`);
    });
});