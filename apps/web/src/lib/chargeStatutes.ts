// ============================================\n// Dispatch HQ — Charge Statutes (STAGED batch)
// ============================================
// The game's OWN code system — NOT real-world statutes. Codes are DHQ-###
// by design, and the UI must label them as game codes, never as real law.
// This table is the connective layer across records → booking → jail →
// court hearing: every charge string in justice.ts CRIMES has exactly one
// row here, so sentence/bail derive from the charge (highest class wins),
// with the record's risk tier only moving the value inside the range.
// Unknown charge strings fall back to the old risk-only formula so a typo
// can never break booking.
import type { RiskLevel } from '@dispatch-hq/shared';

export type ChargeClass = 'infraction' | 'misdemeanor' | 'felony';

export interface ChargeStatute {
  charge: string;
  code: string;
  class: ChargeClass;
  sentenceMinDays: number;
  sentenceMaxDays: number;
  bailMin: number;
  bailMax: number;
}

const ROW = (
  charge: string, code: string, cls: ChargeClass,
  sMin: number, sMax: number, bMin: number, bMax: number,
): ChargeStatute => ({ charge, code, class: cls, sentenceMinDays: sMin, sentenceMaxDays: sMax, bailMin: bMin, bailMax: bMax });

export const CHARGE_STATUTES: ChargeStatute[] = [
  ROW('Petty theft', 'DHQ-101', 'misdemeanor', 1, 90, 500, 3000),
  ROW('Shoplifting', 'DHQ-102', 'misdemeanor', 1, 90, 500, 2500),
  ROW('Criminal trespass', 'DHQ-103', 'misdemeanor', 1, 60, 500, 2000),
  ROW('Vandalism', 'DHQ-104', 'misdemeanor', 1, 120, 500, 4000),
  ROW('Public intoxication', 'DHQ-105', 'infraction', 0, 30, 250, 1000),
  ROW('Disorderly conduct', 'DHQ-106', 'misdemeanor', 1, 90, 500, 3000),
  ROW('Possession of controlled substance', 'DHQ-107', 'misdemeanor', 30, 180, 2000, 10000),
  ROW('Drug paraphernalia', 'DHQ-108', 'infraction', 0, 60, 250, 1500),
  ROW('DUI', 'DHQ-109', 'misdemeanor', 30, 365, 2500, 15000),
  ROW('Reckless driving', 'DHQ-110', 'misdemeanor', 30, 180, 1000, 8000),
  ROW('Suspended license', 'DHQ-111', 'infraction', 0, 60, 250, 2000),
  ROW('Domestic battery', 'DHQ-112', 'misdemeanor', 90, 365, 5000, 25000),
  ROW('Assault', 'DHQ-113', 'misdemeanor', 30, 365, 2500, 20000),
  ROW('Aggravated assault', 'DHQ-114', 'felony', 180, 720, 25000, 100000),
  ROW('Robbery', 'DHQ-115', 'felony', 180, 1095, 25000, 100000),
  ROW('Burglary', 'DHQ-116', 'felony', 90, 730, 10000, 50000),
  ROW('Auto theft', 'DHQ-117', 'felony', 90, 730, 10000, 50000),
  ROW('Criminal mischief', 'DHQ-118', 'misdemeanor', 1, 120, 500, 4000),
  ROW('Resisting arrest', 'DHQ-119', 'misdemeanor', 30, 365, 2000, 15000),
  ROW('Obstruction', 'DHQ-120', 'misdemeanor', 30, 180, 1000, 8000),
  ROW('Possession of stolen property', 'DHQ-121', 'misdemeanor', 30, 365, 2000, 15000),
  ROW('Fraud', 'DHQ-122', 'felony', 90, 730, 10000, 50000),
  ROW('Forgery', 'DHQ-123', 'felony', 90, 730, 10000, 50000),
  ROW('Identity theft', 'DHQ-124', 'felony', 180, 1095, 25000, 100000),
  ROW('Weapons violation', 'DHQ-125', 'misdemeanor', 90, 365, 5000, 25000),
  ROW('Unlawful possession of firearm', 'DHQ-126', 'felony', 180, 1095, 25000, 100000),
  ROW('Probation violation', 'DHQ-127', 'misdemeanor', 30, 365, 2000, 20000),
  ROW('Warrant - failure to appear', 'DHQ-128', 'misdemeanor', 30, 180, 1000, 10000),
  ROW('Warrant - unpaid fines', 'DHQ-129', 'infraction', 0, 90, 500, 5000),
  ROW('Warrant - felony', 'DHQ-130', 'felony', 180, 1095, 25000, 100000),
];

const BY_CHARGE = new Map(CHARGE_STATUTES.map((s) => [s.charge, s]));

export function statuteForCharge(charge: string): ChargeStatute | undefined {
  return BY_CHARGE.get(charge);
}

const CLASS_RANK: Record<ChargeClass, number> = { infraction: 0, misdemeanor: 1, felony: 2 };

/** Top charge = highest class, then longest max sentence. */
export function topStatuteForCharges(charges: string[]): ChargeStatute | undefined {
  let top: ChargeStatute | undefined;
  for (const c of charges) {
    const s = statuteForCharge(c);
    if (!s) continue;
    if (!top || CLASS_RANK[s.class] > CLASS_RANK[top.class] ||
      (CLASS_RANK[s.class] === CLASS_RANK[top.class] && s.sentenceMaxDays > top.sentenceMaxDays)) top = s;
  }
  return top;
}

const RISK_SHIFT: Record<RiskLevel, number> = { low: 0, medium: 0.25, high: 0.6, violent: 1 };

/** Sentence/bail from the top charge's range; risk moves the value inside
 *  the range. Returns null when no charge has a statute row (caller falls
 *  back to the legacy risk-only formula). Pure and deterministic given a
 *  `pick` in [0,1) — pass Math.random() in game code, a fixed value in tests. */
export function sentenceAndBailForCharges(
  charges: string[], riskLevel: RiskLevel, pick = Math.random(),
): { sentenceDays: number; bailAmount: number } | null {
  const top = topStatuteForCharges(charges);
  if (!top) return null;
  const shift = RISK_SHIFT[riskLevel] ?? 0;
  const span = (min: number, max: number) => Math.round(min + (max - min) * Math.min(1, Math.max(0, shift * 0.5 + pick * 0.5)));
  return { sentenceDays: span(top.sentenceMinDays, top.sentenceMaxDays), bailAmount: span(top.bailMin, top.bailMax) };
}
