<template>
  <component :is="iconComp" :size="size" :stroke-width="strokeWidth" />
</template>

<script setup>
import { computed } from 'vue'
import {
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  RotateCw, X,
  Upload, Download, FolderPlus, FilePlus,
  Trash2, Pencil, Copy, Move, Eye, MoreHorizontal,
  LayoutGrid, List,
  Database, Home, LogOut,
  Folder, FolderOpen,
  Image, Video, Music, FileText, FileType, FileArchive, FileCode, Globe, File,
  LayoutDashboard, HardDrive, Monitor,
} from 'lucide-vue-next'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 16 },
  strokeWidth: { type: Number, default: 1.75 },
})

const map = {
  // 导航
  back: ChevronLeft,
  forward: ChevronRight,
  up: ChevronUp,
  refresh: RotateCw,
  // 操作
  upload: Upload,
  download: Download,
  'new-folder': FolderPlus,
  'new-bucket': FilePlus,
  delete: Trash2,
  rename: Pencil,
  copy: Copy,
  move: Move,
  preview: Eye,
  'more-h': MoreHorizontal,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  close: X,
  // 视图切换
  'detail-view': List,
  'grid-view': LayoutGrid,
  // 侧栏
  bucket: Database,
  home: Home,
  logout: LogOut,
  computer: Monitor,
  // 文件类型
  folder: Folder,
  'folder-open': FolderOpen,
  image: Image,
  video: Video,
  audio: Music,
  pdf: FileText,
  doc: FileText,
  spreadsheet: FileType,
  archive: FileArchive,
  code: FileCode,
  web: Globe,
  text: FileText,
  'file-generic': File,
  app: LayoutDashboard,
}

const iconComp = computed(() => map[props.name] || File)
</script>
