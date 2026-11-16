export function toHalalas(sar: number) {
  return Math.round((sar + Number.EPSILON) * 100);
}

/** Monthly EMI is entered directly. A balloon, when set, is one extra installment after the monthly payments. */
export function emiSchedule(emiSar: number, balloonSar: number, months: number) {
  if (!Number.isFinite(emiSar) || !Number.isFinite(balloonSar) || !Number.isInteger(months)) return null;
  if (emiSar <= 0 || balloonSar < 0 || months < 1 || months > 120) return null;
  const monthlyHalalas = toHalalas(emiSar);
  const balloonHalalas = toHalalas(balloonSar);
  if (monthlyHalalas <= 0) return null;
  return {
    monthlyHalalas,
    balloonHalalas,
    totalHalalas: monthlyHalalas * months + balloonHalalas,
    installmentCount: months + (balloonHalalas > 0 ? 1 : 0),
  };
}

/** Whole months still left in the tenure. A partial month does not count as finished. */
export function monthsRemaining(startValue: string, tenure: number, today = new Date()): number | null {
  if (!Number.isInteger(tenure) || tenure < 1 || tenure > 120) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(startValue.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) return null;
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (now < start) return tenure;
  let elapsed = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) elapsed -= 1;
  return Math.max(0, tenure - Math.max(0, elapsed));
}
