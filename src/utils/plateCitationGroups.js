// Presentation-only grouping: never merges or mutates underlying citation records.
export const normalizePlateKey = value => String(value ?? '').trim().toUpperCase().replace(/[\s-]/g, '');

export const violationCount = citation => Array.isArray(citation?.violations) && citation.violations.length
  ? citation.violations.length : 1;

export const countViolations = citations => (Array.isArray(citations) ? citations : [])
  .reduce((total, citation) => total + violationCount(citation), 0);

export const groupCitationsByPlate = citations => {
  const groups = new Map();
  (Array.isArray(citations) ? citations : []).forEach((citation, index) => {
    // A missing plate must not merge unrelated citations.
    const plate = normalizePlateKey(citation.plate_at_issue || citation.plate_number);
    const key = plate ? `plate:${plate}` : `unknown:${index}`;
    if (!groups.has(key)) groups.set(key, {plate, citations: []});
    groups.get(key).citations.push(citation);
  });
  return [...groups.values()];
};
