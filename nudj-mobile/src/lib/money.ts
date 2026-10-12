// CONTRACT: money is PAISE as integers everywhere — API, SQLite, state.
// Rupees exist only as display strings, produced here and nowhere else.

export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  // insert ',' into head every 2 chars from the right
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  if (head.length > 0) parts.unshift(head);
  return parts.join(',') + ',' + tail;
}

function intlGroupsIndian(): boolean {
  try {
    return (1234567).toLocaleString('en-IN') === '12,34,567';
  } catch {
    return false;
  }
}

export const USE_INTL = intlGroupsIndian(); // evaluated once, at module load

export function formatInr(
  paise: number,
  opts: { decimals?: boolean } = { decimals: false }
): string {
  const rupees = paise / 100;

  if (USE_INTL) {
    return rupees.toLocaleString('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: opts.decimals ? 2 : 0,
      maximumFractionDigits: opts.decimals ? 2 : 0,
    });
  }

  const whole = Math.floor(Math.abs(rupees)).toString();
  let out = '₹' + groupIndian(whole);

  if (opts.decimals) {
    const remainder = Math.round((Math.abs(rupees) - Math.floor(Math.abs(rupees))) * 100);
    out += '.' + remainder.toString().padStart(2, '0');
  }

  if (rupees < 0) out = '-' + out;

  return out;
}
