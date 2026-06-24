<template>
  <v-dialog transition="dialog-bottom-transition" width="700">
    <v-card class="rounded-lg" id="export-links-modal" :loading="loading">
      <v-card-title>
        <v-row>
          <v-col>{{ $t('exportLinks.title') }}</v-col>
          <v-spacer></v-spacer>
          <v-col cols="auto"><v-icon icon="mdi-close-box" @click="$emit('close')" /></v-col>
        </v-row>
      </v-card-title>
      <v-divider></v-divider>
      <v-card-text>
        <p style="font-size: 0.85rem; opacity: 0.8; margin-bottom: 10px;">{{ $t('exportLinks.desc') }}</p>
        <v-textarea
          v-model="text"
          :rows="12"
          readonly
          variant="outlined"
          hide-details
          :placeholder="$t('exportLinks.empty')"
          style="font-family: monospace; font-size: 0.78rem;">
        </v-textarea>
      </v-card-text>
      <v-card-actions>
        <span style="font-size: 0.8rem; opacity: 0.7; margin-inline-start: 12px;">{{ count }}</span>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="outlined" @click="$emit('close')">{{ $t('actions.close') }}</v-btn>
        <v-btn color="primary" variant="tonal" :disabled="!text" @click="copyAll">{{ $t('exportLinks.copy') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts">
import Data from '@/store/modules/data'
import HttpUtils from '@/plugins/httputil'
import Clipboard from 'clipboard'
import { i18n } from '@/locales'
import { push } from 'notivue'

export default {
  props: ['visible'],
  emits: ['close'],
  data() {
    return {
      loading: false,
      text: '',
      count: 0,
    }
  },
  watch: {
    visible(v: boolean) {
      if (v) this.load()
    },
  },
  methods: {
    async load() {
      this.loading = true
      this.text = ''
      this.count = 0
      const ids = Data().clients.map((c: any) => c.id).filter((x: any) => x)
      if (ids.length === 0) {
        this.loading = false
        return
      }
      // One request: getById with a comma-separated id list returns full
      // client rows (including the pre-generated share links).
      const msg = await HttpUtils.get('api/clients', { id: ids.join(',') })
      if (msg.success && msg.obj?.clients) {
        const uris: string[] = []
        msg.obj.clients.forEach((c: any) => {
          (c.links || []).forEach((l: any) => {
            if (l.type !== 'sub' && l.uri) uris.push(l.uri)
          })
        })
        this.text = uris.join('\n')
        this.count = uris.length
      }
      this.loading = false
    },
    copyAll() {
      const txt = this.text
      const hiddenButton = document.createElement('button')
      hiddenButton.className = 'export-clipboard-btn'
      document.body.appendChild(hiddenButton)

      const clipboard = new Clipboard('.export-clipboard-btn', {
        text: () => txt,
        container: document.getElementById('export-links-modal') ?? undefined,
      })

      clipboard.on('success', () => {
        clipboard.destroy()
        push.success({
          message: i18n.global.t('success') + ': ' + i18n.global.t('copyToClipboard'),
          duration: 3000,
        })
      })
      clipboard.on('error', () => {
        clipboard.destroy()
        push.error({
          message: i18n.global.t('failed') + ': ' + i18n.global.t('copyToClipboard'),
          duration: 3000,
        })
      })

      hiddenButton.click()
      document.body.removeChild(hiddenButton)
    },
  },
}
</script>
