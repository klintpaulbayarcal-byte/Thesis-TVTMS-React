export const citationContextReady = context => {
  if (!context || Number(context.flat_penalty) !== 150) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(context.date_issued ?? ''))) return false;
  if (!/^\d{2}:\d{2}/.test(String(context.time_issued ?? ''))) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(context.appearance_due_date ?? ''));
};

export const citationOfficerReady = context =>
  Boolean(String(context?.officer_rank ?? '').trim());

export const citationTotal = (selectedCount, context) =>
  citationContextReady(context) && selectedCount > 0
    ? selectedCount * Number(context.flat_penalty)
    : null;

export const citationDateTime = context => {
  if (!citationContextReady(context)) return 'Date and time unavailable';
  const clock = context.time_issued.slice(0, 8);
  const instant = new Date(`${context.date_issued}T${clock.length === 5 ? `${clock}:00` : clock}+08:00`);
  if (Number.isNaN(instant.getTime())) return 'Date and time unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(instant);
};
