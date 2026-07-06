<template>
  <svg
    class="fluent-icon"
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    v-html="paths"
  />
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
})

// Windows 11 Fluent 风格图标（简化几何，单色/双色，线条+填充）
const icons = {
  // 导航
  back: '<path d="m7.333 4 -4 4 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 8h8.667" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  forward: '<path d="m8.667 4 4 4 -4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.333 8h8.667" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  up: '<path d="m4 8.667 4 -4 4 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 4.667v8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
  refresh: '<path d="M13.333 4v2.667h-2.667" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/><path d="M12.667 6.667c-0.8 -1.6 -2.533 -2.667 -4.533 -2.667C5.467 4 3.333 6.133 3.333 8.8s2.133 4.8 4.8 4.8c2.267 0 4.2 -1.533 4.667 -3.667" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',

  // 操作
  upload: '<path d="M8 11V3M4.5 6.5L8 3l3.5 3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M3 11v2.5h10V11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  download: '<path d="M8 3v8M4.5 7.5L8 11l3.5-3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M3 11v2.5h10V11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  'new-folder': '<path d="M1.5 4.5h4l1.5 1.5h7.5v7.5h-13V4.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M8 7.5v3M6.5 9h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  'new-bucket': '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M8 6v4M6 8h4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  delete: '<path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  rename: '<path d="M2 12l2-5 7-7 3 3-7 7-5 2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M9 3l3 3" stroke="currentColor" stroke-width="1.2" fill="none"/>',
  copy: '<rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M3 10.5V3.5C3 3 3.5 2.5 4 2.5h6.5" stroke="currentColor" stroke-width="1.2" fill="none"/>',
  move: '<path d="M3 8h7M7 5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M11 5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  preview: '<path d="M1.5 8S4 4 8 4s6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.2" fill="none"/>',
  'more-h': '<circle cx="3" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="13" cy="8" r="1.2" fill="currentColor"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>',

  // 视图切换
  'detail-view': '<rect x="2" y="3" width="12" height="2" rx="0.5" fill="currentColor"/><rect x="2" y="7" width="12" height="2" rx="0.5" fill="currentColor"/><rect x="2" y="11" width="12" height="2" rx="0.5" fill="currentColor"/>',
  'grid-view': '<rect x="2" y="2" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="9" y="2" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="2" y="9" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="9" y="9" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.2" fill="none"/>',

  // 侧栏
  bucket: '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M2 6h12" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M5 9l2 2 4-4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  home: '<path d="M2 8L8 3l6 5v6H2V8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M6.5 14V10h3v4" stroke="currentColor" stroke-width="1.2" fill="none"/>',
  logout: '<path d="M9 3H4v10h5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M7 8h6M10 5l3 3-3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',

  // 文件类型
  folder: '<path d="M1.5 4.5h4l1.5 1.5h7.5v7.5h-13V4.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
  'folder-open': '<path d="M1.5 4.5h4l1.5 1.5h7.5v2h-13V4.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M2.5 8h11l-1 4.5h-9L2.5 8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
  image: '<rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><circle cx="5.5" cy="6.5" r="1" fill="currentColor"/><path d="M3 12l3.5-3.5 2 2L11 8l3 4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
  video: '<rect x="2" y="4" width="9" height="8" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M11 7l3-2v6l-3-2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
  audio: '<path d="M4 6v4M6 5v6M8 3v10M10 5v6M12 6v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
  pdf: '<path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><text x="5.5" y="12" font-size="3.5" fill="currentColor" font-weight="bold">PDF</text>',
  doc: '<path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M5 7h6M5 9h6M5 11h4" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
  spreadsheet: '<path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M5 7h6M5 9h6M5 11h4M5 7v4M8 7v4" stroke="currentColor" stroke-width="0.8"/>',
  archive: '<path d="M3 2h10v3H3V2z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M3 5h10v9H3V5z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M7 7h2v2H7z" stroke="currentColor" stroke-width="0.8" fill="none"/>',
  code: '<path d="M3 2h10v12H3V2z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M6 6L4 8l2 2M10 6l2 2-2 2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  web: '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M2.5 8h11M8 2.5c1.5 2 1.5 9 0 11M8 2.5c-1.5 2-1.5 9 0 11" stroke="currentColor" stroke-width="1" fill="none"/>',
  text: '<path d="M3 2h10v12H3V2z" stroke="currentColor" stroke-width="1.2" fill="none"/><path d="M5 5h6M5 7h6M5 9h6M5 11h4" stroke="currentColor" stroke-width="0.8" stroke-linecap="round"/>',
  'file-generic': '<path d="M3 2h7l3 3v9H3V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/><path d="M10 2v3h3" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none"/>',
  app: '<rect x="3" y="3" width="10" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/><rect x="5.5" y="5.5" width="2" height="2" fill="currentColor"/><rect x="8.5" y="5.5" width="2" height="2" fill="currentColor"/><rect x="5.5" y="8.5" width="2" height="2" fill="currentColor"/><rect x="8.5" y="8.5" width="2" height="2" fill="currentColor"/>',
}

const paths = computed(() => icons[props.name] || icons['file-generic'])
</script>

<style>
.fluent-icon { display: inline-block; vertical-align: middle; flex-shrink: 0; }
</style>
