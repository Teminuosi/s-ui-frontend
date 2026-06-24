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
      return [
        { title: i18n.global.t('quickTemplate.vlessReality'), value: 'vless-reality' },
        { title: i18n.global.t('quickTemplate.shadowsocks'), value: 'shadowsocks' },
        { title: i18n.global.t('quickTemplate.hysteria2'), value: 'hysteria2' },
      ]
    },
    selectedTemplate(): any {
      const map: any = {
        'vless-reality': { desc: i18n.global.t('quickTemplate.vlessRealityDesc') },
        'shadowsocks': { desc: i18n.global.t('quickTemplate.shadowsocksDesc') },
        'hysteria2': { desc: i18n.global.t('quickTemplate.hysteria2Desc') },
      }
      return map[this.selected]
    },
    needsSni(): boolean {
      return this.selected === 'vless-reality' || this.selected === 'hysteria2'
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
        if (this.selected === 'vless-reality') clientId = await this.buildVlessReality(port)
        else if (this.selected === 'shadowsocks') clientId = await this.buildShadowsocks(port)
        else if (this.selected === 'hysteria2') clientId = await this.buildHysteria2(port)
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

    // ---- templates -------------------------------------------------------
    async buildVlessReality(port: number): Promise<number | null> {
      const sni = (this.form.sni || 'www.microsoft.com').trim()
      const clientName = this.clientName()
      const tag = 'vless-reality-' + port
      if (!this.preflight(tag, clientName)) return null

      const kp = await this.genReality()
      if (!kp) { push.error({ message: i18n.global.t('error.invalidData') + ': keypair' }); return null }

      const tlsName = 'reality-' + port + '-' + RandomUtil.randomLowerAndNum(4)
      const tlsObj = {
        id: 0,
        name: tlsName,
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
      if (!await Data().save('tls', 'new', tlsObj)) return null
      const tlsId = Data().tlsConfigs.find((t: any) => t.name === tlsName)?.id
      if (!tlsId) { push.error({ message: i18n.global.t('error.invalidData') + ': TLS' }); return null }

      const inbound: any = createInbound('vless', { id: 0, tag, listen: '::', listen_port: port, tls_id: tlsId })
      inbound.addrs = []
      inbound.out_json = {}
      if (!await Data().save('inbounds', 'new', inbound)) {
        await Data().save('tls', 'del', tlsId)
        return null
      }
      const inboundId = Data().inbounds.find((i: any) => i.tag === tag)?.id
      if (!inboundId) { push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('objects.inbound') }); return null }

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
      if (!await Data().save('inbounds', 'new', inbound)) return null
      const inboundId = Data().inbounds.find((i: any) => i.tag === tag)?.id
      if (!inboundId) { push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('objects.inbound') }); return null }

      const client = this.baseClient(clientName, inboundId, {
        shadowsocks: { name: clientName, password: RandomUtil.randomShadowsocksPassword(32) },
      })
      if (!await Data().save('clients', 'new', client)) return null
      return this.newClientId(clientName)
    },

    async buildHysteria2(port: number): Promise<number | null> {
      const sni = (this.form.sni || 'www.bing.com').trim()
      const clientName = this.clientName()
      const tag = 'hysteria2-' + port
      if (!this.preflight(tag, clientName)) return null

      const ss = await this.genSelfSigned(sni)
      if (!ss) { push.error({ message: i18n.global.t('error.invalidData') + ': cert' }); return null }

      const tlsName = 'hy2-' + port + '-' + RandomUtil.randomLowerAndNum(4)
      const tlsObj = {
        id: 0,
        name: tlsName,
        server: { enabled: true, server_name: sni, certificate: ss.cert, key: ss.key },
        client: { enabled: true, insecure: true, server_name: sni },
      }
      if (!await Data().save('tls', 'new', tlsObj)) return null
      const tlsId = Data().tlsConfigs.find((t: any) => t.name === tlsName)?.id
      if (!tlsId) { push.error({ message: i18n.global.t('error.invalidData') + ': TLS' }); return null }

      const inbound: any = createInbound('hysteria2', { id: 0, tag, listen: '::', listen_port: port, tls_id: tlsId })
      inbound.addrs = []
      inbound.out_json = {}
      if (!await Data().save('inbounds', 'new', inbound)) {
        await Data().save('tls', 'del', tlsId)
        return null
      }
      const inboundId = Data().inbounds.find((i: any) => i.tag === tag)?.id
      if (!inboundId) { push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('objects.inbound') }); return null }

      const client = this.baseClient(clientName, inboundId, {
        hysteria2: { name: clientName, password: RandomUtil.randomSeq(10) },
      })
      if (!await Data().save('clients', 'new', client)) return null
      return this.newClientId(clientName)
    },
  },
}
</script>
