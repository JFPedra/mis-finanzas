"""
Lógica de enriquecimiento/validación de transacciones del sync de Gmail.

Módulo puro (solo stdlib): se puede testear sin Firebase ni Gemini.

- Memoria de comercios: clasificación habitual (categoría/subcategoría/contexto)
  por comercio, derivada del historial. Se usa como (a) prior en el prompt y
  (b) post-corrección determinista de la salida del LLM cuando hay confianza.
- Gate de no-transacciones: detecta extractos por asunto.
- Validación contra catálogos al guardar.
"""

import re
import difflib
from collections import Counter

# Umbrales para auto-aplicar la memoria de comercios sobre la salida del LLM.
MEMORY_MIN_COUNT = 3      # nº mínimo de precedentes del comercio
MEMORY_MIN_AGREE = 0.70   # acuerdo mínimo del campo en el historial

_TOKEN_RE = re.compile(r"[a-z0-9áéíóúñü]+")
# Asuntos que NO son una transacción individual (extractos / estados de cuenta).
# OJO: "Resumen de transacción" SÍ es una transacción → no se filtra por "resumen".
_STATEMENT_RE = re.compile(r"\b(extracto|estado de cuenta|resumen mensual)\b", re.IGNORECASE)


def normalize_merchant(title):
    """Normaliza un título a una clave de comercio estable."""
    t = (title or "").lower()
    t = re.sub(r"[^a-z0-9áéíóúñü ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def looks_like_statement(subject):
    """True si el asunto parece un extracto/estado de cuenta (no una transacción)."""
    return bool(_STATEMENT_RE.search(subject or ""))


def build_merchant_memory(transactions):
    """Construye la memoria de comercios desde el historial.

    `transactions` es una lista de dicts con al menos
    {title, category, subcategory, context}. Devuelve
    {clave_comercio: {merchant, count, category, cat_agree, subcategory,
                      sub_agree, context, ctx_agree}}.
    """
    groups = {}
    for tx in transactions:
        key = normalize_merchant(tx.get("title", ""))
        if not key:
            continue
        gg = groups.setdefault(key, {
            "display": tx.get("title", ""), "count": 0,
            "cat": Counter(), "sub": Counter(), "ctx": Counter(),
        })
        gg["count"] += 1
        gg["cat"][tx.get("category", "")] += 1
        gg["sub"][tx.get("subcategory", "") or ""] += 1
        gg["ctx"][tx.get("context", "personal") or "personal"] += 1

    memory = {}
    for key, gg in groups.items():
        cat, catn = gg["cat"].most_common(1)[0]
        sub, subn = gg["sub"].most_common(1)[0]
        ctx, ctxn = gg["ctx"].most_common(1)[0]
        memory[key] = {
            "merchant": gg["display"], "count": gg["count"],
            "category": cat, "cat_agree": catn / gg["count"],
            "subcategory": sub, "sub_agree": subn / gg["count"],
            "context": ctx, "ctx_agree": ctxn / gg["count"],
        }
    return memory


def memory_for_prompt(memory, top_n=60):
    """Versión compacta de la memoria para inyectar en el prompt: los comercios
    más frecuentes con su clasificación habitual."""
    top = sorted(memory.values(), key=lambda m: m["count"], reverse=True)[:top_n]
    return [
        {
            "comercio": m["merchant"],
            "category": m["category"],
            "subcategory": m["subcategory"],
            "context": m["context"],
            "visto": m["count"],
        }
        for m in top
    ]


def _lookup_merchant(title, memory):
    """Busca el comercio en la memoria: exacto y, si falla, fuzzy (>=0.9)."""
    key = normalize_merchant(title)
    if key in memory:
        return memory[key]
    match = difflib.get_close_matches(key, list(memory.keys()), n=1, cutoff=0.9)
    return memory[match[0]] if match else None


def apply_merchant_memory(datos, memory,
                          min_count=MEMORY_MIN_COUNT, min_agree=MEMORY_MIN_AGREE):
    """Post-corrección determinista: si el comercio es conocido y consistente,
    fija categoría/subcategoría/contexto desde la memoria (por campo, según su
    acuerdo). No toca amount/title/comments. No aplica a 'ignore'.

    Devuelve (datos_corregidos, info|None) — info trae lo que cambió.
    """
    if not memory or datos.get("type") == "ignore":
        return datos, None
    m = _lookup_merchant(datos.get("title", ""), memory)
    if not m or m["count"] < min_count:
        return datos, None

    out = dict(datos)
    changed = {}
    if m["cat_agree"] >= min_agree and out.get("category") != m["category"]:
        changed["category"] = (out.get("category"), m["category"])
        out["category"] = m["category"]
    if m["sub_agree"] >= min_agree and out.get("subcategory", "") != m["subcategory"]:
        changed["subcategory"] = (out.get("subcategory"), m["subcategory"])
        out["subcategory"] = m["subcategory"]
    if m["ctx_agree"] >= min_agree and out.get("context") != m["context"]:
        changed["context"] = (out.get("context"), m["context"])
        out["context"] = m["context"]

    if not changed:
        return datos, None
    return out, {"merchant": m["merchant"], "count": m["count"], "changed": changed}


# Últimos 4 dígitos en contexto de tarjeta/cuenta: "*1234", "**1234",
# "terminada en 1234", "cuenta No. 1234", "x1234".
_LAST4_RE = re.compile(
    r"(?:\*{1,}|x{2,}|•{2,}|terminad[ao]\s+en|finalizad[ao]\s+en|final\s+|n[uú]mero\s+|no\.?\s*)\s*(\d{4})\b",
    re.IGNORECASE,
)


# Retiro de cajero / avance en efectivo: la plata pasa de un producto al efectivo.
_WITHDRAWAL_RE = re.compile(r"\bretir(o|aste|a)\b|\bcajero\b|\bATM\b|avance en efectivo", re.IGNORECASE)

_BANK_TYPES = ("savings", "lowvalue", "credit")


def sender_matches(from_address, pattern):
    """`pattern` es una dirección exacta o un dominio (acepta subdominios)."""
    addr = (from_address or "").strip().lower()
    pat = (pattern or "").strip().lower().lstrip("@")
    if not addr or not pat:
        return False
    if "@" in pat:
        return addr == pat
    domain = addr.rsplit("@", 1)[-1]
    return domain == pat or domain.endswith("." + pat)


def _mentioned_products(text, products):
    """Productos cuyo `last4` aparece en el correo en contexto de tarjeta/cuenta."""
    digits = {m.group(1) for m in _LAST4_RE.finditer(text or "")}
    return [p for p in products if p.get("last4") and p["last4"] in digits]


def _principal(products):
    return next((p for p in products if p.get("principal")), None) or \
        next((p for p in products if p["type"] == "savings"), None)


def _change(out, changes, field, value):
    if out.get(field) != value:
        changes.append((field, out.get(field), value))
        out[field] = value


def resolve_product(datos, text, products, sender=""):
    """Post-corrección determinista de la cuenta con el catálogo de productos.

    1. Candidatos: los productos bancarios asociados al remitente del correo
       (si ninguno lo está, todos los productos bancarios).
    2. Entre los candidatos, si el correo menciona los últimos 4 dígitos de
       exactamente uno, o si solo hay un candidato por remitente, ese es el
       producto (origen, o destino si es un pago a una tarjeta de crédito).
    3. Retiro de cajero / avance → 'transfer' del producto hacia Efectivo.
    4. Efectivo nunca es el origen de un correo (esos gastos van a mano): se
       reasigna al candidato o a la cuenta principal.
    5. Tarjeta de crédito solo tiene salidas: un 'credit' sobre la tarjeta es
       un pago recibido → 'transfer' desde la cuenta principal hacia la tarjeta.

    Devuelve (datos_corregidos, [cambios]). Pura.
    """
    if not products or datos.get("type") == "ignore":
        return datos, []
    out = dict(datos)
    changes = []
    by_name = {p["name"]: p for p in products}
    bank_products = [p for p in products if p["type"] in _BANK_TYPES]
    cash = next((p for p in products if p["type"] == "cash"), None)
    principal = _principal(products)

    by_sender = [p for p in bank_products if any(sender_matches(sender, s) for s in p.get("senders", []))]
    candidates = by_sender or bank_products

    mentioned = _mentioned_products(text, candidates)
    match = mentioned[0] if len(mentioned) == 1 else (by_sender[0] if len(by_sender) == 1 else None)
    if match:
        if out.get("type") == "transfer" and match["type"] == "credit":
            _change(out, changes, "destinationCard", match["name"])
        else:
            _change(out, changes, "card", match["name"])

    # Retiro de cajero: sale del producto y entra al efectivo.
    if cash and out.get("type") == "debit" and _WITHDRAWAL_RE.search(text or ""):
        _change(out, changes, "type", "transfer")
        _change(out, changes, "destinationCard", cash["name"])

    # Un correo nunca sale del efectivo.
    origin = by_name.get(out.get("card"))
    if origin is None or origin["type"] == "cash":
        fallback = match or (by_sender[0] if by_sender else None) or principal
        if fallback:
            _change(out, changes, "card", fallback["name"])

    # Tarjeta de crédito: solo salidas.
    card = by_name.get(out.get("card"))
    if card and card["type"] == "credit" and out.get("type") == "credit" and principal:
        _change(out, changes, "type", "transfer")
        out["destinationCard"] = card["name"]
        out["card"] = principal["name"]

    if out.get("type") != "transfer":
        out["destinationCard"] = ""
    return out, changes


def validate_classification(datos, category_names, accounts):
    """Asegura que la categoría exista en el catálogo (si no, 'Otros') y que la
    cuenta exista (si no, la acerca por fuzzy a una cuenta válida). Pura."""
    out = dict(datos)
    if category_names and out.get("category") not in category_names:
        out["category"] = "Otros" if "Otros" in category_names else (out.get("category") or "general")
    card = out.get("card")
    if accounts and card and card not in accounts:
        match = difflib.get_close_matches(str(card), list(accounts), n=1, cutoff=0.8)
        if match:
            out["card"] = match[0]
    return out
