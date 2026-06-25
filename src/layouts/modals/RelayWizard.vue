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
            <v-col cols="12" sm="6">
              <v-select
                :label="$t('relay.entry')"
                :items="inboundOptions"
                v-model="form.inbounds"
                multiple
                chips
                hide-details>
              </v-select>
            </v-col>
          </v-row>
          <v-row v-if="result">
            <v-col cols="12">
              <v-alert :type="result.ok ? 'success' : 'warning'" density="compact" variant="tonal">
                {{ result.text }}
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

export default {
  props: ['visible'],
  emits: ['close'],
  data() {
    return {
      loading: false,
      form: { link: '', name: '', inbounds: <string[]>[] },
      result: <any>null,
    }
  },
  watch: {
    visible(v: boolean) {
      if (v) this.reset()
    },
  },
  computed: {
    // Inbounds that can act as a relay entry (those that carry user traffic).
    inboundOptions(): string[] {
      return (Data().inbounds || [])
        .filter((i: any) => i.tag && i.users)
        .map((i: any) => i.tag)
    },
  },
  methods: {
    reset() {
      this.form = { link: '', name: '', inbounds: [] }
      this.result = null
      this.loading = false
    },
    closeModal() {
      this.$emit('close')
    },
    async createRelay() {
      const link = (this.form.link || '').trim()
      if (!link) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('relay.link') })
        return
      }
      if (this.form.inbounds.length === 0) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + i18n.global.t('relay.entry') })
        return
      }
      this.loading = true
      this.result = null
      try {
        // 1) Convert the share link into an outbound.
        const conv = await HttpUtils.post('api/linkConvert', { link })
        if (!conv.success || !conv.obj || !conv.obj.type) {
          push.error({ message: i18n.global.t('relay.convertFail') })
          return
        }
        const outbound: any = conv.obj

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

        // 4) Add a route rule: entry inbound(s) -> this landing outbound.
        const config = JSON.parse(JSON.stringify(Data().config || {}))
        if (!config.route) config.route = {}
        if (!Array.isArray(config.route.rules)) config.route.rules = []
        config.route.rules.push({ inbound: [...this.form.inbounds], action: 'route', outbound: tag })

        // 5) Save the full config (restarts the core: loads the outbound + route).
        if (!await Data().save('config', 'set', config)) return

        // 6) Test the landing connectivity.
        const test = await HttpUtils.get('api/checkOutbound', { tag })
        if (test.success && test.obj?.OK) {
          this.result = { ok: true, text: i18n.global.t('relay.testOk') + ': ' + test.obj.Delay + i18n.global.t('date.ms') }
          push.success({ title: i18n.global.t('success'), message: i18n.global.t('relay.success') })
        } else {
          this.result = { ok: false, text: i18n.global.t('relay.testFail') + ': ' + (test.obj?.Error || '') }
          push.success({ title: i18n.global.t('success'), message: i18n.global.t('relay.successButTest') })
        }
        this.form.link = ''
      } catch (e: any) {
        push.error({ message: i18n.global.t('error.invalidData') + ': ' + (e?.toString() ?? '') })
      } finally {
        this.loading = false
      }
    },
  },
}
</script>
