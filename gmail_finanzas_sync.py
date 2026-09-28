import os
import json
import base64
import argparse
import datetime
from bs4 import BeautifulSoup

# Google API
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

# Gemini
from google import genai
from google.genai import types

# Firebase
from firebase_admin import firestore, messaging
from utils import conectar_db
from tx_enrich import (
    build_merchant_memory, memory_for_prompt, apply_merchant_memory,
    validate_classification, looks_like_statement, resolve_product,
)
import gmf
from email_query import (
    search_after, build_sender_query, header, from_address, match_source, excluded_by_subject,
)

# --- CONFIGURACIÓN ---
# Zona horaria de Colombia (UTC-5 fijo; el país no usa horario de verano).
# Offset fijo → no depende de tzdata del sistema, funciona igual en CI y local.
BOGOTA = datetime.timezone(datetime.timedelta(hours=-5))

# Permisos necesarios para leer labels y modificar (quitar) etiquetas
GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.modify']

# Etiqueta por defecto a buscar (se puede sobreescribir con gmailLabel en
# finance_settings/default — editable en la app en Settings → Finanzas — o con
# el flag --label, que tiene prioridad sobre ambos)
DEFAULT_LABEL = "Bancos/PendingBot"

# Modelo de Gemini
GEMINI_MODEL = "gemini-3.1-flash-lite"

# Documento de Firestore donde vive el token de OAuth de Gmail
TOKEN_COLLECTION = 'gmail_auth'
TOKEN_DOC = 'token'

# Colección de Firestore con los IDs de correos ya procesados
PROCESSED_COLLECTION = 'processed_gmail_ids'

# Tamaño máximo de texto del correo enviado al modelo
MAX_BODY_CHARS = 3500

# Tope de correos por corrida (la búsqueda por remitentes es paginada)
MAX_MESSAGES_PER_RUN = 300

# Estado de la última corrida, que la app muestra en Correos del banco
SYNC_STATUS_COLLECTION = 'sync_status'

# Cuántas transacciones recientes traer para construir la memoria de comercios
MEMORY_HISTORY_LIMIT = 400


def _load_token(db):
    """Lee el token de OAuth de Gmail desde Firestore."""
    doc = db.collection(TOKEN_COLLECTION).document(TOKEN_DOC).get()
    return doc.to_dict() if doc.exists else None


def _save_token(db, token_info):
    """Guarda (o actualiza) el token de OAuth de Gmail en Firestore."""
    db.collection(TOKEN_COLLECTION).document(TOKEN_DOC).set(token_info)


def authenticate_gmail(db):
    """Autentica con la API de Gmail usando el token guardado en Firestore.

    El token (con su refresh_token, client_id y client_secret) se siembra una
    sola vez con bootstrap_token.py. Aquí solo se carga y, si está expirado, se
    refresca y se vuelve a guardar en Firestore. No hay flujo interactivo: este
    código corre sin navegador en GitHub Actions.
    """
    token_info = _load_token(db)
    if not token_info:
        raise RuntimeError(
            f"No hay token de Gmail en Firestore ({TOKEN_COLLECTION}/{TOKEN_DOC}). "
            "Ejecuta bootstrap_token.py una vez localmente para inicializarlo."
        )

    creds = Credentials.from_authorized_user_info(token_info, GMAIL_SCOPES)

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            print("🔄 Token expirado. Refrescando...")
            creds.refresh(Request())
            _save_token(db, json.loads(creds.to_json()))
            print("✅ Token refrescado y guardado en Firestore.")
        else:
            raise RuntimeError(
                "El token de Gmail no es válido y no se puede refrescar. "
                "Genera un token.json nuevo localmente y vuelve a ejecutar "
                "bootstrap_token.py."
            )

    return build('gmail', 'v1', credentials=creds)


def is_processed(db, email_id):
    """Indica si un correo ya fue procesado anteriormente."""
    return db.collection(PROCESSED_COLLECTION).document(email_id).get().exists


def save_processed_email(db, email_id):
    """Registra un correo como procesado en Firestore."""
    db.collection(PROCESSED_COLLECTION).document(email_id).set({
        'processedAt': firestore.SERVER_TIMESTAMP
    })


