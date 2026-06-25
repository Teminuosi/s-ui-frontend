<template>
  <RelayWizard
    v-model="wizardModal"
    :visible="wizardModal"
    @close="wizardModal = false"
  />
  <v-row justify="center" align="center">
    <v-col cols="auto">
      <v-btn color="primary" prepend-icon="mdi-transit-connection-variant" @click="wizardModal = true">{{ $t('relay.btn') }}</v-btn>
    </v-col>
  </v-row>
  <v-row v-if="relays.length === 0">
    <v-col cols="12" style="text-align: center; opacity: 0.6; margin-top: 30px;">{{ $t('relay.empty') }}</v-col>
  </v-row>
  <v-row>
    <v-col cols="12" sm="6" md="4" lg="3" v-for="(r, index) in relays" :key="r.outbound">
      <v-card rounded="xl" elevation="5" min-width="200" :title="r.outbound">
        <v-card-subtitle style="margin-top: -15px;">{{ r.type }} · {{ r.server }}</v-card-subtitle>
        <v-card-text>
          <v-row>
            <v-col cols="4">{{ $t('relay.entry') }}</v-col>
            <v-col cols="8">
              <v-chip v-for="t in r.inbounds" :key="t" size="x-small" label class="ma-1">{{ t }}</v-chip>
            </v-col>
          </v-row>
          <v-row>
            <v-col cols="4">{{ $t('out.delay') }}</v-col>
            <v-col cols="8">
              <v-progress-circular v-if="checkResults[r.outbound]?.loading" indeterminate size="20" />
              <v-icon v-else icon="mdi-speedometer" @click="checkOutbound(r.outbound)">
                <v-tooltip activator="parent" location="top" :text="$t('actions.test')"></v-tooltip>
              </v-icon>
              <v-chip v-if="checkResults[r.outbound] && !checkResults[r.outbound].loading && checkResults[r.outbound].success"
                density="compact" size="small" color="success" variant="flat" class="ms-1">
                {{ checkResults[r.outbound].data?.Delay + $t('date.ms') }}
              </v-chip>
              <v-icon v-else-if="checkResults[r.outbound] && !checkResults[r.outbound].loading"
                size="small" color="error" icon="mdi-close-circle" class="ms-1" />
            </v-col>
          </v-row>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions style="padding: 0;">
          <v-btn icon="mdi-file-remove" color="warning" @click="delOverlay[index] = true">
            <v-icon />
            <v-tooltip activator="parent" location="top" :text="$t('actions.del')"></v-tooltip>
          </v-btn>
          <v-overlay v-model="delOverlay[index]" contained class="align-center justify-center">
            <v-card :title="$t('actions.del')" rounded="lg">
              <v-divider></v-divider>
              <v-card-text>{{ $t('relay.delConfirm') }}</v-card-text>
              <v-card-actions>
                <v-btn color="error" variant="outlined" :loading="delLoading" @click="delRelay(r, index)">{{ $t('yes') }}</v-btn>
                <v-btn color="success" variant="outlined" @click="delOverlay[index] = false">{{ $t('no') }}</v-btn>
              </v-card-actions>
            </v-card>
          </v-overlay>
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>

<script lang="ts" setup>
import Data from '@/store/modules/data'
import HttpUtils from '@/plugins/httputil'
import RelayWizard from '@/layouts/modals/RelayWizard.vue'
import { computed, ref } from 'vue'

const wizardModal = ref(false)
const delOverlay = ref<boolean[]>([])
const delLoading = ref(false)
const checkResults = ref<Record<string, any>>({})

// A "relay" = a route rule (action: route) whose outbound is a real outbound.
const relays = computed((): any[] => {
  const config: any = Data().config || {}
  const rules: any[] = config.route?.rules || []
  const obs: any[] = Data().outbounds || []
  const result: any[] = []
  rules.forEach((rule: any) => {
    if (rule && rule.action === 'route' && rule.outbound && rule.inbound) {
      const ob = obs.find((o: any) => o.tag === rule.outbound)
      if (ob) {
        result.push({
          outbound: ob.tag,
          type: ob.type,
          server: ob.server ?? '-',
          inbounds: Array.isArray(rule.inbound) ? rule.inbound : [rule.inbound],
        })
      }
    }
  })
  return result
})

const checkOutbound = async (tag: string) => {
  checkResults.value = { ...checkResults.value, [tag]: { loading: true, success: false } }
  const msg = await HttpUtils.get('api/checkOutbound', { tag })
  const success = msg.success && msg.obj?.OK
  checkResults.value = { ...checkResults.value, [tag]: { loading: false, success, data: msg.obj ?? null } }
}

const delRelay = async (r: any, index: number) => {
  delLoading.value = true
  // 1) Remove the route rule(s) routing to this landing, save config (restart).
  const config = JSON.parse(JSON.stringify(Data().config || {}))
  if (config.route?.rules) {
    config.route.rules = config.route.rules.filter(
      (rule: any) => !(rule.action === 'route' && rule.outbound === r.outbound)
    )
  }
  await Data().save('config', 'set', config)
  // 2) Delete the landing outbound.
  await Data().save('outbounds', 'del', r.outbound)
  delLoading.value = false
  delOverlay.value[index] = false
}
</script>
