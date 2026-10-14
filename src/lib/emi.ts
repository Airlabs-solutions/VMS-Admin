export function toHalalas(sar: number) {
  return Math.round((sar + Number.EPSILON) * 100);
}

export function emiPreview(loanSar: number, downSar: number, annualPercent: number, months: number) {
  if (!Number.isFinite(loanSar) || !Number.isFinite(downSar) || !Number.isFinite(annualPercent) || !Number.isInteger(months)) return null;
  if (loanSar <= 0 || downSar < 0 || annualPercent < 0 || annualPercent > 100 || months < 1 || months > 120) return null;
  const principal = toHalalas(loanSar) - toHalalas(downSar);
  if (principal <= 0) return null;
  if (annualPercent <= 0) {
    const monthlyHalalas = Math.floor(principal / months);
    const lastHalalas = principal - monthlyHalalas * (months - 1);
    return { financedHalalas: principal, monthlyHalalas, lastHalalas, totalHalalas: principal };
  }
  const monthlyRate = annualPercent / 100 / 12;
  const factor = (1 + monthlyRate) ** months;
  const monthlyHalalas = Math.round((principal * monthlyRate * factor) / (factor - 1));
  if (monthlyHalalas <= 0) return null;
  return { financedHalalas: principal, monthlyHalalas, lastHalalas: monthlyHalalas, totalHalalas: monthlyHalalas * months };
}