def get_label_id(service, label_name):
    """Busca el ID interno de Gmail correspondiente al nombre de una etiqueta."""
    results = service.users().labels().list(userId='me').execute()
    labels = results.get('labels', [])
    for label in labels:
        if label['name'].lower() == label_name.lower():
            return label['id']
    return None


def extract_email_body(payload):
    """Extrae el texto del cuerpo del correo, limpiando HTML."""
    text_content = ""

    # Función recursiva para buscar la parte de texto
    def get_text_from_parts(parts):
        nonlocal text_content
        for part in parts:
            mime_type = part.get("mimeType")
            body = part.get("body", {})
            data = body.get("data")

            if mime_type == "text/plain" and data:
                text_content += base64.urlsafe_b64decode(data).decode("utf-8")
            elif mime_type == "text/html" and data:
                html = base64.urlsafe_b64decode(data).decode("utf-8")
                soup = BeautifulSoup(html, "html.parser")
                text_content += soup.get_text(separator="\n")
            elif "parts" in part:
                get_text_from_parts(part["parts"])

    if "parts" in payload:
        get_text_from_parts(payload["parts"])
    else:
        # El correo podría no ser multipart
        body = payload.get("body", {})
        data = body.get("data")
        mime_type = payload.get("mimeType", "")
        if data:
            decoded = base64.urlsafe_b64decode(data).decode("utf-8")
            if "html" in mime_type:
                soup = BeautifulSoup(decoded, "html.parser")
                text_content = soup.get_text(separator="\n")
            else:
                text_content = decoded

    return text_content.strip()


def _prefetch_context(db):
    """Trae desde Firestore el contexto necesario para el análisis:
    árbol de categorías (con subcategorías), cuentas, monedas y las últimas
    transacciones registradas (para inferir contexto y normalizar subcategoría).
    """
    doc = db.collection('finance_settings').document('default').get()
    categorias_raw, cuentas, monedas, productos = [], [], [], []
    if doc.exists:
        data = doc.to_dict()
        categorias_raw = data.get('categories', [])
        cuentas = data.get('accounts', [])
        monedas = data.get('currencies', [])
        productos = gmf.get_products(data)

    # Normalizar categorías a {name, subcategories}
    cat_tree = []
    for c in categorias_raw:
        if isinstance(c, dict):
            cat_tree.append({
                'name': c.get('name'),
                'subcategories': c.get('subcategories', []),
            })
        else:
            cat_tree.append({'name': c, 'subcategories': []})

    # Historial para la memoria de comercios (ventana amplia: cubre comercios
    # antiguos que no entran en "las últimas 20"). De aquí salen también las
    # recientes que se muestran como muestra en el prompt.
    historial = []
    try:
        docs = db.collection('finance_transactions') \
            .order_by('date', direction=firestore.Query.DESCENDING) \
            .limit(MEMORY_HISTORY_LIMIT).get()
        for d in docs:
            tx = d.to_dict()
            historial.append({
                'title': tx.get('title'),
                'category': tx.get('category'),
                'subcategory': tx.get('subcategory', ''),
                'context': tx.get('context', 'personal'),
                'type': tx.get('type'),
            })
    except Exception as e:
        print(f"⚠️ No se pudo traer el historial: {e}")

    memoria = build_merchant_memory(historial)
    recientes = historial[:20]
    return cat_tree, cuentas, monedas, recientes, memoria, productos


_TIPO_PRODUCTO = {
    'savings': 'cuenta de ahorros',
    'lowvalue': 'cuenta de bajo monto',
    'credit': 'tarjeta de crédito',
    'cash': 'efectivo',
}


def _productos_para_prompt(productos):
    return [
        {k: v for k, v in {
            'nombre': p['name'],
            'tipo': _TIPO_PRODUCTO.get(p['type'], p['type']),
            'principal': p.get('principal') or None,
            'banco': p['bank'],
            'ultimos4': p['last4'],
            'remitentes': p.get('senders') or None,
            'como_reconocerlo': p.get('hints'),
        }.items() if v}
        for p in productos
    ]


