// Datas no fuso da operação (Brasília = UTC-3, sem horário de verão desde 2019)

export function offsetHours(env) {
  const n = Number(env && env.TZ_OFFSET_HOURS);
  return Number.isFinite(n) ? n : -3;
}

// Data AAAA-MM-DD de um instante, no fuso indicado
export function localDate(instant, offset) {
  const d = new Date(instant.getTime() + offset * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// Soma dias a uma data AAAA-MM-DD
export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Converte uma data vinda da Kiwify para AAAA-MM-DD local.
// Aceita ISO com fuso ("2026-11-20T15:00:00.000Z") ou sem fuso ("2026-11-20 12:00"),
// que é tratado como horário local.
export function toLocalDate(value, offset, fallback) {
  if (typeof value === 'string' && value.length >= 10) {
    const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
    if (!hasZone && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const t = Date.parse(value);
    if (Number.isFinite(t)) return localDate(new Date(t), offset);
  }
  return localDate(fallback || new Date(), offset);
}
