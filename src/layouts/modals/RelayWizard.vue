<template>
  <v-dialog transition="dialog-bottom-transition" width="640">
    <v-card class="rounded-lg" :loading="loading">
      <v-card-title>{{ $t('relay.title') }}</v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <v-container style="padding: 0;">
          <p style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 12px;">{{ $t('relay.desc') }}</p>
          <v-row>
            <v-col cols="12">
              <v-textarea
                :label="$t('relay.link')"
                :hint="$t('relay.linkHint')"
                persistent-hint
                v-model="form.link"
                :rows="2"
                auto-grow>
              </v-textarea>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field
                :label="$t('relay.name')"
                v-model="form.name"
                hide-details>
              </v-text-field>
            </v-col>
            <v-col cols="12">
              <v-radio-group v-model="form.mode" hide-details density="compact">
                <v-radio value="new" :label="$t('relay.modeNew')"></v-radio>
                <v-radio value="existing" :label="$t('relay.modeExisting')"></v-radio>
              </v-radio-group>
            </v-col>
          </v-row>

          <!-- 默认:新建一个专用入口,原来的节点一个都不动 -->
          <v-row v-if="form.mode === 'new'">
            <v-col cols="12" sm="6">
              <v-select :label="$t('relay.entryProto')" :items="protoOptions" v-model="form.proto" hide-details></v-select>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field :label="$t('in.port')" type="number" v-model.number="form.port" hide-details></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-combobox :label="$t('quickTemplate.sni')" :items="sniPresets" v-model="form.sni" hide-details></v-combobox>
            </v-col>
            <v-col cols="12" sm="6">
              <v-text-field :label="$t('relay.newUser')" :hint="$t('relay.newUserHint')" persistent-hint v-model="form.userName"></v-text-field>
            </v-col>
            <v-col cols="12" sm="6">
              <v-select
                :label="$t('relay.alsoUsers')"
                :hint="$t('relay.alsoUsersHint')"
                persistent-hint
                :items="clientOptions"
                v-model="form.users"
                multiple
                chips
                closable-chips>
              </v-select>
            </v-col>
            <v-col cols="12">
              <v-alert type="info" density="compact" variant="tonal" style="font-size: 0.85rem;">{{ $t('relay.newNote') }}</v-alert>
            </v-col>
          </v-row>

          <!-- 高级:拿已有节点当入口 —— 这个节点的所有用户都会改从落地出网 -->
          <v-row v-else>
            <v-col cols="12">
              <v-select
                :label="$t('relay.entry')"
                :items="inboundOptions"
                v-model="form.inbounds"
                multiple
                chips
                hide-details>
              </v-select>
            </v-col>
            <v-col cols="12" v-if="form.inbounds.length > 0">
              <v-alert type="error" density="compact" variant="tonal" style="font-size: 0.85rem;">
                <b>{{ $t('relay.existingWarnTitle') }}</b>
                <div v-for="t in form.inbounds" :key="t">{{ $t('relay.existingWarnLine', { inbound: t, n: usersOn(t) }) }}</div>
                <div class="mt-1">{{ $t('relay.existingWarnHint') }}</div>
                <v-checkbox v-model="form.ack" :label="$t('relay.existingAck')" density="compact" hide-details class="mt-1"></v-checkbox>
              </v-alert>
            </v-col>
            <v-col cols="12" v-if="takenSelected.length > 0">
              <v-alert type="warning" density="compact" variant="tonal" style="font-size: 0.85rem;">
                {{ $t('relay.entryTaken') }}
                <div v-for="t in takenSelected" :key="t">{{ $t('relay.shadowedBy', { inbound: t, owner: owners[t] }) }}</div>
              </v-alert>
            </v-col>
          </v-row>

          <v-row v-if="result">
            <v-col cols="12">
              <v-alert :type="result.ok ? 'success' : 'warning'" density="compact" variant="tonal">
                {{ result.text }}
                <template v-if="result.links && result.links.length">
                  <div class="mt-2" style="font-size: 0.8rem;">{{ $t('relay.newLinks') }}</div>
                  <div v-for="l in result.links" :key="l" style="font-size: 0.75rem; word-break: break-all; font-family: monospace;" class="mt-1">{{ l }}</div>
                  <v-btn size="small" variant="tonal" class="mt-2" prepend-icon="mdi-content-copy" @click="copyLinks">{{ $t('copyToClipboard') }}</v-btn>
                </template>
              </v-alert>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="outlined" @click="closeModal">{{ $t('actions.close') }}</v-btn>
        <v-btn color="primary" variant="tonal" :loading="loading" @click="createRelay">{{ $t('relay.create') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Data from '@/store/modules/data'
import HttpUtils from '@/plugins/httputil'
import RandomUtil from '@/plugins/randomUtil'
import { i18n } from '@/locales'
import { push } from 'notivue'
import { inboundOwners } from '@/plugins/relayUtil'
import { ENTRY_PREFIX, ENTRY_PROTOCOLS, createEntryInbound, createRelayClient, freePort, uniqueClientName } from '@/plugins/relayEntry'

const emptyForm = () => ({
  link: '', name: '',
  // 'new' = build a dedicated entry inbound (default, touches nothing existing);
  // 'existing' = route existing node(s) — every user of them moves to the landing.
  mode: 'new',
  proto: 'vless-reality', port: 0, sni: 'www.apple.com', userName: '', users: <number[]>[],
  inbounds: <string[]>[], ack: false,
})

export default {
  props: ['visible'],
  emits: ['close'],
  data() {
    return {
      loading: false,
      form: emptyForm(),
      result: <any>null,
      sniPresets: ['www.apple.com', 'addons.mozilla.org', 'www.amazon.com', 'www.tesla.com', 'www.microsoft.com', 'www.bing.com'],
    }
  },
  watch: {
    visible(v: boolean) {
      if (v) this.reset()
    },
  },
  computed: {
    protoOptions(): any[] {
      const names: any = { 'vless-reality': 'vlessReality', hysteria2: 'hysteria2', tuic: 'tuic', trojan: 'trojan', anytls: 'anytls' }
      return ENTRY_PROTOCOLS.map((p) => ({ value: p, title: i18n.global.t('quickTemplate.' + names[p]) }))
    },
    clientOptions(): any[] {
      return (Data().clients || []).map((c: any) => ({ value: c.id, title: c.name }))
    },
    // Inbounds that can act as a relay entry (those that carry user traffic).
    inboundOptions(): any[] {
      const owners: Record<string, string> = (this as any).owners
      return (Data().inbounds || [])
        // dedicated entries of other relays are not "existing nodes" — hide them
        .filter((i: any) => i.tag && i.users && !i.tag.startsWith(ENTRY_PREFIX))
        .map((i: any) => ({
          value: i.tag,
          title: owners[i.tag] ? i.tag + ' ' + i18n.global.t('relay.entryTakenBy', { owner: owners[i.tag] }) : i.tag,
        }))
    },
    // inbound tag -> landing it already routes to. The new rule is appended
    // last and sing-box is first-match, so picking one of these does nothing.
    owners(): Record<string, string> {
      return inboundOwners(Data().config?.route?.rules || [])
    },
    takenSelected(): string[] {
      return this.form.inbounds.filter((t: string) => t in this.owners)
    },
  },
  methods: {
    reset() {
      this.form = emptyForm()
      this.form.port = freePort()
      this.form.userName = 'relay-' + RandomUtil.randomLowerAndNum(4)
      this.result = null
      this.loading = false
    },
    closeModal() {
      this.$emit('close')
    },
    usersOn(tag: string): number {
      const ib = (Data().inbounds || []).find((i: any) => i.tag === tag)
      if (!ib) return 0
      return (Data().clients || []).filter((c: any) => Array.isArray(c.inbounds) && c.inbounds.includes(ib.id)).length
    },
    copyLinks() {
      navigator.clipboard?.writeText((this.result?.links || []).join('\n'))
      push.success({ message: i18n.global.t('success') })
    },
    // Parse a SOCKS5 landing into a sing-box socks outbound, or return null.
    // Accepts: socks5://[user:pass@]host:port  and  IP:PORT[:USER:PASS]
    parseSocks(raw: string): any | null {
      const uri = raw.match(/^socks5?:\/\/(?:([^:@/]+):([^@/]+)@)?\[?([^\]:/]+)\]?:(\d{1,5})\/?.*$/i)
      if (uri) {
        const ob: any = { type: 'socks', server: uri[3], server_port: parseInt(uri[4]), version: '5' }
        if (uri[1]) { ob.username = decodeURIComponent(uri[1]); ob.password = decodeURIComponent(uri[2]) }
        return ob
      }
      const parts = raw.split(':')
      if ((parts.length === 2 || parts.length === 4) && /^(\d{1,3}\.){3}\d{1,3}$/.test(parts[0])) {
        const port = parseInt(parts[1])
        if (!Number.isInteger(port) || port < 1 || port > 65535) return null
        const ob: any = { type: 'socks', server: parts[0], server_port: port, version: '5' }
        if (parts.length === 4) { ob.username = parts[2]; ob.password = parts[3] }
        return ob
      }
      return null
    },
    async createRelay() {
      const t = (k: string) => i18n.global.t(k)
      const link = (this.form.link || '').trim()
      if (!link) {
        push.error({ message: t('error.invalidData') + ': ' + t('relay.link') })
        return
      }
      const isNew = this.form.mode === 'new'
      if (isNew) {
        const port = Number(this.form.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          push.error({ message: t('error.invalidData') + ': ' + t('in.port') })
          return
        }
        if ((Data().inbounds || []).some((i: any) => Number(i.listen_port) === port)) {
          push.error({ message: t('relay.portUsed') })
          return
        }
        if (!(this.form.userName || '').trim() && this.form.users.length === 0) {
          push.error({ message: t('relay.needUser') })
          return
        }
      } else {
        if (this.form.inbounds.length === 0) {
          push.error({ message: t('error.invalidData') + ': ' + t('relay.entry') })
          return
        }
        if (!this.form.ack) {
          push.error({ message: t('relay.existingNeedAck') })
          return
        }
      }
      this.loading = true
      this.result = null
      try {
        // 1) Build the landing outbound. SOCKS5 (raw IP:PORT[:USER:PASS] or
        // socks5:// URI) is handled here; everything else goes through the
        // backend share-link converter.
        let outbound: any = this.parseSocks(link)
        if (!outbound) {
          const conv = await HttpUtils.post('api/linkConvert', { link })
          if (!conv.success || !conv.obj || !conv.obj.type) {
            push.error({ message: t('relay.convertFail') })
            return
          }
          outbound = conv.obj
        }

        // 2) Pick a unique tag for the landing outbound.
        const base = (this.form.name || '').trim() || outbound.tag || ('relay-' + RandomUtil.randomLowerAndNum(6))
        const used = new Set<string>([
          ...(Data().outbounds || []).map((o: any) => o.tag),
          ...(Data().endpoints || []).map((e: any) => e.tag),
          ...(Data().inbounds || []).map((i: any) => i.tag),
        ])
        let tag = base
        let n = 1
        while (used.has(tag)) tag = base + '-' + (n++)
        outbound.tag = tag
        delete outbound.id

        // 3) Save the outbound.
        if (!await Data().save('outbounds', 'new', outbound)) return

        // 4) Entry: a brand-new inbound (+ its own user), or the picked nodes.
        let entries: string[] = this.form.inbounds
        let clientId: number | null = null
        if (isNew) {
          try {
            const entryTag = await createEntryInbound(this.form.proto, Number(this.form.port), (this.form.sni || 'www.apple.com').trim(), tag, this.form.users)
            entries = [entryTag]
            const uname = (this.form.userName || '').trim()
            if (uname) clientId = await createRelayClient(uniqueClientName(uname), entryTag, tag)
          } catch (e: any) {
            // Don't leave a dangling landing outbound behind.
            await Data().save('outbounds', 'del', tag)
            push.error({ message: t('relay.entryFail') + ': ' + (e?.message ?? '') })
            return
          }
        }

        // 5) Route rule: entry inbound(s) -> this landing outbound. Save the full
        // config (restarts the core: loads the outbound + route).
        const config = JSON.parse(JSON.stringify(Data().config || {}))
        if (!config.route) config.route = {}
        if (!Array.isArray(config.route.rules)) config.route.rules = []
        config.route.rules.push({ inbound: [...entries], action: 'route', outbound: tag })
        if (!await Data().save('config', 'set', config)) return

        // 6) Links of the relay's own user — what the end user imports.
        let links: string[] = []
        if (clientId) {
          const c: any = await Data().loadClients(clientId)
          links = (c?.links || []).filter((l: any) => l.type === 'local').map((l: any) => l.uri)
        }

        // 7) Test the landing connectivity.
        const test = await HttpUtils.get('api/checkOutbound', { tag })
        if (test.success && test.obj?.OK) {
          this.result = { ok: true, text: t('relay.testOk') + ': ' + test.obj.Delay + t('date.ms'), links }
          push.success({ title: t('success'), message: t('relay.success') })
        } else {
          this.result = { ok: false, text: t('relay.testFail') + ': ' + (test.obj?.Error || ''), links }
          push.success({ title: t('success'), message: t('relay.successButTest') })
        }
        this.form.link = ''
        this.form.port = freePort()
      } catch (e: any) {
        push.error({ message: t('error.invalidData') + ': ' + (e?.toString() ?? '') })
      } finally {
        this.loading = false
      }
    },
  },
}
</script>
