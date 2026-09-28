# Mis Finanzas 💸

App de finanzas personales con pipeline de transacciones por IA. Los correos de notificación del banco se parsean automáticamente, los analiza Gemini y quedan registrados en Firebase — cero entrada manual.

![Stack](https://img.shields.io/badge/React_19-Vite-blue) ![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange) ![Gemini](https://img.shields.io/badge/AI-Gemini_Flash-green) ![Python](https://img.shields.io/badge/Python-3.12-blue)

> Fork de [mrjunos/mis-finanzas](https://github.com/mrjunos/mis-finanzas), montado sobre el proyecto Firebase `mis-finanzas-6ed8d`.
> App en producción: **https://mis-finanzas-6ed8d.web.app**

---

## Cómo funciona

```
Gmail (correos del banco, etiqueta Bancos/PendingBot)
      ↓  [Gmail API — cron de GitHub Actions 3 veces al día]
Parser de correo (BeautifulSoup)
      ↓
Gemini (gemini-3.1-flash-lite) → JSON estructurado
      ↓
Firestore  →  Dashboard React (web / PWA en el celular)
      ↓
Push notification: "nuevo movimiento por revisar"
```

### Funcionalidades

- **Registro automático**: los correos del banco se convierten en movimientos (pendientes de revisión) con categoría, subcategoría, producto y contexto. Una memoria de comercios corrige la clasificación con tu historial.
- **Registro manual**: gastos, ingresos y transferencias entre tus productos desde el botón +.
- **Radiografía**: pulso de los últimos 30 días, racha de registro, comparativos con el mes anterior, gasto por categoría (con mapa de calor diario) y avisos inteligentes.
- **Movimientos**: lista con filtros (fechas, categoría, cuenta, monto, tipo, pendientes), evolución de saldo por moneda y análisis por categoría/cuenta.
- **Productos financieros** (Yo → Finanzas → Productos): cuentas de ahorros (una principal), cuentas de bajo monto, tarjetas de crédito (varias) y efectivo. Para cada producto se configura cómo lo reconoce Gemini: banco, últimos 4 dígitos, remitentes y una instrucción libre ("Cómo reconocerlo").
  - Tarjeta de crédito: solo salidas; un pago recibido por la tarjeta se guarda como transferencia desde tu cuenta.
  - Efectivo: un retiro de cajero se guarda como transferencia de la cuenta hacia Efectivo; los gastos en efectivo se registran a mano.
- **Correos del banco** (Yo → Finanzas): lista de remitentes (dirección o dominio) que el sync busca en Gmail, con asuntos a ignorar, fecha de inicio y la etiqueta de Gmail como opción adicional. Muestra el estado de la última sincronización.
- **Cuentas → Total**: historial de ingresos y egresos mensual (por defecto), trimestral, semestral o anual, sin discriminar producto.
- **Cuentas → Por producto**: el mismo historial para cada cuenta o tarjeta (incluye las transferencias entre tus productos).
- **Cuentas → 4x1000**: tope exento del mes por cuenta de ahorros o de bajo monto marcada como exenta, cuánto has movido, cuánto te queda, proyección a fin de mes y 4x1000 estimado de las cuentas sin exención.
- **Alertas del 4x1000**: push configurable por producto (por defecto al 80% y 95%, y siempre al superar el 100%), además del aviso en Radiografía.
- **Presupuestos y metas**: límites por categoría con ritmo del mes, metas de ahorro vinculadas a una cuenta y flujo por periodo libre.
- **Notificaciones push** de movimientos pendientes (deep link a la edición).

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite, Tailwind CSS |
| Auth y DB | Firebase Auth (Google) + Firestore, whitelist de emails |
| IA | Google Gemini API (`gemini-3.1-flash-lite`) |
| Pipeline de correos | Python 3.12, Gmail API, BeautifulSoup |
| Automatización | GitHub Actions (cron 12:40 pm, 6:40 pm y 10:40 pm + deploy a Hosting en cada push a `main`) |

---

## Guía de montaje completa

Todos los pasos que se hicieron para levantar esta instancia desde cero, con los problemas reales que aparecieron y su solución. Sirve como receta para reconstruirla o montar otra.

### 1. Proyecto Firebase

1. Crear proyecto en [console.firebase.google.com](https://console.firebase.google.com) (aquí: `mis-finanzas-6ed8d`).
2. Habilitar **Authentication** → proveedor **Google**.
3. Registrar una **app web** (ícono `</>` en la portada del proyecto) y copiar el `firebaseConfig`.
4. Pegar el config en **dos** archivos: `src/firebase.js` y `public/firebase-messaging-sw.js` (el service worker lo duplica).
5. Actualizar `.firebaserc` (project id) y, si se parte del repo original, simplificar `firebase.json` a un solo sitio de hosting y `deploy.yml` a un solo paso de deploy.
6. No hace falta crear la base de Firestore a mano: el primer `firebase deploy --only firestore:rules` la crea.

> La API key web (`AIza...`) es pública por diseño — viaja en el bundle del navegador. La seguridad real está en las reglas de Firestore. Si GitHub abre una alerta de secret scanning por ella, se cierra como falso positivo.

### 2. CLI de Firebase y reglas

```bash
npm install -g firebase-tools
firebase login                    # cuenta dueña del proyecto
firebase deploy --only firestore:rules
```

- `firebase login` necesita terminal interactiva.
- Con varias cuentas en la máquina, `firebase login:use <email>` fija la cuenta para esta carpeta.

### 3. Frontend local y primer login

```bash
npm install
npm run dev                       # http://localhost:5173
```

El primer usuario que inicia sesión queda como admin: se crea el doc `finance_settings/users` con su email (`allowedEmails`). Desde entonces las reglas solo dejan pasar a los emails de esa lista.

**Gotcha**: si el login da "Error de servidor verificando permisos", casi seguro las reglas no están desplegadas (o la DB no existe) — volver al paso 2.

### 4. Restricción de la API key (recomendado)

En [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials) → la Browser key → **Restricciones de aplicaciones → Sitios web**, agregar:

```
localhost:5173
mis-finanzas-6ed8d.web.app/*
mis-finanzas-6ed8d.firebaseapp.com/*
```

**Gotcha importante**: el popup del login de Google corre en `*.firebaseapp.com` — si ese dominio falta, el login falla con *"The requested action is invalid"* aunque la app cargue bien. La propagación tarda unos minutos.

### 5. Pipeline de Gmail (correo → Gemini → Firestore)

Credenciales necesarias (una vez):

1. **Gmail API**: habilitarla en [Google Cloud](https://console.cloud.google.com/apis/library/gmail.googleapis.com) (mismo proyecto).
2. **OAuth Client** tipo *Desktop App* → descargar como `credentials.json` en la raíz del repo (queda gitignorado). **La pantalla de consentimiento debe publicarse "In production"** — en modo Testing, Google mata el refresh token a los 7 días y el sync se rompe en silencio.
3. **API key de Gemini**: [AI Studio](https://aistudio.google.com/apikey). Las keys nuevas con formato `AQ.…` funcionan igual que las `AIza…`.
4. **Clave del Admin SDK**: Firebase Console → Configuración → Cuentas de servicio → generar clave privada → guardar el JSON en la raíz (gitignorado; `utils.py` encuentra cualquier `*firebase-adminsdk*.json`).

Secrets en GitHub (con `gh` autenticado en la cuenta dueña del fork):

```bash
gh secret set GEMINI_API_KEY                                  # pegar la key
gh secret set FIREBASE_ADMIN_SDK_JSON     < *firebase-adminsdk*.json
gh secret set GMAIL_CREDENTIALS_JSON      < credentials.json
```

Token de Gmail (abre el navegador; autorizar con **la cuenta donde llegan los correos del banco**):

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python bootstrap_token.py       # sube el token a Firestore (gmail_auth/token)
```

Qué correos se leen — en la app, Yo → Finanzas → **Correos del banco**: agregar la dirección (o el dominio) desde la que el banco envía las alertas. Copiarla de un correo real del banco. El sync busca `from:(…) after:<corte>` en cada corrida.

Opcional, como respaldo (esa misma cuenta de Gmail — las etiquetas son por cuenta):

- Crear la etiqueta anidada **`Bancos/PendingBot`** y un filtro "remitente del banco → aplicar esa etiqueta". Sin remitentes configurados, la etiqueta es la única fuente (comportamiento original).

Probar de una vez, sin esperar al cron:

```bash
gh workflow run gmail_sync.yml            # disparo manual
gh run watch                              # ver el resultado
```

**Gotchas**: en un **fork**, GitHub deja los workflows programados en estado `disabled_fork` — el cron nunca corre hasta habilitarlo (`gh workflow enable gmail_sync.yml`), aunque los disparos manuales sí funcionen y enmascaren el problema; el cron corre a las 12:40 pm, 6:40 pm y 10:40 pm (hora Colombia) pero GitHub puede atrasarlo; para no esperar, `gh workflow run gmail_sync.yml`; GitHub desactiva los crons tras 60 días sin commits (avisa por correo, se reactiva con un clic); si sale `invalid_grant`, re-ejecutar `bootstrap_token.py`. Verificar el estado real con `gh api repos/<owner>/<repo>/actions/workflows --jq '.workflows[] | "\(.name): \(.state)"'`.

### 6. Hosting y deploy automático

```bash
npm run build && firebase deploy --only hosting   # deploy manual
```

Para el deploy automático (cada push a `main` corre lint + tests + build + deploy):

```bash
gh secret set FIREBASE_SERVICE_ACCOUNT_MIS_FINANZAS < *firebase-adminsdk*.json
```

La app queda en `https://<proyecto>.web.app` y `https://<proyecto>.firebaseapp.com` (dos alias del mismo sitio).

### 7. Notificaciones push

1. Firebase Console → Cloud Messaging → **Web Push certificates** → generar par de claves (VAPID).
2. Localmente: `.env` con `VITE_FCM_VAPID_KEY=<clave>` (gitignorado). En CI: `gh secret set VITE_FCM_VAPID_KEY`.
3. Rebuild + deploy.
4. En el teléfono: abrir la app → Ajustes → Notificaciones → Activar.

**Gotcha iPhone**: iOS solo permite push web desde la app **instalada como PWA** (Safari → Compartir → *Agregar a pantalla de inicio*, y abrirla desde ese ícono; requiere iOS 16.4+). En Safari normal el registro falla sin error visible.

Prueba end-to-end:

```bash
.venv/bin/python send_test_push.py            # crea tx de prueba + push real
.venv/bin/python send_test_push.py --cleanup  # borra la tx de prueba
```

---

## Feature flags

`src/config/features.js` — módulos ocultos de la UI sin borrar su implementación:

| Flag | Estado | Qué oculta |
|------|--------|-----------|
| `business` | `false` | Contexto "Negocio": switcher Personal/General/Negocio, opción en el modal de transacción y en categorías. La app opera fija en `personal`. |
| `health` | `false` | Dominio "Salud": tarjeta del inicio, ítem del sidebar y pestaña de Ajustes. |

Cambiar a `true` restaura el módulo completo. Ojo: con `business: false`, una transacción que Gemini clasifique como `business` no se muestra (el dato queda guardado).

---

## 4x1000 (GMF)

- **Solo cuentas de ahorros y de bajo monto**: efectivo y tarjetas de crédito no tienen tope propio; lo que cuenta es la plata que sale de la cuenta hacia ellos (retiro de cajero, pago de tarjeta).
- **Tope**: cuenta de ahorros 350 UVT al mes (art. 879 num. 1 del E.T.; una exenta por persona) y depósito de bajo monto 65 UVT al mes (num. 25; una exenta por entidad). La UVT oficial por año está en `UVT_BY_YEAR` de `accountHelpers.js` y `gmf.py` (2026: $52.374, Resolución DIAN 000238 de 2025 → topes $18.330.900 y $3.404.310). No hay una API oficial de la DIAN para consultarla; cuando salga la UVT de un año nuevo, se fija en Yo → Finanzas → 4x1000 · UVT (y conviene actualizar las dos tablas). Cada cuenta también admite un tope manual.
- **Qué suma**: compras, retiros y transferencias que salen de la cuenta en el mes calendario, en COP. Es una estimación: el banco puede excluir algunos movimientos.
- **Alertas**: el cron del sync (3 veces al día) revisa las cuentas exentas con avisos activos y envía una push por cada umbral nuevo cruzado en el mes. Lo ya notificado queda en `gmf_alerts/{producto}_{YYYY-MM}`, así que no se repite.
- **Datos**: los productos viven en `finance_settings/default.products` (tipo, principal, banco, últimos 4, remitentes, pistas, config GMF); `accounts` se mantiene como la lista de nombres que usa el resto del código. Renombrar un producto re-apunta sus movimientos y metas al nombre nuevo.

## Cómo se asigna cada correo a un producto

1. **Qué correos**: `finance_settings/default.emailSources` (remitentes) + `emailSync` (fecha de inicio, usar etiqueta). El corte de búsqueda es la última corrida exitosa − 2 días; lo repetido se descarta con `processed_gmail_ids`. El estado de cada corrida queda en `sync_status/latest`.
2. **Gemini** recibe remitente, asunto y cuerpo del correo, y el catálogo de productos con sus pistas.
3. **Corrección determinista** (`tx_enrich.resolve_product`): los productos del remitente son los candidatos; entre ellos, los últimos 4 dígitos desempatan. Retiros → transferencia a Efectivo; Efectivo nunca es origen de un correo; un ingreso a una tarjeta de crédito es un pago desde la cuenta principal.
4. Todo queda **pendiente de revisión** en la app, donde se corrige a mano si hace falta.

---

## Modelo de seguridad

- **Whitelist server-side** (`firestore.rules`): solo los emails en `finance_settings/users` leen/escriben datos. El doc de whitelist solo lo leen sus miembros (los demás reciben `permission-denied`) y solo el email del dueño puede recrearlo si no existe.
- `gmail_auth/` y `processed_gmail_ids/` son ilegibles desde el cliente; solo el Admin SDK del backend los toca.
- API key restringida por dominio (paso 4).
- Credenciales locales (`credentials.json`, `token.json`, `.env`, `*firebase-adminsdk*.json`) gitignoradas — verificar con `git ls-files` que nunca se versionen.

---

## Mantenimiento

```bash
gh run list --workflow=gmail_sync.yml     # estado del cron
gh run view <id> --log-failed             # depurar una corrida fallida
```

- Reprocesar un correo: borrar su doc en `processed_gmail_ids` y re-aplicar la etiqueta en Gmail.
- Traer mejoras del repo original: `git fetch upstream && git merge upstream/main` (el remote `upstream` ya está configurado). Los archivos con config propia (`src/firebase.js`, `firebase.json`, `deploy.yml`, `.firebaserc`) pueden dar conflicto — resolver conservando la config de este fork.

---

## Estructura

```
├── src/                      # Frontend React
│   ├── domains/              # finance / health / tasks / habits
│   ├── config/features.js    # Feature flags de visibilidad
│   ├── context/AuthContext   # Login Google + whitelist
│   └── firebase.js           # Config de Firebase (pública)
├── gmail_finanzas_sync.py    # Pipeline: Gmail → Gemini → Firestore (+ alertas 4x1000)
├── tx_enrich.py              # Correcciones deterministas (memoria de comercios, producto por últimos 4)
├── gmf.py                    # Productos y alertas del 4x1000
├── email_query.py            # Qué correos se leen (remitentes + etiqueta)
├── bootstrap_token.py        # Una vez: sembrar/renovar el token de Gmail
├── send_test_push.py         # Prueba end-to-end de notificaciones
├── firestore.rules           # Reglas de seguridad (whitelist)
└── .github/workflows/        # gmail_sync.yml (cron) + deploy.yml (hosting)
```
