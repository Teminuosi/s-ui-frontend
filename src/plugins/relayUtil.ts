// sing-box route rules are first-match: once an inbound is claimed by an
// earlier rule that matches on the inbound alone, any later relay for the same
// inbound never fires — every node on it exits through the first landing
// (the "three relays, same landing IP" report). These helpers surface that.

// A rule that matches purely on inbound (no domain/ip/etc. conditions) and
// routes it somewhere — i.e. it captures ALL traffic of those inbounds.
const isInboundOnlyRoute = (rule: any): boolean =>
  !!rule && rule.action === 'route' && !!rule.outbound && !!rule.inbound &&
  Object.keys(rule).every((k) => ['inbound', 'action', 'outbound'].includes(k))

const toArr = (v: any): string[] => (Array.isArray(v) ? v : [v])

// inbound tag -> outbound tag of the FIRST rule that captures it.
export const inboundOwners = (rules: any[]): Record<string, string> => {
  const owners: Record<string, string> = {}
  for (const rule of rules || []) {
    if (!isInboundOnlyRoute(rule)) continue
    for (const t of toArr(rule.inbound)) if (!(t in owners)) owners[t] = rule.outbound
  }
  return owners
}

// For the rule at `index`: its inbounds that an earlier rule already captured,
// as { inbound tag: earlier outbound tag }.
export const shadowedInbounds = (rules: any[], index: number): Record<string, string> => {
  const owners = inboundOwners((rules || []).slice(0, index))
  const res: Record<string, string> = {}
  const self = rules[index]?.outbound
  for (const t of toArr(rules[index]?.inbound)) if (t in owners && owners[t] !== self) res[t] = owners[t]
  return res
}