def procesar_texto_con_ia(texto, db, client, remitente='', asunto=''):
    """Analiza el correo con Gemini y devuelve la transacción enriquecida.

    En una sola llamada extrae la transacción y la normaliza (categoría,
    subcategoría, producto y contexto), usando como contexto el árbol de
    categorías, los productos con sus pistas y el historial reciente.
    Devuelve (datos, cat_tree).
    """
    print("🧠 Obteniendo contexto desde Firestore...")
    cat_tree, cuentas, monedas, recientes, memoria, productos = _prefetch_context(db)
    nombres_categorias = [c['name'] for c in cat_tree]
    memoria_prompt = memory_for_prompt(memoria)
    principal = gmf.principal_product(productos)
    efectivo = next((p['name'] for p in productos if p['type'] == 'cash'), None)

    prompt = f"""Eres un experto asistente financiero que lee correos de notificaciones bancarias.
Extrae los datos de la transacción descrita en el correo y devuelve ÚNICAMENTE un objeto JSON válido.
Ignora firmas, saludos, publicidad o información legal. Céntrate en la transacción (quién cobró y cuánto).
Si el correo es una notificación de un pago que TÚ hiciste, type = 'debit'.

¡MUY IMPORTANTE! Devuelve únicamente {{"type": "ignore"}} si el correo:
- indica que la transacción "no fue exitosa", fue "Rechazada", "Fallida", "Declinada", etc.; o
- NO es una transacción individual: extractos / estados de cuenta, resúmenes mensuales,
  alertas de saldo o de cupo disponible, códigos OTP, publicidad o avisos de seguridad.

Categorías disponibles (cada una con sus subcategorías válidas):
{json.dumps(cat_tree, ensure_ascii=False, indent=2)}

Productos financieros del usuario. "remitentes" son las direcciones o dominios desde los que llegan
sus correos y "como_reconocerlo" es una instrucción del usuario que debes seguir:
{json.dumps(_productos_para_prompt(productos), ensure_ascii=False, indent=2)}
Monedas disponibles: {monedas}

Cómo identificar el producto y el sentido del dinero:
- Usa el remitente del correo, los últimos 4 dígitos que aparezcan ("terminada en 1234", "*1234") y
  "como_reconocerlo" de cada producto. Si aun así hay duda, usa la cuenta principal ({principal['name'] if principal else 'la primera cuenta de ahorros'}).
- Cuenta de ahorros o de bajo monto: dinero que ENTRA (nómina, transferencia recibida, abono) = 'credit';
  dinero que SALE (compra con débito, pago PSE, transferencia a un tercero) = 'debit'.
- Tarjeta de crédito: SOLO registra salidas. Una compra = 'debit' con card = la tarjeta.
  NUNCA uses 'credit' con una tarjeta de crédito: si el correo dice que la tarjeta RECIBIÓ un pago/abono,
  es 'transfer' con destinationCard = la tarjeta y card = la cuenta desde la que se pagó.
- Retiro en cajero o avance en efectivo: es 'transfer' con card = el producto del que salió la plata y
  destinationCard = {efectivo or 'el producto de efectivo'}.
- El efectivo NUNCA es el card de un correo: los gastos en efectivo el usuario los registra a mano.

Memoria de comercios (clasificación HABITUAL por comercio — úsala como prior fuerte para
categoría, subcategoría y contexto, y para imitar cómo se suele titular cada comercio):
{json.dumps(memoria_prompt, ensure_ascii=False, indent=2)}

Transacciones recientes (muestra adicional para inferir contexto):
{json.dumps(recientes, ensure_ascii=False, indent=2)}

Reglas para los campos:
- type: 'debit' (gasto), 'credit' (ingreso), 'transfer' (movimiento entre productos PROPIOS del
  usuario: pago de tarjeta, retiro a efectivo, mover plata entre sus cuentas) o 'ignore'
  (fallida/declinada o no-transacción).
- El PAGO DE LA TARJETA DE CRÉDITO ("Pago de tarjeta", "Abono a tarjeta") NO es un gasto (las compras
  ya se registraron una a una): card = la cuenta de ORIGEN y destinationCard = la tarjeta.
- destinationCard: SOLO para type 'transfer'; en 'debit'/'credit' devuelve "".
- amount: el monto numérico exacto, positivo y sin símbolos de moneda.
- title: un resumen muy corto del concepto/comercio. Si el comercio aparece en la memoria, titúlalo igual que ahí.
- currency: elige una opción de {monedas}, o 'COP' si el texto usa $, pesos, etc.
- category: elige una opción de {nombres_categorias}. Si no aplica ninguna, usa 'Otros'.
- subcategory: elige una subcategoría VÁLIDA de la categoría que elegiste (ver lista de arriba). Si ninguna aplica o esa categoría no tiene subcategorías, usa "".
- card y destinationCard: el nombre EXACTO de uno de los productos: {cuentas}.
- context: 'personal' o 'business'. Infiérelo del título, el correo y el historial; por defecto 'personal'.
- comments: nota con el DETALLE concreto que aparezca en el correo, no un genérico. Si el correo
  lista productos (p. ej. un domicilio), enuméralos; si es un transporte e incluye origen/destino, ponlos;
  si es una transferencia, indica la contraparte (quién envía o recibe). Si el correo no trae detalle
  específico, resume brevemente la transacción.

Remitente del correo: {remitente or 'desconocido'}
Asunto: {asunto or '(sin asunto)'}
Texto del correo:
"{texto}"

Devuelve solo el JSON, sin explicación ni markdown. Formato esperado:
{{"type": "", "amount": 0, "title": "", "currency": "", "category": "", "subcategory": "", "card": "", "destinationCard": "", "context": "", "comments": ""}}

Si la transacción no fue exitosa o no es una transacción individual, devuelve únicamente:
{{"type": "ignore"}}
"""

    print(f"🧠 Analizando correo con Gemini ({GEMINI_MODEL})...")
    try:
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="Eres un asistente financiero. Respondes únicamente con un objeto JSON válido.",
                response_mime_type="application/json",
                temperature=0,
            ),
        )
        datos_extraidos = json.loads(response.text)
        print("✅ Análisis JSON completado con éxito.")

        # Post-corrección determinista: si el comercio es conocido y consistente,
        # fijamos la clasificación desde la memoria (no toca amount/title/comments).
        datos_extraidos, info = apply_merchant_memory(datos_extraidos, memoria)
        if info:
            print(f"🧩 Memoria de comercios ajustó {list(info['changed'])} para '{info['merchant']}' (visto {info['count']}×).")

        # Validación contra catálogos (categoría válida, cuenta válida por fuzzy).
        datos_extraidos = validate_classification(datos_extraidos, nombres_categorias, cuentas)

        # Producto por remitente/últimos 4, retiros → efectivo y "la tarjeta de
        # crédito solo tiene salidas".
        datos_extraidos, cambios = resolve_product(
            datos_extraidos, f"{asunto}\n{texto}", productos, sender=remitente)
        for campo, antes, despues in cambios:
            print(f"🏦 Producto: {campo} '{antes}' → '{despues}'.")
        return datos_extraidos, cat_tree
    except Exception as e:
        print(f"\n❌ Error analizando o interpretando la respuesta de Gemini: {e}")
        return None, cat_tree


