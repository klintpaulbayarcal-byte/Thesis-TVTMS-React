import { money } from '../utils/format';

export default function CitationViolations({ ticket, publicView = false }) {
  const items = Array.isArray(ticket?.violations) && ticket.violations.length
    ? ticket.violations
    : [{violation_code:ticket?.violation_code,violation_name:ticket?.violation_name,penalty_amount:ticket?.penalty_amount,same_violation_offense_count_at_issue:ticket?.same_violation_offense_count_at_issue}];
  return <div className="table-wrap"><table><caption>Issued violations</caption><thead><tr><th>Violation</th>{!publicView&&<th>Same-plate occurrence</th>}<th>Penalty</th></tr></thead><tbody>{items.map((item,index)=><tr key={`${item.violation_code}-${index}`}><td>{item.violation_code} · {item.violation_name}{!publicView&&item.description&&<p>{item.description}</p>}</td>{!publicView&&<td>{item.same_violation_offense_count_at_issue??'Not recorded'}</td>}<td>{money(item.penalty_amount)}</td></tr>)}</tbody></table></div>;
}
