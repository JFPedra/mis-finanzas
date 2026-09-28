"""Qué correos lee el sync: búsqueda por remitentes configurados en la app,
más la etiqueta de Gmail como opción adicional.

Módulo puro (solo stdlib): se puede testear sin Gmail ni Firebase.
"""
import datetime
from email.utils import parseaddr

from tx_enrich import sender_matches

# Margen hacia atrás sobre la última corrida exitosa: cubre correos que Gmail
# indexa tarde. Lo repetido se descarta con processed_gmail_ids.
OVERLAP_DAYS = 2
# Sin fecha de inicio ni corrida previa, no se lee más atrás que esto.
DEFAULT_LOOKBACK_DAYS = 2


def search_after(start_date, cursor, now, tz):
    """Momento desde el que buscar: el más reciente entre la fecha de inicio
    configurada y (última corrida exitosa − margen)."""
    candidates = []
    if start_date:
        try:
            d = datetime.date.fromisoformat(start_date)
            candidates.append(datetime.datetime(d.year, d.month, d.day, tzinfo=tz))
        except ValueError:
            pass
    if cursor:
        candidates.append(cursor - datetime.timedelta(days=OVERLAP_DAYS))
    if not candidates:
        return now - datetime.timedelta(days=DEFAULT_LOOKBACK_DAYS)
    return max(candidates)


def build_sender_query(sources, after):
    """Consulta de Gmail para los remitentes activos, o None si no hay."""
    addresses = [s['address'] for s in sources if s.get('enabled', True)]
    if not addresses:
        return None
    return f"from:({' OR '.join(addresses)}) after:{int(after.timestamp())}"


def header(payload, name):
    return next((h.get('value', '') for h in payload.get('headers', [])
                 if h.get('name', '').lower() == name.lower()), '')


def from_address(from_header):
    return parseaddr(from_header or '')[1].strip().lower()


def match_source(address, sources):
    """Remitente configurado que corresponde a la dirección (el más específico)."""
    matches = [s for s in sources if sender_matches(address, s['address'])]
    return max(matches, key=lambda s: ('@' in s['address'], len(s['address'])), default=None)


def excluded_by_subject(subject, source):
    subj = (subject or '').lower()
    return next((kw for kw in (source or {}).get('excludeSubjects', []) if kw in subj), None)