def registrar_transaccion(datos_ia, tx_dt, db, cat_tree, dry_run=False):
    """Guarda la transacción extraída por la IA en Firestore.

    `tx_dt` es el datetime (tz Colombia) del momento del correo bancario, que
    usamos como verdad para la fecha Y la hora. No dependemos de la fecha que
    extrae el LLM (poco fiable y propensa a confundir el día).

    Con `dry_run=True` arma y muestra la transacción pero NO escribe en
    Firestore ni envía push (para pruebas en producción sin tocar la data).
    """
    # Manejar transacciones declinadas
    if datos_ia.get('type') == 'ignore':
        print("⏭️ La IA determinó que la transacción fue fallida/declinada o que no es una transacción. Ignorando guardado.")
        return True  # Devolvemos True para que de todas formas se quite la etiqueta

    # Fecha (solo día) y timestamp (día + hora) derivados del correo, en hora local.
    tx_date = tx_dt.strftime("%Y-%m-%d")

    # Sanitizar category: la IA puede devolver un objeto en vez de string
    raw_category = datos_ia.get('category', 'general')
    if isinstance(raw_category, dict):
        raw_category = raw_category.get('name', 'general')
    category = str(raw_category) if raw_category else 'general'

    # Validar subcategory contra las subcategorías válidas de la categoría elegida
    subcategory = datos_ia.get('subcategory', '') or ''
    valid_subs = []
    for c in cat_tree:
        if c['name'] == category:
            valid_subs = c.get('subcategories', [])
            break
    if subcategory and valid_subs and subcategory not in valid_subs:
        print(f"⚠️ La IA devolvió la subcategoría '{subcategory}', inválida para '{category}'. Se ignora.")
        subcategory = ''

    # Validar context
    context = datos_ia.get('context', 'personal')
    if context not in ('personal', 'business'):
        print(f"⚠️ La IA devolvió un contexto inválido '{context}'. Se usa 'personal'.")
        context = 'personal'

    # Validar type
    tx_type = datos_ia.get('type', 'debit')
    if tx_type not in ('debit', 'credit', 'transfer'):
        print(f"⚠️ La IA devolvió un type inválido '{tx_type}'. Se usa 'debit'.")
        tx_type = 'debit'

    nueva_transaccion = {
        "type": tx_type,
        "amount": float(datos_ia.get('amount', 0)),
        "currency": datos_ia.get('currency', 'COP'),
        "title": datos_ia.get('title', 'Sin concepto especificado'),
        "category": category,
        "subcategory": subcategory,
        "card": datos_ia.get('card', 'general'),
        "comments": datos_ia.get('comments', "Importado automáticamente desde Gmail vía IA"),
        "context": context,
        "date": tx_date,
        # Momento real (día + hora) de la transacción, en hora local de Colombia.
        # Se usa para ordenar; la UI no lo muestra. Firestore lo guarda como Timestamp.
        "timestamp": tx_dt,
        # Las transacciones importadas automáticamente requieren revisión
        # manual en la app; se marcan como 'reviewed' al editarlas/guardarlas.
        "status": "pending",
    }

    # Las transferencias (p. ej. pago de la tarjeta de crédito) llevan cuenta destino.
    if tx_type == 'transfer':
        nueva_transaccion["destinationCard"] = datos_ia.get('destinationCard', '') or ''

    print("\n📦 Datos a guardar en Firebase:")
    for k, v in nueva_transaccion.items():
        print(f"   {k}: {v}")

    if dry_run:
        print("🧪 DRY-RUN: no se escribe en Firebase ni se envía push.")
        return True

    try:
        _, doc_ref = db.collection('finance_transactions').add(nueva_transaccion)
        print(f"✅ Éxito: Registro guardado en Firebase (ID: {doc_ref.id})")
        # El push es best-effort: nunca debe romper el sync.
        try:
            enviar_push_pending(db, doc_ref.id, nueva_transaccion)
        except Exception as e:
            print(f"⚠️ No se pudo enviar la notificación push (no crítico): {e}")
        return True
    except Exception as e:
        print(f"❌ Error al guardar en Firebase: {e}")
        return False


