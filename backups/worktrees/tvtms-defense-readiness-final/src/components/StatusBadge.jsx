export default function StatusBadge({ value }) {
  const text=String(value ?? 'unknown').replaceAll('_',' ');
  const tone = /unpaid|submitted|under review|partial|pending/i.test(text) ? 'warning' : /cancelled|rejected|inactive|voided|locked|error/i.test(text) ? 'danger' : /paid|active|approved|resolved|full|success/i.test(text) ? 'success' : 'neutral';
  return <span className={`badge badge-${tone}`}>{text}</span>;
}
