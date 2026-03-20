# 🏨 SmartStay Hotel Demo v2

## Estructura
```
smartstay-demo/
├── server.js
├── package.json
└── public/
    ├── client.html   ← Tablet del cliente (read-only)
    └── control.html  ← Celular del operador
```

## Lo nuevo en v2
- 4 bloques (Alas A/B/C/D) con 5 habitaciones cada uno
- Dashboard: vista de bloques → click → detalle por ala
- Panel de ahorro energético prominente en página principal
- HVAC + Luces se apagan juntos al salir el huésped
- BI con filtros por habitación, ala, empleado y fecha
- Exportación en CSV, Excel (.xls) y PDF
- Resumen ejecutivo diario a las 11 PM (SendGrid)
- Botón "Enviar Resumen" manual en /control

## Deploy en Railway
1. Subir a GitHub
2. Railway → New Project → Deploy from GitHub
3. Generar dominio en Settings → Networking
4. URLs: /client (tablet) y /control (celular)

## Variables de entorno (producción)
```
SENDGRID_API_KEY=tu_clave
EMAIL_GM=gerente@hotel.com
EMAIL_OPS=operaciones@hotel.com
EMAIL_FIN=finanzas@hotel.com
WA_TOKEN=tu_token_whatsapp
WA_PHONE_ID=tu_phone_id
```

## Correr localmente
```bash
npm install
npm start
# http://localhost:3000/client
# http://localhost:3000/control
```