def enviar_push(db, data):
    """Envía un Web Push (FCM) data-only a todos los dispositivos registrados.

    Lee los tokens de `fcm_tokens` (doc id == token); el service worker arma
    la notificación y resuelve el deep link desde data['url']. Limpia los
    tokens que FCM reporta como inválidos.
    """
    tokens = [d.id for d in db.collection('fcm_tokens').stream()]
    if not tokens:
        print("ℹ️ No hay dispositivos suscritos a notificaciones. Se omite push.")
        return

    message = messaging.MulticastMessage(
        tokens=tokens,
        data={k: str(v) for k, v in data.items()},
        # Sin fcm_options.link: FCM exige URL absoluta HTTPS ahí, pero el deep
        # link lo resuelve nuestro service worker desde data.url (relativo OK).
        webpush=messaging.WebpushConfig(headers={'Urgency': 'high'}),
    )

    response = messaging.send_each_for_multicast(message)
    print(f"🔔 Push enviado: {response.success_count} ok, {response.failure_count} fallidos.")

    for token, resp in zip(tokens, response.responses):
        if resp.success:
            continue
        exc = resp.exception
        if isinstance(exc, messaging.UnregisteredError) or 'not-registered' in str(getattr(exc, 'code', '')).lower():
            db.collection('fcm_tokens').document(token).delete()
            print(f"🧹 Token inválido eliminado: {token[:12]}…")


