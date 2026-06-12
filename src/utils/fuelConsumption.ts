import { getRecordNumericAmount } from './filterRecords';
import type { DpdRecord } from './record';
import { pickField } from './record';

/** Średnia cena ON netto (PLN/L) — szacunek litrów z kwoty, gdy brak Amount w litrach. */
export const DEFAULT_FUEL_PLN_PER_LITER = 6.15;

export interface FuelConsumptionMetrics {
  litersPer100Km: number | null;
  kmPerLiter: number | null;
  plnPerLiter: number | null;
}

/** Litry z rekordu POC: Amount (L) lub szacunek z NetPrice / średnia cena. */
export function fuelLitersFromRecord(
  r: DpdRecord,
  plnPerLiter = DEFAULT_FUEL_PLN_PER_LITER,
): number {
  const qty = parseQty(pickField(r, 'amount', 'Amount'));
  const net = getRecordNumericAmount(r);

  if (qty != null && qty >= 4 && qty <= 800) return Math.round(qty * 10) / 10;
  if (net != null && net > 0 && plnPerLiter > 0) {
    return Math.round((net / plnPerLiter) * 10) / 10;
  }
  return 0;
}

function parseQty(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t || t === '—') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function computeFuelConsumption(
  liters: number,
  drivenKm: number | null | undefined,
  fuelCostPln?: number,
): FuelConsumptionMetrics {
  if (liters <= 0 || drivenKm == null || drivenKm <= 0) {
    return { litersPer100Km: null, kmPerLiter: null, plnPerLiter: null };
  }
  const litersPer100Km = (liters / drivenKm) * 100;
  const kmPerLiter = liters > 0 ? drivenKm / liters : null;
  const plnPerLiter =
    fuelCostPln != null && fuelCostPln > 0 && liters > 0 ? fuelCostPln / liters : null;
  return {
    litersPer100Km: Math.round(litersPer100Km * 10) / 10,
    kmPerLiter: kmPerLiter != null ? Math.round(kmPerLiter * 10) / 10 : null,
    plnPerLiter: plnPerLiter != null ? Math.round(plnPerLiter * 100) / 100 : null,
  };
}

export function formatLitersPer100Km(v: number | null): string {
  if (v == null) return '—';
  return `${v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L/100 km`;
}

export function formatKmPerLiter(v: number | null): string {
  if (v == null) return '—';
  return `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km/L`;
}
