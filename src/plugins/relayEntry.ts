// Build a DEDICATED entry inbound for a relay.
//
// Why: the relay route rule redirects ALL traffic of its entry inbound to the
// landing. Reusing an existing node as the entry silently moves every user of
// that node to the landing IP ("I added a Mexico relay and my old VLESS became
// Mexico too"). A fresh inbound per relay leaves existing nodes untouched —
// the same thing the 3x-ui relay wizard does.
//
// Same building blocks as QuickTemplate.vue (kept separate on purpose so the
// one-click node templates are not touched by relay changes).
import Data from '@/store/modules/data'
import HttpUtils from '@/plugins/httputil'
import RandomUtil from '@/plugins/randomUtil'
import { createInbound } from '@/types/inbounds'
import { randomConfigs } from '@/types/clients'

// Tag prefix of wizard-made entries. Relay.vue relies on it to tell a dedicated
// entry (safe to delete together with the relay) from a shared, pre-existing node.
export const ENTRY_PREFIX = 'relay-in-'
// Client.desc marker of the user the wizard created for one relay.
export const relayClientDesc = (outboundTag: string) => 'relay:' + outboundTag

export const ENTRY_PROTOCOLS = ['vless-reality', 'hysteria2', 'tuic', 'trojan', 'anytls']

async function genReality(): Promise<{ priv: string, pub: string } | null> {
  const kp = await HttpUtils.get('api/keypairs', { k: 'reality' })
  if (!kp.success) return null
  let priv = '', pub = ''
  kp.obj.forEach((line: string) => {
    if (line.startsWith('PrivateKey')) priv = line.substring(12)
    if (line.startsWith('PublicKey')) pub = line.substring(11)
  })
  return (priv && pub) ? { priv, pub } : null
}

async function genSelfSigned(sni: string): Promise<{ cert: string[], key: string[] } | null> {
  const msg = await HttpUtils.get('api/keypairs', { k: 'tls', o: sni || "''" })
  if (!msg.success || !msg.obj || msg.obj.length === 0) return null
  const key: string[] = [], cert: string[] = []
  let inKey = false, inCert = false
  msg.obj.forEach((line: string) => {
    if (line === '-----BEGIN PRIVATE KEY-----') { inKey = true; inCert = false; key.push(line) }
    else if (line === '-----END PRIVATE KEY-----') { inKey = false; key.push(line) }
    else if (line === '-----BEGIN CERTIFICATE-----') { inCert = true; inKey = false; cert.push(line) }
    else if (line === '-----END CERTIFICATE-----') { inCert = false; cert.push(line) }
    else if (inKey) key.push(line)
    else if (inCert) cert.push(line)
  })
  return (key.length && cert.length) ? { cert, key } : null
}

async function saveTls(tlsObj: any): Promise<number | null> {
  if (!await Data().save('tls', 'new', tlsObj)) return null
  return Data().tlsConfigs.find((t: any) => t.name === tlsObj.name)?.id ?? null
}

export const freePort = (): number => {
  const used = new Set<number>((Data().inbounds || []).map((i: any) => i.listen_port))
  let p = 0
  do { p = RandomUtil.randomIntRange(10000, 60000) } while (used.has(p))
  return p
}

export const uniqueClientName = (base: string): string => {
  const names = new Set<string>((Data().clients || []).map((c: any) => c.name))
  let name = base, n = 1
  while (names.has(name)) name = base + '-' + (n++)
  return name
}

// Creates TLS (if needed) + inbound, attaching existing users `initUsers`.
// Returns the new inbound's tag, or throws with a short reason. On failure the
// TLS it created is removed again, so nothing half-made is left behind.
export async function createEntryInbound(proto: string, port: number, sni: string, outboundTag: string, initUsers: number[]): Promise<string> {
  const tag = ENTRY_PREFIX + outboundTag
  if ((Data().inbounds || []).some((i: any) => i.tag === tag)) throw new Error('tag ' + tag)
  let tlsObj: any
  let type = proto
  if (proto === 'vless-reality') {
    type = 'vless'
    const kp = await genReality()
    if (!kp) throw new Error('keypair')
    const sid = RandomUtil.randomShortId().find((s: string) => s.length >= 2) || 'a1b2c3d4'
    tlsObj = {
      id: 0,
      name: tag + '-' + RandomUtil.randomLowerAndNum(4),
      server: {
        enabled: true,
        server_name: sni,
        reality: { enabled: true, handshake: { server: sni, server_port: 443 }, private_key: kp.priv, short_id: [sid] },
      },
      client: {
        reality: { enabled: true, public_key: kp.pub, short_id: sid },
        utls: { enabled: true, fingerprint: 'chrome' },
      },
    }
  } else {
    const ss = await genSelfSigned(sni)
    if (!ss) throw new Error('cert')
    const server: any = { enabled: true, server_name: sni, certificate: ss.cert, key: ss.key }
    // TUIC needs an ALPN or the handshake fails (see QuickTemplate.vue)
    if (proto === 'tuic') server.alpn = ['h3']
    tlsObj = { id: 0, name: tag + '-' + RandomUtil.randomLowerAndNum(4), server, client: { enabled: true, insecure: true, server_name: sni } }
  }
  const tlsId = await saveTls(tlsObj)
  if (!tlsId) throw new Error('TLS')
  const inbound: any = createInbound(type, { id: 0, tag, listen: '::', listen_port: port, tls_id: tlsId })
  inbound.addrs = []
  inbound.out_json = {}
  if (!await Data().save('inbounds', 'new', inbound, initUsers.length ? initUsers : undefined)) {
    await Data().save('tls', 'del', tlsId)
    throw new Error('inbound')
  }
  return tag
}

// A user just for this relay, on the new entry only. Returns its id.
export async function createRelayClient(name: string, inboundTag: string, outboundTag: string): Promise<number | null> {
  const ib = (Data().inbounds || []).find((i: any) => i.tag === inboundTag)
  if (!ib) return null
  const client = {
    enable: true, name, config: randomConfigs(name), inbounds: [ib.id], links: [],
    volume: 0, expiry: 0, up: 0, down: 0, desc: relayClientDesc(outboundTag), group: '',
  }
  if (!await Data().save('clients', 'new', client)) return null
  return (Data().clients || []).find((c: any) => c.name === name)?.id ?? null
}

// Undo a dedicated entry: the inbound, its TLS, and the relay's own user if it
// is left with no inbounds. Users that were merely attached keep existing.
export async function removeEntry(inboundTag: string, outboundTag: string) {
  if (!inboundTag.startsWith(ENTRY_PREFIX)) return
  const ib = (Data().inbounds || []).find((i: any) => i.tag === inboundTag)
  if (!ib) return
  const tlsId = ib.tls_id
  await Data().save('inbounds', 'del', inboundTag)
  if (tlsId && !(Data().inbounds || []).some((i: any) => i.tls_id === tlsId)) await Data().save('tls', 'del', tlsId)
  for (const c of (Data().clients || []).filter((c: any) => c.desc === relayClientDesc(outboundTag))) {
    if (!c.inbounds || c.inbounds.length === 0) await Data().save('clients', 'del', c.id)
  }
}