def enviar_push_pending(db, tx_id, tx):
    """Notifica por push que entró un movimiento pendiente de revisión, con
    deep link `?editTx=<id>`."""
    tipo = tx.get('type')
    signo = '-' if tipo == 'debit' else ('⇄ ' if tipo == 'transfer' else '+')
    try:
        monto = f"{signo}{float(tx.get('amount', 0)):,.0f} {tx.get('currency', 'COP')}"
    except (TypeError, ValueError):
        monto = tx.get('currency', 'COP')
    titulo = tx.get('title', 'Movimiento')
    categoria = tx.get('category', '')
    body = f"{monto} · {titulo}" + (f" · {categoria}" if categoria else "")
    enviar_push(db, {
        'txId': tx_id,
        'url': f"/?editTx={tx_id}",
        'title': '🧾 Pendiente de revisión',
        'body': body,
    })


def revisar_alertas_gmf(db, dry_run=False):
    """Alertas del 4x1000: best-effort, nunca rompe el sync."""
    try:
        gmf.check_gmf_alerts(
            db, datetime.datetime.now(BOGOTA),
            send_push=lambda data: enviar_push(db, data),
            dry_run=dry_run,
        )
    except Exception as e:
        print(f"⚠️ No se pudieron revisar las alertas del 4x1000 (no crítico): {e}")


def mark_as_processed(service, msg_id, label_id_to_remove):
    """Remueve la etiqueta del correo en Gmail."""
    try:
        service.users().messages().modify(
            userId='me',
            id=msg_id,
            body={'removeLabelIds': [label_id_to_remove]}
        ).execute()
        print(f"✅ Etiqueta removida del correo {msg_id}")
    except Exception as e:
        print(f"⚠️ Error intentando remover etiqueta: {e}")


def reprocess_last_emails(db, service, client, n, dry_run):
    """Modo PRUEBA: re-procesa los últimos N correos ya procesados (ordenados por
    processedAt). Pensado para validar el pipeline en producción tras un merge,
    sin esperar a un correo real. Con dry_run=True NO escribe en Firestore, NO
    envía push y NO toca etiquetas de Gmail.
    """
    modo = "DRY-RUN (no escribe nada)" if dry_run else "⚠️ ESCRIBE en Firestore"
    print(f"🧪 Modo prueba — re-procesando los últimos {n} correos procesados · {modo}")

    docs = db.collection(PROCESSED_COLLECTION) \
        .order_by('processedAt', direction=firestore.Query.DESCENDING) \
        .limit(n).get()
    ids = [d.id for d in docs]
    if not ids:
        print("⚠️ No hay correos en el historial de procesados.")
        return

    for i, msg_id in enumerate(ids, 1):
        print("\n" + "-" * 50)
        print(f"📩 [{i}/{len(ids)}] Re-procesando correo {msg_id}")
        try:
            message_data = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
        except Exception as e:
            print(f"⚠️ No se pudo traer el correo {msg_id} desde Gmail: {e}")
            continue

        payload = message_data.get('payload', {})
        subject = header(payload, 'Subject')
        sender = from_address(header(payload, 'From'))
        if looks_like_statement(subject):
            print(f"🚫 Sería ignorado por el gate de extractos ('{subject[:60]}').")
            continue

        internal_date_ms = int(message_data.get('internalDate', 0))
        tx_dt = (
            datetime.datetime.fromtimestamp(internal_date_ms / 1000.0, tz=BOGOTA)
            if internal_date_ms else datetime.datetime.now(BOGOTA)
        )

        body_text = extract_email_body(payload)
        if not body_text:
            print(f"⚠️ No se pudo extraer texto legible del correo {msg_id}")
            continue

        datos_ia, cat_tree = procesar_texto_con_ia(
            body_text[:MAX_BODY_CHARS], db, client, remitente=sender, asunto=subject)
        if datos_ia:
            registrar_transaccion(datos_ia, tx_dt, db, cat_tree, dry_run=dry_run)
        else:
            print(f"⚠️ El correo {msg_id} falló en la interpretación por IA.")

    print("\n🧪 Fin del modo prueba.")


