<template>
  <v-dialog transition="dialog-bottom-transition" width="600">
    <v-card class="rounded-lg" :loading="loading">
      <v-card-title>{{ $t('quickTemplate.title') }}</v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-container style="padding: 0;">
          <v-row>
            <v-col cols="12">
              <v-select
                hide-details
                :label="$t('quickTemplate.pick')"
                :items="templates"
                v-model="selected">
              </v-select>
            </v-col>
          </v-row>
          <v-row v-if="selectedTemplate">
            <v-col cols="12">
              <v-card variant="tonal" color="primary">
                <v-card-text style="font-size: 0.85rem;">{{ selectedTemplate.desc }}</v-card-text>
              </v-card>
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="12" sm="6">
              <v-text-field
                :label="$t('client.name')"
                v-model="form.clientName"
                hide-details>
              </v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                :label="$t('in.port')"
                type="number"
                v-model.number="form.port"
                hide-details>
              </v-text-field>
            </v-col>
            <v-col cols="12" v-if="needsSni">
              <v-text-field
                :label="$t('quickTemplate.sni')"
                :hint="$t('quickTemplate.sniHint')"
                persistent-hint
                v-model="form.sni">
              </v-text-field>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="outlined" @click="closeModal">
          {{ $t('actions.close') }}
        </v-btn>
        <v-btn color="primary" variant="tonal" :loading="loading" @click="create">
          {{ $t('quickTemplate.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Data from '@/store/modules/data'
import HttpUtils from '@/plugins/httputil'
import RandomUtil from '@/plugins/randomUtil'
import { createInbound } from '@/types/inbounds'
import { i18n } from '@/locales'
import { push } from 'notivue'

export default {
  props: ['visible'],
  emits: ['close', 'created'],
  data() {
    return {
      loading: false,
      selected: 'vless-reality',
      form: {
        clientName: '',
        port: 0,
        sni: 'www.microsoft.com',
      },
    }
  },
  watch: {
    visible(v: boolean) {
      if (v) this.reset()
    },
  },
  computed: {
    templates() {
      const t = (k: string) => i18n.global.t('quickTemplate.' + k)
      return [
        { title: t('vlessReality'), value: 'vless-reality' },
        { title: t('shadowsocks'), value: 'shadowsocks' },
        { title: t('hysteria2'), value: 'hysteria2' },
        { title: t('tuic'), value: 'tuic' },
        { title: t('trojan'), value: 'trojan' },
        { title: t('vmess'), value: 'vmess' },
        { title: t('anytls'), value: 'anytls' },
      ]
    },
    selectedTemplate(): any {
      const desc = i18n.global.t('quickTemplate.' + this.descKey)
      return { desc }
    },
    descKey(): string {
      const map: any = {
        'vless-reality': 'vlessRealityDesc',
        'shadowsocks': 'shadowsocksDesc',
        'hysteria2': 'hysteria2Desc',
        'tuic': 'tuicDesc',
        'trojan': 'trojanDesc',
        'vmess': 'vmessDesc',
        'anytls': 'anytlsDesc',
      }
      return map[this.selected]
    },
    needsSni(): boolean {
      // Every template except Shadowsocks needs a domain (Reality handshake
      // target for VLESS, certificate name for the self-signed ones).
      return this.selected !== 'shadowsocks'
    },
  },
  methods: {
    reset() {
      this.selected = 'vless-reality'
      this.form = {
        clientName: 'user-' + RandomUtil.randomLowerAndNum(6),
        port: RandomUtil.randomIntRange(10000, 60000),
        sni: 'www.microsoft.com',
      }
      this.loading = false
    },
    closeModal() {
      this.$emit('close')
    },
    async create() {
      const port = Number(this.form.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('in.port') })
        return
      }
      this.loading = true
      try {
        let clientId: number | null = null
        switch (this.selected) {
          case 'vless-reality': clientId = await this.buildVlessReality(port); break
          case 'shadowsocks': clientId = await this.buildShadowsocks(port); break
          case 'hysteria2': clientId = await this.buildSelfSigned(port, 'hysteria2', 'hysteria2', (n) => ({ hysteria2: { name: n, password: RandomUtil.randomSeq(10) } })); break
          case 'tuic': clientId = await this.buildSelfSigned(port, 'tuic', 'tuic', (n) => ({ tuic: { name: n, uuid: RandomUtil.randomUUID(), password: RandomUtil.randomSeq(10) } })); break
          case 'trojan': clientId = await this.buildSelfSigned(port, 'trojan', 'trojan', (n) => ({ trojan: { name: n, password: RandomUtil.randomSeq(10) } })); break
          case 'vmess': clientId = await this.buildSelfSigned(port, 'vmess', 'vmess', (n) => ({ vmess: { name: n, uuid: RandomUtil.randomUUID(), alterId: 0 } })); break
          case 'anytls': clientId = await this.buildSelfSigned(port, 'anytls', 'anytls', (n) => ({ anytls: { name: n, password: RandomUtil.randomSeq(10) } })); break
        }
        if (clientId) {
          push.success({ title: i18n.global.t('success'), message: i18n.global.t('quickTemplate.success') })
          this.closeModal()
          // Pop the QR straight away so it can be scanned into a client app.
          this.$emit('created', clientId)
        }
      } catch (e: any) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + (e?.toString() ?? '') })
      } finally {
        this.loading = false
      }
    },

    // ---- helpers ---------------------------------------------------------
    clientName(): string {
      return (this.form.clientName || ('user-' + RandomUtil.randomLowerAndNum(6))).trim()
    },
    err(detail: string) {
      push.error({ message: i18n.global.t('error.invalidData') + ': ' + detail })
    },
    preflight(tag: string, clientName: string): boolean {
      if (Data().inbounds.some((i: any) => i.tag === tag) ||
          Data().clients.some((c: any) => c.name === clientName)) {
        push.error({ message: i18n.global.t('quickTemplate.failName') })
        return false
      }
      return true
    },
    newClientId(clientName: string): number | null {
      return Data().clients.find((c: any) => c.name === clientName)?.id ?? null
    },
    baseClient(clientName: string, inboundId: number, config: any) {
      return {
        enable: true,
        name: clientName,
        config: config,
        inbounds: [inboundId],
        links: [],
        volume: 0,
        expiry: 0,
        up: 0,
        down: 0,
        desc: '',
        group: '',
      }
    },
    async genReality(): Promise<{ priv: string, pub: string } | null> {
      const kp = await HttpUtils.get('api/keypairs', { k: 'reality' })
      if (!kp.success) return null
      let priv = '', pub = ''
      kp.obj.forEach((line: string) => {
        if (line.startsWith('PrivateKey')) priv = line.substring(12)
        if (line.startsWith('PublicKey')) pub = line.substring(11)
      })
      return (priv && pub) ? { priv, pub } : null
    },
    async genSelfSigned(sni: string): Promise<{ cert: string[], key: string[] } | null> {
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
    },
    // Save TLS, look its id up by name. Returns id or null.
    async saveTls(tlsObj: any): Promise<number | null> {
      if (!await Data().save('tls', 'new', tlsObj)) return null
      return Data().tlsConfigs.find((t: any) => t.name === tlsObj.name)?.id ?? null
    },
    // Save inbound (rolling back the TLS if it fails), look id up by tag.
    async saveInbound(inbound: any, rollbackTlsId?: number): Promise<number | null> {
      if (!await Data().save('inbounds', 'new', inbound)) {
        if (rollbackTlsId) await Data().save('tls', 'del', rollbackTlsId)
        return null
      }
      return Data().inbounds.find((i: any) => i.tag === inbound.tag)?.id ?? null
    },

    // ---- templates -------------------------------------------------------
    async buildVlessReality(port: number): Promise<number | null> {
      const sni = (this.form.sni || 'www.microsoft.com').trim()
      const clientName = this.clientName()
      const tag = 'vless-reality-' + port
      if (!this.preflight(tag, clientName)) return null

      const kp = await this.genReality()
      if (!kp) { this.err('keypair'); return null }

      const tlsObj = {
        id: 0,
        name: 'reality-' + port + '-' + RandomUtil.randomLowerAndNum(4),
        server: {
          enabled: true,
          server_name: sni,
          reality: {
            enabled: true,
            handshake: { server: sni, server_port: 443 },
            private_key: kp.priv,
            short_id: RandomUtil.randomShortId(),
          },
        },
        client: {
          reality: { enabled: true, public_key: kp.pub, short_id: '' },
          utls: { enabled: true, fingerprint: 'chrome' },
        },
      }
      const tlsId = await this.saveTls(tlsObj)
      if (!tlsId) { this.err('TLS'); return null }

      const inbound: any = createInbound('vless', { id: 0, tag, listen: '::', listen_port: port, tls_id: tlsId })
      inbound.addrs = []
      inbound.out_json = {}
      const inboundId = await this.saveInbound(inbound, tlsId)
      if (!inboundId) { this.err(i18n.global.t('objects.inbound')); return null }

      const client = this.baseClient(clientName, inboundId, {
        vless: { name: clientName, uuid: RandomUtil.randomUUID(), flow: 'xtls-rprx-vision' },
      })
      if (!await Data().save('clients', 'new', client)) return null
      return this.newClientId(clientName)
    },

    async buildShadowsocks(port: number): Promise<number | null> {
      const clientName = this.clientName()
      const tag = 'shadowsocks-' + port
      if (!this.preflight(tag, clientName)) return null

      // Shadowsocks 2022 needs no certificate. Server key + per-user key.
      const inbound: any = createInbound('shadowsocks', { id: 0, tag, listen: '::', listen_port: port })
      inbound.method = '2022-blake3-aes-256-gcm'
      inbound.password = RandomUtil.randomShadowsocksPassword(32)
      inbound.addrs = []
      inbound.out_json = {}
      const inboundId = await this.saveInbound(inbound)
      if (!inboundId) { this.err(i18n.global.t('objects.inbound')); return null }

      const client = this.baseClient(clientName, inboundId, {
        shadowsocks: { name: clientName, password: RandomUtil.randomShadowsocksPassword(32) },
      })
      if (!await Data().save('clients', 'new', client)) return null
      return this.newClientId(clientName)
    },

    // Generic builder for TLS protocols using an auto self-signed certificate
    // (Hysteria2 / TUIC / Trojan / VMess / AnyTLS).
    async buildSelfSigned(port: number, type: string, tagPrefix: string, configFn: (name: string) => any): Promise<number | null> {
      const sni = (this.form.sni || 'www.bing.com').trim()
      const clientName = this.clientName()
      const tag = tagPrefix + '-' + port
      if (!this.preflight(tag, clientName)) return null

      const ss = await this.genSelfSigned(sni)
      if (!ss) { this.err('cert'); return null }

      const tlsObj = {
        id: 0,
        name: tagPrefix + '-' + port + '-' + RandomUtil.randomLowerAndNum(4),
        server: { enabled: true, server_name: sni, certificate: ss.cert, key: ss.key },
        client: { enabled: true, insecure: true, server_name: sni },
      }
      const tlsId = await this.saveTls(tlsObj)
      if (!tlsId) { this.err('TLS'); return null }

      const inbound: any = createInbound(type, { id: 0, tag, listen: '::', listen_port: port, tls_id: tlsId })
      inbound.addrs = []
      inbound.out_json = {}
      const inboundId = await this.saveInbound(inbound, tlsId)
      if (!inboundId) { this.err(i18n.global.t('objects.inbound')); return null }

      const client = this.baseClient(clientName, inboundId, configFn(clientName))
      if (!await Data().save('clients', 'new', client)) return null
      return this.newClientId(clientName)
    },
  },
}
</script>
