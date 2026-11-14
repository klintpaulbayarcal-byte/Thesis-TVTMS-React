import { countViolations } from '../utils/plateCitationGroups';
import './PlateCitationGroup.css';

// Native details/summary provide keyboard-accessible expansion without changing
// citation data, payment status, or the lookup API.
export default function PlateCitationGroup({
  plate, citations = [], children, note = '', totalCitations,
}) {
  const count = totalCitations ?? citations.length;
  return <details className="plate-citation-group">
    <summary className="plate-citation-group__summary">
      <span className="plate-citation-group__identity">
        <strong>Vehicle Plate: {plate || 'Not recorded'}</strong>
        <small>One vehicle history · select to expand</small>
      </span>
      <span className="plate-citation-group__counts">
        <span>{count} {count === 1 ? 'citation' : 'citations'}</span>
        <span>{countViolations(citations)} {countViolations(citations) === 1 ? 'violation' : 'violations'} listed</span>
      </span>
      <span className="plate-citation-group__toggle" aria-hidden="true">▾</span>
    </summary>
    <div className="plate-citation-group__content">
      {note && <p className="plate-citation-group__note">{note}</p>}
      {children}
    </div>
  </details>;
}
