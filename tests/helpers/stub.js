/** Replaces object methods for the duration of one test and restores them afterwards. Returns the call log. */
export function stub(t, target, replacements) {
  const calls = {};
  for (const [name, implementation] of Object.entries(replacements)) {
    const original = target[name];
    calls[name] = [];
    target[name] = (...args) => {
      calls[name].push(args);
      return implementation(...args);
    };
    t.after(() => { target[name] = original; });
  }
  return calls;
}

/** A query-like object: supports .select/.limit/.lean chaining and can be awaited. */
export const query = (result) => {
  const chain = {
    select: () => chain, limit: () => chain, sort: () => chain, session: () => chain, lean: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};
