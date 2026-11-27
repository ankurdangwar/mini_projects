export function formatMoney(cents: number, currency = 'INR'): string {
  const isWhole = cents % 100 === 0;
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'INR' && isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatSlotWindow(startTime: string, endTime: string): string {
  const fmt = (hhmm: string) => {
    const [hStr, mStr] = hhmm.split(':');
    const h = Number(hStr);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mStr} ${suffix}`;
  };
  return `${fmt(startTime)} – ${fmt(endTime)}`;
}
