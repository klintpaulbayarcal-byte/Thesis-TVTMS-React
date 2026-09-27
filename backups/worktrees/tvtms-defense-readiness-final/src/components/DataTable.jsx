import LoadingSpinner from './LoadingSpinner';
export default function DataTable({ columns, rows = [], loading=false, empty='No records found.', keyField='id', onRowClick }) {
  if (loading) return <LoadingSpinner />;
  return <div className="table-container table-wrap"><table className="data-table"><thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row,i) => <tr key={row[keyField] ?? i} className={onRowClick ? 'clickable-row' : ''} onClick={() => onRowClick?.(row)}>{columns.map(c => <td key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}</tr>) : <tr><td className="empty-cell" colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>;
}
