<template>
  <ServerEdit
    v-model="editModal.visible"
    :visible="editModal.visible"
    :server="editModal.server"
    @close="closeEdit"
  />
  <v-row justify="center" align="center">
    <v-col cols="auto">
      <v-btn color="primary" prepend-icon="mdi-server-plus" @click="showEdit(null)">{{ $t('server.add') }}</v-btn>
    </v-col>
    <v-col cols="auto" v-if="servers.length > 0">
      <v-btn color="primary" variant="tonal" prepend-icon="mdi-open-in-new" @click="openAll">{{ $t('server.openAll') }}</v-btn>
    </v-col>
  </v-row>
  <v-row v-if="servers.length === 0">
    <v-col cols="12" style="text-align: center; opacity: 0.6; margin-top: 30px;">{{ $t('server.empty') }}</v-col>
  </v-row>
  <v-row>
    <v-col cols="12" sm="6" md="4" lg="3" v-for="(item, index) in servers" :key="item.id">
      <v-card rounded="xl" elevation="5" min-width="200" :title="item.name" link @click="open(item)">
        <v-card-subtitle style="margin-top: -15px; overflow-wrap: anywhere;">{{ item.url }}</v-card-subtitle>
        <v-card-text v-if="item.remark" style="opacity: 0.75;">{{ item.remark }}</v-card-text>
        <v-divider></v-divider>
        <v-card-actions style="padding: 0;">
          <v-btn icon="mdi-open-in-new" color="primary" @click.stop="open(item)">
            <v-icon />
            <v-tooltip activator="parent" location="top" :text="$t('server.open')"></v-tooltip>
          </v-btn>
          <v-btn icon="mdi-file-edit" @click.stop="showEdit(item)">
            <v-icon />
            <v-tooltip activator="parent" location="top" :text="$t('actions.edit')"></v-tooltip>
          </v-btn>
          <v-btn icon="mdi-file-remove" color="warning" @click.stop="delOverlay[index] = true">
            <v-icon />
            <v-tooltip activator="parent" location="top" :text="$t('actions.del')"></v-tooltip>
          </v-btn>
          <v-overlay v-model="delOverlay[index]" contained class="align-center justify-center">
            <v-card :title="$t('actions.del')" rounded="lg">
              <v-divider></v-divider>
              <v-card-text>{{ $t('confirm') }}</v-card-text>
              <v-card-actions>
                <v-btn color="error" variant="outlined" @click.stop="delServer(item, index)">{{ $t('yes') }}</v-btn>
                <v-btn color="success" variant="outlined" @click.stop="delOverlay[index] = false">{{ $t('no') }}</v-btn>
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
import ServerEdit from '@/layouts/modals/ServerEdit.vue'
import { computed, ref } from 'vue'

const servers = computed((): any[] => {
  return Data().servers ?? []
})

const editModal = ref<{ visible: boolean, server: any }>({ visible: false, server: null })
const delOverlay = ref<boolean[]>([])

const showEdit = (server: any) => {
  editModal.value.server = server
  editModal.value.visible = true
}
const closeEdit = () => {
  editModal.value.visible = false
}

const open = (item: any) => {
  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer')
}
const openAll = () => {
  servers.value.forEach(s => { if (s.url) window.open(s.url, '_blank', 'noopener,noreferrer') })
}

const delServer = async (item: any, index: number) => {
  const success = await Data().save('servers', 'del', item.id)
  if (success) delOverlay.value[index] = false
}
</script>
