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
      ]
    },
    selectedTemplate(): any {
      const map: any = {
        'vless-reality': { desc: i18n.global.t('quickTemplate.vlessRealityDesc') },
      }
      return map[this.selected]
    },
    needsSni(): boolean {
      return this.selected === 'vless-reality'
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
      if (this.selected === 'vless-reality') {
        await this.createVlessReality()
      }
    },
    async createVlessReality() {
      const port = Number(this.form.port)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('in.port') })
        return
      }
      const sni = (this.form.sni || 'www.microsoft.com').trim()
      const clientName = (this.form.clientName || ('user-' + RandomUtil.randomLowerAndNum(6))).trim()
      const tag = 'vless-reality-' + port

      // Guard against duplicate inbound tag / client name before we start.
      if (Data().inbounds.some((i: any) => i.tag === tag) ||
          Data().clients.some((c: any) => c.name === clientName)) {
        push.error({ message: i18n.global.t('quickTemplate.failName') })
        return
      }

      this.loading = true
      try {
        // 1) Reality keypair
        const kp = await HttpUtils.get('api/keypairs', { k: 'reality' })
        if (!kp.success) return
        let priv = '', pub = ''
        kp.obj.forEach((line: string) => {
          if (line.startsWith('PrivateKey')) priv = line.substring(12)
          if (line.startsWith('PublicKey')) pub = line.substring(11)
        })
        if (!priv || !pub) {
          push.error({ message: i18n.global.t('error.invalidData') + ': keypair' })
          return
        }

        // 2) TLS record carrying the Reality config
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
              private_key: priv,
              short_id: RandomUtil.randomShortId(),
            },
          },
          client: {
            reality: { enabled: true, public_key: pub, short_id: '' },
            utls: { enabled: true, fingerprint: 'chrome' },
          },
        }
        if (!await Data().save('tls', 'new', tlsObj)) return
        const tlsId = Data().tlsConfigs.find((t: any) => t.name === tlsName)?.id
        if (!tlsId) {
          push.error({ message: i18n.global.t('error.invalidData') + ': TLS' })
          return
        }

        // 3) VLESS + Reality (Vision) inbound referencing the TLS record.
        // Note: flow / packet_encoding are per-user fields and live on the
        // client config, NOT on the inbound (the backend rejects unknown
        // inbound fields with a strict JSON decoder).
        const inbound: any = createInbound('vless', {
          id: 0,
          tag: tag,
          listen: '::',
          listen_port: port,
          tls_id: tlsId,
        })
        inbound.addrs = []
        inbound.out_json = {}
        if (!await Data().save('inbounds', 'new', inbound)) {
          // Roll back the orphan TLS record we just created.
          await Data().save('tls', 'del', tlsId)
          return
        }
        const inboundId = Data().inbounds.find((i: any) => i.tag === tag)?.id
        if (!inboundId) {
          push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('objects.inbound') })
          return
        }

        // 4) First client, linked to the new inbound
        const client = {
          enable: true,
          name: clientName,
          config: { vless: { name: clientName, uuid: RandomUtil.randomUUID(), flow: 'xtls-rprx-vision' } },
          inbounds: [inboundId],
          links: [],
          volume: 0,
          expiry: 0,
          up: 0,
          down: 0,
          desc: '',
          group: '',
        }
        if (!await Data().save('clients', 'new', client)) return

        push.success({ title: i18n.global.t('success'), message: i18n.global.t('quickTemplate.success') })
        const newClientId = Data().clients.find((c: any) => c.name === clientName)?.id
        this.closeModal()
        // Pop the QR code straight away so it can be scanned into a client app.
        if (newClientId) this.$emit('created', newClientId)
      } catch (e: any) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + (e?.toString() ?? '') })
      } finally {
        this.loading = false
      }
    },
  },
}
</script>
