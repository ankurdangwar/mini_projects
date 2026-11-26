export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
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
