<template>
  <div>
    <div class="tree-node" :class="{ active: currentBucket === bucket && currentPath === folder.prefix }" :title="folder.name" @click="$emit('navigate', folder.prefix)">
      <span class="expand-icon" @click.stop="$emit('toggle-expand', folder.prefix)">
        <Icon :name="isExpanded ? 'chevron-down' : 'chevron-right'" :size="12" />
      </span>
      <span class="icon"><Icon name="folder" :size="16" /></span>
      <span>{{ folder.name }}</span>
    </div>
    <div v-if="isExpanded && subFolders.length" class="tree-children">
      <tree-node
        v-for="sub in subFolders"
        :key="sub.prefix"
        :folder="sub"
        :bucket="bucket"
        :current-path="currentPath"
        :current-bucket="currentBucket"
        :expanded-folders="expandedFolders"
        @navigate="$emit('navigate', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import r2client from '../api/r2client.js'
import Icon from './Icon.vue'

const props = defineProps({
  folder: Object,
  bucket: String,
  currentPath: String,
  currentBucket: String,
  expandedFolders: Set,
})

const emit = defineEmits(['navigate', 'toggle-expand'])

const subFolders = ref([])
const loadingSub = ref(false)

const isExpanded = computed(() => props.expandedFolders.has(props.folder.prefix))

watch(isExpanded, async (val) => {
  if (val && !subFolders.value.length && !loadingSub.value && props.bucket) {
    loadingSub.value = true
    try {
      const data = await r2client.listObjects(props.bucket, props.folder.prefix, '/')
      subFolders.value = (data.prefixes || []).map(p => ({
        prefix: p,
        name: p.replace(props.folder.prefix, '').replace(/\/$/, ''),
      }))
    } catch (e) { console.error(e) }
    finally { loadingSub.value = false }
  }
}, { immediate: true })
</script>

<style scoped>
.tree-children { padding-left: 16px; }
</style>
