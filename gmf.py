"""Productos financieros y alertas del 4x1000 (GMF) para el sync de Gmail.

Espejo en Python de src/domains/finance/utils/accountHelpers.js: las dos
implementaciones deben calcular igual el slug, el tipo inferido y el tope.
"""
import datetime
import re
import unicodedata

# UVT oficial por año (DIAN). 2026: Resolución 000238 del 15-12-2025.
# Mantener en sync con UVT_BY_YEAR en accountHelpers.js.
UVT_BY_YEAR = {2024: 47065, 2025: 49799, 2026: 52374}
GMF_EXEMPT_UVT = 350
GMF_RATE = 0.004
DEFAULT_THRESHOLDS = [80, 95]
PRODUCT_TYPES = ('savings', 'checking', 'credit', 'cash')

ALERTS_COLLECTION = 'gmf_alerts'


def product_slug(name):
    s = unicodedata.normalize('NFKD', name or '')
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def infer_product_type(name):
    n = name or ''
    if re.search(r'cr[eé]dit|visa|master|amex', n, re.I):
        return 'credit'
    if re.search(r'efectivo|cash', n, re.I):
        return 'cash'
    if re.search(r'corriente', n, re.I):
        return 'checking'
    return 'savings'


def _thresholds(raw):
    out = set()
    for v in raw or []:
        try:
            n = round(float(v))
        except (TypeError, ValueError):
            continue
        if 0 < n <= 100:
            out.add(n)
    return sorted(out)


def get_products(settings):
    """Productos desde finance_settings/default. `accounts` manda en nombres y
    orden; `products` aporta tipo, banco, últimos 4 y config de GMF."""
    settings = settings or {}
    stored = settings.get('products') or []
    by_name = {p.get('name'): p for p in stored if isinstance(p, dict)}
    names = settings.get('accounts') or [p.get('name') for p in stored if isinstance(p, dict)]

    products = []
    for name in names:
        p = by_name.get(name) or {'name': name}
        ptype = p.get('type') if p.get('type') in PRODUCT_TYPES else infer_product_type(name)
        gmf = dict(p.get('gmf') or {})
        products.append({
            'name': name,
            'type': ptype,
            'bank': p.get('bank') or '',
            'last4': p.get('last4') or '',
            'gmf': {
                'exempt': ptype == 'savings' and bool(gmf.get('exempt')),
                'limitMode': gmf.get('limitMode') or 'uvt',
                'manualLimit': gmf.get('manualLimit'),
                'alertsEnabled': gmf.get('alertsEnabled', True) is not False,
                'thresholds': _thresholds(gmf.get('thresholds')) or list(DEFAULT_THRESHOLDS),
            },
        })
    return products


def uvt_for(year, overrides=None):
    try:
        override = float((overrides or {}).get(str(year)) or (overrides or {}).get(year) or 0)
    except (TypeError, ValueError):
        override = 0
    if override > 0:
        return override
    if year in UVT_BY_YEAR:
        return UVT_BY_YEAR[year]
    known = sorted((y for y in UVT_BY_YEAR if y <= year), reverse=True)
    return UVT_BY_YEAR[known[0] if known else max(UVT_BY_YEAR)]


def monthly_limit(product, year, overrides=None):
    g = product.get('gmf') or {}
    try:
        manual = float(g.get('manualLimit') or 0)
    except (TypeError, ValueError):
        manual = 0
    if g.get('limitMode') == 'manual' and manual > 0:
        return manual
    return round(GMF_EXEMPT_UVT * uvt_for(year, overrides))


def outflows_in_month(transactions, product_name, year, month):
    """Retiros del producto en el mes: compras/débitos y transferencias que
    salen de él. Solo COP. `transactions` son dicts de Firestore."""
    total = 0.0
    prefix = f"{year}-{month:02d}-"
    for tx in transactions:
        if (tx.get('card') or tx.get('account')) != product_name:
            continue
        if (tx.get('currency') or 'COP') != 'COP':
            continue
        if tx.get('type') == 'credit' and not tx.get('isTransfer'):
            continue
        if not str(tx.get('date') or '').startswith(prefix):
            continue
        try:
            total += float(tx.get('amount') or 0)
        except (TypeError, ValueError):
            pass
    return total


def new_thresholds(pct, thresholds, already_sent):
    """Umbrales cruzados que aún no se notificaron este mes (el 100% siempre
    cuenta como umbral)."""
    levels = sorted(set(thresholds) | {100})
    return [t for t in levels if pct >= t and t not in set(already_sent or [])]


def _money(v):
    return f"${v:,.0f}".replace(',', '.')


def build_alert(product, used, limit, top, now):
    days_in_month = (datetime.date(now.year + (now.month == 12), now.month % 12 + 1, 1) - datetime.timedelta(days=1)).day
    days_left = days_in_month - now.day
    name = product['name']
    if top >= 100:
        title = 'Superaste el tope del 4x1000'
        body = f"{name}: llevas {_money(used)} de {_money(limit)} este mes. Lo que retires de más paga 4x1000."
    else:
        pct = used / limit * 100 if limit else 0
        title = f"4x1000: {name} al {pct:.0f}% del tope"
        body = f"Te quedan {_money(limit - used)} exentos y faltan {days_left} días para el corte."
    return {
        'title': title,
        'body': body,
        'url': '/?view=cuentas&tab=gmf',
        'kind': 'gmf',
    }


def check_gmf_alerts(db, now, send_push, dry_run=False):
    """Revisa cada cuenta exenta con avisos activos y envía una push por cada
    nivel nuevo cruzado en el mes (una sola push con el más alto si se cruzan
    varios a la vez). El estado de lo ya enviado vive en gmf_alerts/{slug}_{YYYY-MM}.
    """
    snap = db.collection('finance_settings').document('default').get()
    settings = snap.to_dict() if snap.exists else {}
    products = [p for p in get_products(settings)
                if p['type'] == 'savings' and p['gmf']['exempt'] and p['gmf']['alertsEnabled']]
    if not products:
        return

    month_start = f"{now.year}-{now.month:02d}-01"
    month_end = f"{now.year}-{now.month:02d}-31"
    txs = [d.to_dict() for d in db.collection('finance_transactions')
           .where('date', '>=', month_start).where('date', '<=', month_end).get()]

    overrides = settings.get('uvtOverrides') or {}
    for product in products:
        limit = monthly_limit(product, now.year, overrides)
        used = outflows_in_month(txs, product['name'], now.year, now.month)
        pct = used / limit * 100 if limit else 0

        ref = db.collection(ALERTS_COLLECTION).document(f"{product_slug(product['name'])}_{now.year}-{now.month:02d}")
        prev = ref.get()
        sent = (prev.to_dict() or {}).get('sent', []) if prev.exists else []
        new = new_thresholds(pct, product['gmf']['thresholds'], sent)
        print(f"💸 4x1000 · {product['name']}: {_money(used)} de {_money(limit)} ({pct:.0f}%).")
        if not new:
            continue

        alert = build_alert(product, used, limit, max(new), now)
        print(f"🔔 Aviso 4x1000 ({max(new)}%): {alert['title']} — {alert['body']}")
        if dry_run:
            continue
        send_push(alert)
        ref.set({
            'product': product['name'],
            'month': f"{now.year}-{now.month:02d}",
            'sent': sorted(set(sent) | set(new)),
            'lastPct': round(pct, 1),
            'updatedAt': now,
        })
