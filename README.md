# 🏨 SmartStay Hotel Demo — Guía de Deploy

## Estructura de archivos

```
smartstay-demo/
├── server.js          ← Servidor Node.js + WebSocket
├── package.json
└── public/
    ├── client.html    ← Vista tablet (cliente / gerente)
    └── control.html   ← Vista celular (operador / tú)
```

---

## 🚀 Opción A — Deploy en Railway (recomendado, gratis)

### 1. Preparar el proyecto en GitHub

1. Crea una cuenta en [github.com](https://github.com)
2. Crea un repositorio nuevo llamado `smartstay-demo`
3. Sube los archivos con esta estructura exacta

### 2. Deploy en Railway

1. Ve a [railway.app](https://railway.app) y regístrate con tu cuenta de GitHub
2. Click **"New Project" → "Deploy from GitHub repo"**
3. Selecciona `smartstay-demo`
4. Railway detecta automáticamente Node.js y ejecuta `npm start`
5. Ve a **Settings → Networking → Generate Domain**
6. Obtendrás una URL como: `https://smartstay-demo.up.railway.app`

### 3. URLs de uso

| Vista        | URL                                                    |
|--------------|--------------------------------------------------------|
| 🖥️ Tablet (cliente) | `https://tu-app.up.railway.app/client`         |
| 📱 Celular (control)| `https://tu-app.up.railway.app/control`        |

---

## 🚀 Opción B — Deploy en Render (alternativa)

1. Ve a [render.com](https://render.com) → New Web Service
2. Conecta tu repo de GitHub
3. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
4. Click **Create Web Service**
5. Obtendrás URL similar: `https://smartstay-demo.onrender.com`

> ⚠️ Render en plan gratuito duerme tras 15 min de inactividad.
> Railway es más estable para demos en vivo.

---

## 💻 Opción C — Correr localmente (red WiFi)

```bash
# Instalar dependencias
npm install

# Iniciar servidor
npm start

# El servidor corre en http://localhost:3000
```

Para acceder desde otros dispositivos en la misma red WiFi:

1. Obtén tu IP local:
   - Mac/Linux: `ifconfig | grep "inet "`
   - Windows: `ipconfig`
   - Ejemplo: `192.168.1.45`

2. URLs locales:
   - Tablet: `http://192.168.1.45:3000/client`
   - Celular: `http://192.168.1.45:3000/control`

---

## 📱 WhatsApp Business API — Activación futura

Cuando quieras enviar WhatsApp reales, edita `server.js` y descomenta
el bloque en la función `sendWhatsApp`. Necesitarás:

1. **Meta Business Account** en [business.facebook.com](https://business.facebook.com)
2. Crear una app en [developers.facebook.com](https://developers.facebook.com)
3. Activar **WhatsApp Business API**
4. Obtener tu `Phone Number ID` y `Access Token`
5. En Railway/Render, agregar variables de entorno:
   ```
   WA_TOKEN=tu_token_aqui
   WA_PHONE_ID=tu_phone_id_aqui
   ```
6. Reemplazar en `server.js`:
   ```js
   "https://graph.facebook.com/v19.0/YOUR_PHONE_ID/messages"
   // → 
   `https://graph.facebook.com/v19.0/${process.env.WA_PHONE_ID}/messages`
   
   "Bearer ${process.env.WA_TOKEN}"
   ```

---

## 🎯 Guión de Demo para Pitch

### Setup (antes de entrar)
1. Abre `/client` en la tablet del cliente
2. Abre `/control` en tu celular
3. Verifica que el punto verde "Conectado" aparezca en ambos

### Demo flow
1. **Energía automática** → "Sale huésped" en Hab. 101
   - Cliente ve: HVAC → Idle + Luces → OFF instantáneamente
2. **Regresa huésped** → "Entra huésped" 
   - Todo vuelve al estado anterior automáticamente
3. **Notificación limpieza** → Asignar a María González en Hab. 201
   - Cliente recibe alerta WhatsApp en pantalla
   - Aparece en feed de eventos en vivo
4. **BI en tiempo real** → Ir a tab "Reportes BI"
   - Mostrar el registro en curso
5. **Completar servicio** → "Completado"
   - BI registra duración automáticamente
6. **Exportar reporte** → CSV descargable

---

## 🔑 Notas técnicas

- El servidor mantiene todo el estado en RAM (reinicia con servidor)
- WebSocket reconnecta automáticamente si se pierde conexión
- Funciona en HTTPS (necesario para Railway/Render) y HTTP local
- No requiere base de datos — ideal para demos

