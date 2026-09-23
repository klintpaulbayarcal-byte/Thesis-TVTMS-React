export const money = value => new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP', maximumFractionDigits:2 }).format(Number(value||0));
export const dateOnly = value => value ? new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'short', day:'2-digit' }).format(new Date(value)) : '—';
export const dateTime = value => value ? new Intl.DateTimeFormat('en-PH', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value)) : '—';
export const titleCase = value => String(value??'').replaceAll('_',' ').replace(/\b\w/g, c=>c.toUpperCase());
export const firstArray = (response, keys=[]) => {
  for (const key of ['data',...keys]) if (Array.isArray(response?.[key])) return response[key];
  return [];
};
export const firstObject = (response, keys=[]) => {
  for (const key of ['data',...keys]) if (response?.[key] && !Array.isArray(response[key]) && typeof response[key]==='object') return response[key];
  return {};
};