def _load_settings(db):
    try:
        doc = db.collection('finance_settings').document('default').get()
        return doc.to_dict() if doc.exists else {}
    except Exception as e:
        print(f"⚠️ No se pudo leer finance_settings/default ({e}).")
        return {}


def _list_message_ids(service, query):
    ids, token = [], None
    while True:
        resp = service.users().messages().list(
            userId='me', q=query, maxResults=100, pageToken=token).execute()
        ids.extend(m['id'] for m in resp.get('messages', []))
        token = resp.get('nextPageToken')
        if not token or len(ids) >= MAX_MESSAGES_PER_RUN:
            return ids[:MAX_MESSAGES_PER_RUN]


def main():
    parser = argparse.ArgumentParser(description="Automatización de Gmail a Firestore con Gemini")
    parser.add_argument('--label', default=None,
                        help="Nombre de la etiqueta en Gmail. Si se omite, usa gmailLabel de "
                             f"finance_settings/default en Firestore, o '{DEFAULT_LABEL}'.")
    parser.add_argument('--reprocess-last', type=int, default=0, metavar='N',
                        help="Modo PRUEBA: re-procesa los últimos N correos ya procesados (no toca la etiqueta).")
    parser.add_argument('--dry-run', action='store_true',
                        help="No escribe en Firestore ni envía push. Úsalo con --reprocess-last para validar tras un merge.")
    args = parser.parse_args()

    gemini_key = os.environ.get('GEMINI_API_KEY')
    if not gemini_key:
        print("❌ Falta la variable de entorno GEMINI_API_KEY.")
        raise SystemExit(1)
    client = genai.Client(api_key=gemini_key)

    db = conectar_db()

    print("🔑 Iniciando conexión con Gmail...")
    service = authenticate_gmail(db)

    # Modo prueba: re-procesar los últimos N correos (validar el pipeline en
    # producción tras un merge, idealmente con --dry-run).
    if args.reprocess_last > 0:
        reprocess_last_emails(db, service, client, args.reprocess_last, args.dry_run)
        return

    procesar_correos(db, service, client, args.label)

    # Cada corrida (haya o no correos nuevos) revisa el tope del 4x1000: así
    # también cubre los movimientos registrados a mano en la app.
    revisar_alertas_gmf(db)


