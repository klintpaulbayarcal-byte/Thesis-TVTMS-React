// Reject delayed results after a newer request, input edit, or form reset.
export function createRequestGate() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: token => token === generation,
    invalidate: () => ++generation,
  };
}
