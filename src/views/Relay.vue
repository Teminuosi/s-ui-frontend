<template>
  <RelayWizard
    v-model="wizardModal"
    :visible="wizardModal"
    @close="wizardModal = false"
  />
  <QrCode
    v-model="qrcode.visible"
    :visible="qrcode.visible"
    :id="qrcode.id"
    @close="qrcode.visible = false"
  />
  <v-dialog v-model="picker.visible" width="320">
    <v-card class="rounded-lg" :title="$t('pages.clients')">
      <v-divider></v-divider>
      <v-list density="compact" nav>
        <v-list-item v-for="c in picker.clients" :key="c.id" link @click="pickClient(c.id)">
          <template v-slot:prepend><v-icon icon="mdi-qrcode"></v-icon></template>
          <v-list-item-title>{{ c.name }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-card>
  </v-dialog>
  <ExportLinks
    v-model="exportModal"
    :visible="exportModal"
    @close="exportModal = false"
  />
  <v-dialog v-model="clearConfirm" width="380">
    <v-card class="rounded-lg" :title="$t('quickTemplate.clearAll')">
      <v-divider></v-divider>
      <v-card-text>{{ $t('relay.clearAllConfirm') }}</v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="success" variant="outlined" @click="clearConfirm = false">{{ $t('no') }}</v-btn>
        <v-btn color="error" variant="tonal" :loading="clearLoading" @click="clearAllRelays">{{ $t('yes') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
  <v-row justify="center" align="center">
    <v-col cols="auto">
      <v-btn color="primary" prepend-icon="mdi-transit-connection-variant" @click="wizardModal = true">{{ $t('relay.btn') }}</v-btn>
    </v-col>
    <v-col cols="auto">
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-export-variant" @click="exportModal = true">{{ $t('exportLinks.btn') }}</v-btn>
    </v-col>
    <v-col cols="auto" v-if="relays.length > 0">
      <v-btn color="error" variant="tonal" prepend-icon="mdi-delete-sweep" :loading="clearLoading" @click="clearConfirm = true">{{ $t('quickTemplate.clearAll') }}</v-btn>
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
              <v-chip v-for="t in r.inbounds" :key="t" size="x-small" label class="ma-1"
                :color="r.shadowed[t] ? 'warning' : undefined">{{ t }}</v-chip>
            </v-col>
          </v-row>
          <!-- 入口是原来的普通节点(不是向导新建的专用入口):它的所有用户都从这个落地出去 -->
          <v-alert v-if="r.shared.length > 0" type="error" density="compact" variant="tonal" class="mt-2" style="font-size: 0.8rem;">
            <div v-for="t in r.shared" :key="t">{{ $t('relay.sharedEntry', { inbound: t, n: usersOn(t), out: r.outbound }) }}</div>
          </v-alert>
          <v-alert v-if="Object.keys(r.shadowed).length > 0" type="warning" density="compact" variant="tonal" class="mt-2" style="font-size: 0.8rem;">
            {{ Object.keys(r.shadowed).length === r.inbounds.length ? $t('relay.shadowedAll') : $t('relay.shadowedSome') }}
            <div v-for="(owner, t) in r.shadowed" :key="t">{{ $t('relay.shadowedBy', { inbound: t, owner }) }}</div>
          </v-alert>
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
          <v-btn icon="mdi-qrcode" @click="showRelayQr(r)">
            <v-icon />
            <v-tooltip activator="parent" location="top" :text="$t('client.links')"></v-tooltip>
          </v-btn>
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
import QrCode from '@/layouts/modals/QrCode.vue'
import ExportLinks from '@/layouts/modals/ExportLinks.vue'
import { shadowedInbounds } from '@/plugins/relayUtil'
import { ENTRY_PREFIX, removeEntry } from '@/plugins/relayEntry'
import { computed, ref } from 'vue'

const wizardModal = ref(false)
const exportModal = ref(false)
const delOverlay = ref<boolean[]>([])
const delLoading = ref(false)
const clearConfirm = ref(false)
const clearLoading = ref(false)
const checkResults = ref<Record<string, any>>({})

// QR for a relay = the QR of the clients on its entry inbound(s) — that's the
// link end users actually connect with (the relay is transparent to them).
const qrcode = ref({ visible: false, id: 0 })
const picker = ref({ visible: false, clients: <any[]>[] })

const usersOn = (tag: string): number => {
  const ib = (Data().inbounds || []).find((i: any) => i.tag === tag)
  if (!ib) return 0
  return (Data().clients || []).filter((c: any) => Array.isArray(c.inbounds) && c.inbounds.includes(ib.id)).length
}

const clientsForRelay = (r: any): any[] => {
  const entryIds = (Data().inbounds || []).filter((i: any) => r.inbounds.includes(i.tag)).map((i: any) => i.id)
  return (Data().clients || []).filter((c: any) => Array.isArray(c.inbounds) && c.inbounds.some((id: number) => entryIds.includes(id)))
}
const showRelayQr = (r: any) => {
  const cls = clientsForRelay(r)
  if (cls.length === 0) return
  if (cls.length === 1) {
    qrcode.value.id = cls[0].id
    qrcode.value.visible = true
    return
  }
  picker.value.clients = cls
  picker.value.visible = true
}
const pickClient = (id: number) => {
  picker.value.visible = false
  qrcode.value.id = id
  qrcode.value.visible = true
}

// A "relay" = a route rule (action: route) whose outbound is a real outbound.
const relays = computed((): any[] => {
  const config: any = Data().config || {}
  const rules: any[] = config.route?.rules || []
  const obs: any[] = Data().outbounds || []
  const result: any[] = []
  rules.forEach((rule: any, i: number) => {
    if (rule && rule.action === 'route' && rule.outbound && rule.inbound) {
      const ob = obs.find((o: any) => o.tag === rule.outbound)
      if (ob) {
        result.push({
          outbound: ob.tag,
          type: ob.type,
          server: ob.server ?? '-',
          inbounds: Array.isArray(rule.inbound) ? rule.inbound : [rule.inbound],
          // entry inbounds an earlier rule already captured — this relay never fires for them
          shadowed: shadowedInbounds(rules, i),
          // entries that are ordinary, pre-existing nodes (not wizard-made)
          shared: (Array.isArray(rule.inbound) ? rule.inbound : [rule.inbound]).filter((t: string) => !t.startsWith(ENTRY_PREFIX)),
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
  // 3) The dedicated entry the wizard made for it (inbound + TLS + its own user).
  // Left behind it would silently go DIRECT — its users would keep "working"
  // but with this server's IP instead of the landing's.
  for (const t of r.inbounds) await removeEntry(t, r.outbound)
  delLoading.value = false
  delOverlay.value[index] = false
}

const clearAllRelays = async () => {
  clearLoading.value = true
  const snapshot = relays.value.map((r: any) => ({ outbound: r.outbound, inbounds: [...r.inbounds] }))
  const tags = snapshot.map((r: any) => r.outbound)
  // 1) Drop all relay route rules in one config save.
  const config = JSON.parse(JSON.stringify(Data().config || {}))
  if (config.route?.rules) {
    config.route.rules = config.route.rules.filter(
      (rule: any) => !(rule.action === 'route' && tags.includes(rule.outbound))
    )
  }
  await Data().save('config', 'set', config)
  // 2) Delete all the landing outbounds, and their dedicated entries.
  // (use the snapshot: once the rules are saved, `relays` recomputes to empty)
  for (const r of snapshot) {
    await Data().save('outbounds', 'del', r.outbound)
    for (const t of r.inbounds) await removeEntry(t, r.outbound)
  }
  clearLoading.value = false
  clearConfirm.value = false
}
</script>