def procesar_correos(db, service, client, label_arg=None):
    """Busca los correos del banco y registra sus movimientos.

    Fuentes (configuradas en la app, Yo → Finanzas → Correos del banco):
    - Remitentes: `from:(a OR b) after:<corte>`. No se modifica el correo.
    - Etiqueta de Gmail (opcional, o la única fuente si no hay remitentes):
      al procesar se le quita la etiqueta, como antes.
    Lo ya procesado se descarta con processed_gmail_ids. Al final deja el
    estado de la corrida en sync_status/latest para mostrarlo en la app.
    """
    run_started = datetime.datetime.now(BOGOTA)
    settings = _load_settings(db)
    sources = gmf.get_email_sources(settings)
    sync_cfg = gmf.get_email_sync(settings)

    status_ref = db.collection(SYNC_STATUS_COLLECTION).document('latest')
    try:
        prev_status = status_ref.get().to_dict() or {}
    except Exception:
        prev_status = {}

    errors = []
    found = {}  # msg_id -> {'label': bool}

    # 1) Remitentes
    after = search_after(sync_cfg['startDate'], prev_status.get('cursor'), run_started, BOGOTA)
    sender_query = build_sender_query(sources, after)
    if sender_query:
        print(f"📫 Buscando correos: {sender_query}")
        try:
            for mid in _list_message_ids(service, sender_query):
                found.setdefault(mid, {'label': False})
        except Exception as e:
            errors.append(f"Búsqueda por remitentes: {e}")
            print(f"⚠️ Falló la búsqueda por remitentes: {e}")

    # 2) Etiqueta (opcional; si no hay remitentes es la única fuente)
    label_id, label_count = None, None
    if label_arg or sync_cfg['useLabel'] or not sender_query:
        label_name = label_arg or (settings.get('gmailLabel') or '').strip() or DEFAULT_LABEL
        label_id = get_label_id(service, label_name)
        if label_id:
            ids = _list_message_ids(service, f"label:{label_name}")
            label_count = len(ids)
            print(f"🏷️ {label_count} correo(s) con la etiqueta '{label_name}'.")
            for mid in ids:
                found.setdefault(mid, {'label': False})['label'] = True
        else:
            errors.append(f"No existe la etiqueta '{label_name}' en Gmail.")
            print(f"⚠️ No se encontró la etiqueta '{label_name}' en Gmail.")

    processed, failures = 0, 0
    per_source = {s['address']: 0 for s in sources}

    for msg_id, via in found.items():
        def done():
            save_processed_email(db, msg_id)
            if via['label']:
                mark_as_processed(service, msg_id, label_id)

        if is_processed(db, msg_id):
            if via['label']:
                print(f"⏭️ El correo {msg_id} ya fue procesado pero sigue etiquetado. Removiendo etiqueta...")
                mark_as_processed(service, msg_id, label_id)
            continue

        print("\n" + "-" * 50)
        print(f"📩 Procesando nuevo correo: {msg_id}")
        message_data = service.users().messages().get(userId='me', id=msg_id, format='full').execute()
        payload = message_data.get('payload', {})
        subject = header(payload, 'Subject')
        sender = from_address(header(payload, 'From'))
        source = match_source(sender, sources)
        if source:
            per_source[source['address']] += 1

        # Gates baratos pre-LLM: extractos y asuntos excluidos por el usuario.
        if looks_like_statement(subject):
            print(f"🚫 El correo parece un extracto/estado de cuenta ('{subject[:60]}'). Se ignora sin llamar al LLM.")
            done()
            continue
        kw = excluded_by_subject(subject, source)
        if kw:
            print(f"🚫 Asunto excluido por '{kw}' ('{subject[:60]}'). Se ignora sin llamar al LLM.")
            done()
            continue

        # Momento del correo (≈ momento de la transacción) en hora local de Colombia.
        # internalDate viene en epoch ms UTC; lo convertimos a UTC-5 (Colombia no
        # tiene horario de verano). De aquí salen la fecha y la hora que guardamos.
        internal_date_ms = int(message_data.get('internalDate', 0))
        tx_dt = (
            datetime.datetime.fromtimestamp(internal_date_ms / 1000.0, tz=BOGOTA)
            if internal_date_ms else datetime.datetime.now(BOGOTA)
        )

        body_text = extract_email_body(payload)
        if not body_text:
            print(f"⚠️ No se pudo extraer texto legible del correo {msg_id}")
            # Lo marcamos procesado de todas formas para no ciclar en correos vacíos
            done()
            continue

        truncated_text = body_text[:MAX_BODY_CHARS]
        print(f"📄 De {sender or '?'} · {subject[:60]} · {truncated_text[:80].replace(chr(10), ' ')}...")

        datos_ia, cat_tree = procesar_texto_con_ia(truncated_text, db, client, remitente=sender, asunto=subject)
        if datos_ia and registrar_transaccion(datos_ia, tx_dt, db, cat_tree):
            done()
            processed += 1
        else:
            failures += 1
            print(f"⚠️ El correo {msg_id} falló. Se reintentará en la próxima corrida.")

    if not found:
        print("✅ No se encontraron correos pendientes para procesar.")
    if failures:
        errors.append(f"{failures} correo(s) fallaron y se reintentarán.")

    try:
        status_ref.set({
            'lastRunAt': run_started,
            # Solo avanza el corte si todo salió bien, para reintentar lo fallido.
            'cursor': run_started if not failures else prev_status.get('cursor'),
            'processed': processed,
            'found': len(found),
            'perSource': per_source,
            'labelCount': label_count,
            'errors': errors,
        })
    except Exception as e:
        print(f"⚠️ No se pudo guardar el estado de la corrida (no crítico): {e}")


if __name__ == '__main__':
    main()
