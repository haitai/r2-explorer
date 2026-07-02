<template>
  <div class="explorer-root" @click="hideContextMenu" @contextmenu.prevent="onRootContextMenu">
    <!-- 标题栏 -->
    <div class="win-titlebar">
      <span class="titlebar-icon">🗄️</span>
      <span class="titlebar-text">{{ currentBucket || 'R2 Explorer' }} — {{ currentPathDisplay }}</span>
      <div class="titlebar-actions">
        <button class="titlebar-btn logout" @click="doLogout" title="退出登录">🔒 退出</button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="win-toolbar">
      <button class="win-toolbar-btn" @click="goBack" :disabled="!canGoBack">⬅</button>
      <button class="win-toolbar-btn" @click="goForward" :disabled="!canGoForward">➡</button>
      <button class="win-toolbar-btn" @click="goUp" :disabled="!canGoUp">⬆</button>
      <button class="win-toolbar-btn" @click="refresh">🔄</button>
      <select class="bucket-select" v-model="currentBucket" @change="onBucketChange">
        <option value="" disabled>选择存储桶...</option>
        <option v-for="b in buckets" :key="b.name" :value="b.name">{{ b.name }} ({{ b.location || '?' }})</option>
      </select>
      <div class="win-addressbar">
        <input v-model="addressInput" @keydown.enter="navigateTo(addressInput)" placeholder="输入路径..." />
      </div>
      <button class="win-toolbar-btn primary" @click="showUploadModal = true" :disabled="!currentBucket">⬆ 上传</button>
      <button class="win-toolbar-btn" @click="showNewFolderModal = true" :disabled="!currentBucket">📁 新建</button>
      <button class="win-toolbar-btn danger" @click="deleteSelectedItems" :disabled="!selectedItems.length || !currentBucket">🗑 删除</button>
      <button class="win-toolbar-btn" @click="toggleView">{{ viewMode === 'detail' ? '🔲 网格' : '📋 详情' }}</button>
    </div>

    <!-- 主体 -->
    <div class="win-body">
      <!-- 侧栏 -->
      <div class="win-sidebar">
        <div class="sidebar-section">
          <div class="sidebar-title">存储桶</div>
          <div v-for="b in buckets" :key="b.name"
            class="tree-node"
            :class="{ active: currentBucket === b.name }"
            @click="switchBucket(b.name)">
            <span class="icon">🗄️</span>
            <span>{{ b.name }}</span>
            <span class="bucket-info">{{ b.location }}</span>
          </div>
          <div class="tree-node add-bucket" @click="showCreateBucketModal = true">
            <span class="icon">➕</span> <span>新建存储桶</span>
          </div>
        </div>

        <div v-if="currentBucket" class="sidebar-section">
          <div class="sidebar-title">目录树</div>
          <div class="tree-node" @click="navigateTo('')" :class="{ active: currentPath === '' }">
            <span class="icon">🏠</span> 根目录
          </div>
          <tree-node
            v-for="folder in rootFolders"
            :key="folder.prefix"
            :folder="folder"
            :bucket="currentBucket"
            :current-path="currentPath"
            :expanded-folders="expandedFolders"
            @navigate="navigateTo"
            @toggle-expand="toggleExpand"
          />
        </div>
      </div>

      <!-- 内容区 -->
      <div class="win-content"
        ref="winContent"
        @contextmenu.prevent="onContentContextMenu"
        @mousedown="onContentMouseDown"
        @mouseup="onContentMouseUp">

        <!-- 框选矩形 -->
        <div v-if="sel.isSelecting" class="selection-box" :style="selBoxStyle"></div>
        <div v-if="!currentBucket" class="empty-state">
          <span class="icon" style="font-size:64px">🗄️</span>
          <span class="text" style="font-size:16px">请从左侧选择一个存储桶，或创建新存储桶</span>
        </div>

        <div v-else-if="loading" class="loading">加载中...</div>

        <div v-else-if="items.length === 0" class="empty-state">
          <span class="icon">📂</span>
          <span class="text">此文件夹为空</span>
        </div>

        <!-- 详情视图 -->
        <div v-else-if="viewMode === 'detail'" class="detail-view">
          <div class="detail-header" :style="detailGridStyle">
            <span class="col col-icon"></span>
            <span class="col col-name" @click="sortBy('name')">名称 {{ sortIndicator('name') }}<span class="resize-handle" @mousedown.prevent="startResize('name', $event)" /></span>
            <span class="col col-size" @click="sortBy('size')">大小 {{ sortIndicator('size') }}<span class="resize-handle" @mousedown.prevent="startResize('size', $event)" /></span>
            <span class="col col-date" @click="sortBy('date')">修改日期 {{ sortIndicator('date') }}<span class="resize-handle" @mousedown.prevent="startResize('date', $event)" /></span>
            <span class="col col-type" @click="sortBy('type')">类型 {{ sortIndicator('type') }}<span class="resize-handle" @mousedown.prevent="startResize('type', $event)" /></span>
            <span class="col col-actions">操作</span>
          </div>
          <div v-for="item in sortedItems" :key="item.key || item.prefix"
            class="file-row" :style="detailGridStyle"
            :class="{ selected: isSelected(item), folder: item.prefix !== undefined }"
            :data-item-key="item.key || item.prefix"
            @mousedown.left.exact="onItemMouseDown(item, $event)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)">
            <span class="col col-icon">{{ itemIcon(item) }}</span>
            <span class="col col-name">{{ item.name }}</span>
            <span class="col col-size">{{ item.size ? formatSize(item.size) : '' }}</span>
            <span class="col col-date">{{ item.lastModified ? formatDate(item.lastModified) : '' }}</span>
            <span class="col col-type">{{ itemType(item) }}</span>
            <span class="col col-actions">
              <template v-if="item.prefix === undefined">
                <button class="action-btn" v-if="isPreviewable(item)" @click.stop="previewItem(item)" title="预览">👁</button>
                <button class="action-btn" @click.stop="downloadItem(item)" title="下载">⬇</button>
                <button class="action-btn danger" @click.stop="deleteSingleItem(item)" title="删除">🗑</button>
              </template>
              <template v-else>
                <button class="action-btn danger" @click.stop="deleteSingleItem(item)" title="删除文件夹">🗑</button>
              </template>
            </span>
          </div>
        </div>

        <!-- 网格视图 -->
        <div v-else class="grid-view">
          <div v-for="item in sortedItems" :key="item.key || item.prefix"
            class="grid-item" :class="{ selected: isSelected(item) }"
            :data-item-key="item.key || item.prefix"
            @mousedown.left.exact="onItemMouseDown(item, $event)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)">
            <span class="icon">{{ itemIcon(item) }}</span>
            <span class="name">{{ item.name }}</span>
            <div class="grid-actions" v-if="item.prefix === undefined">
              <button class="action-btn small" v-if="isPreviewable(item)" @click.stop="previewItem(item)" title="预览">👁</button>
              <button class="action-btn small" @click.stop="downloadItem(item)" title="下载">⬇</button>
              <button class="action-btn small danger" @click.stop="deleteSingleItem(item)" title="删除">🗑</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 状态栏 -->
    <div class="win-statusbar">
      <span v-if="currentBucket">桶: {{ currentBucket }}</span>
      <span>{{ selectedItems.length }} 项已选择</span>
      <span>{{ items.length }} 项</span>
      <span v-if="totalSize > 0">总大小: {{ formatSize(totalSize) }}</span>
    </div>

    <!-- 右键菜单 -->
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <template v-if="contextMenu.target === 'item'">
        <div v-if="contextMenu.item.prefix !== undefined" class="context-menu-item" @click="openItem(contextMenu.item)">📂 打开文件夹</div>
        <div v-if="contextMenu.item.prefix === undefined && isPreviewable(contextMenu.item)" class="context-menu-item" @click="previewItem(contextMenu.item)">👁 预览</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="downloadItem(contextMenu.item)">⬇ 下载</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="showRenameModal = true; renameTarget = contextMenu.item; renameNewName = contextMenu.item.name">✏️ 重命名</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="showCopyModal = true; copyTarget = contextMenu.item">📋 复制到...</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="showMoveModal = true; moveTarget = contextMenu.item">📦 移动到...</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item danger" @click="deleteSingleItem(contextMenu.item)">🗑️ 删除</div>
      </template>
      <template v-if="contextMenu.target === 'content'">
        <div class="context-menu-item" @click="showUploadModal = true">⬆ 上传文件</div>
        <div class="context-menu-item" @click="showNewFolderModal = true">📁 新建文件夹</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="refresh">🔄 刷新</div>
      </template>
    </div>

    <!-- 上传模态框 -->
    <div v-if="showUploadModal" class="modal-overlay" @click.self="showUploadModal = false">
      <div class="modal-box">
        <div class="modal-header">上传文件到 {{ currentBucket }}</div>
        <div class="modal-body">
          <div class="upload-area" @dragover.prevent @drop.prevent="onDrop">
            <input type="file" multiple @change="onFileSelect" ref="fileInput" style="display:none" />
            <button class="modal-btn primary" @click="$refs.fileInput.click()">选择文件</button>
            <p style="margin-top:12px;color:#616161;font-size:13px;">或拖拽文件到此区域</p>
          </div>
          <div v-if="uploadFiles.length" class="upload-list">
            <div v-for="(f, i) in uploadFiles" :key="i" class="upload-file-item">
              <span>{{ f.name }}</span>
              <span style="color:#616161">{{ formatSize(f.size) }}</span>
              <button style="border:none;background:none;color:#e81123;cursor:pointer" @click="uploadFiles.splice(i, 1)">✕</button>
            </div>
          </div>
          <div v-if="uploadProgress" class="progress-bar">
            <div class="fill" :style="{ width: uploadProgress + '%' }" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showUploadModal = false">取消</button>
          <button class="modal-btn primary" @click="doUpload" :disabled="!uploadFiles.length || uploading">
            {{ uploading ? '上传中...' : '上传' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 新建文件夹 -->
    <div v-if="showNewFolderModal" class="modal-overlay" @click.self="showNewFolderModal = false">
      <div class="modal-box">
        <div class="modal-header">新建文件夹</div>
        <div class="modal-body">
          <input v-model="newFolderName" class="modal-input" placeholder="文件夹名称" @keydown.enter="doCreateFolder" />
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showNewFolderModal = false">取消</button>
          <button class="modal-btn primary" @click="doCreateFolder">创建</button>
        </div>
      </div>
    </div>

    <!-- 重命名 -->
    <div v-if="showRenameModal" class="modal-overlay" @click.self="showRenameModal = false">
      <div class="modal-box">
        <div class="modal-header">重命名</div>
        <div class="modal-body">
          <input v-model="renameNewName" class="modal-input" placeholder="新名称" @keydown.enter="doRename" />
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showRenameModal = false">取消</button>
          <button class="modal-btn primary" @click="doRename">确认</button>
        </div>
      </div>
    </div>

    <!-- 复制/移动到 -->
    <div v-if="showCopyModal || showMoveModal" class="modal-overlay" @click.self="showCopyModal=false;showMoveModal=false">
      <div class="modal-box">
        <div class="modal-header">{{ showCopyModal ? '复制到' : '移动到' }}</div>
        <div class="modal-body">
          <input v-model="copyMoveTarget" class="modal-input" placeholder="目标路径（如 folder/subfolder/）" />
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showCopyModal=false;showMoveModal=false">取消</button>
          <button class="modal-btn primary" @click="doCopyMove">确认</button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="showDeleteModal" class="modal-overlay" @click.self="showDeleteModal = false">
      <div class="modal-box">
        <div class="modal-header">确认删除</div>
        <div class="modal-body">
          <p>确定要删除以下 {{ deleteTargets.length }} 个项目吗？此操作不可撤销。</p>
          <div class="delete-list">
            <div v-for="t in deleteTargets" :key="t.key||t.prefix" class="delete-item">
              {{ itemIcon(t) }} {{ t.name }}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showDeleteModal = false">取消</button>
          <button class="modal-btn danger" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>

    <!-- 创建存储桶 -->
    <div v-if="showCreateBucketModal" class="modal-overlay" @click.self="showCreateBucketModal = false">
      <div class="modal-box">
        <div class="modal-header">创建 R2 存储桶</div>
        <div class="modal-body">
          <input v-model="newBucketName" class="modal-input" placeholder="存储桶名称" />
          <select v-model="newBucketLocation" class="modal-input" style="margin-top:8px">
            <option value="apac">亚太 (APAC)</option>
            <option value="wnam">北美西部 (WNAM)</option>
            <option value="enam">北美东部 (ENAM)</option>
            <option value="weur">欧洲西部 (WEUR)</option>
            <option value="eeur">欧洲东部 (EEUR)</option>
            <option value="oc">大洋洲 (OC)</option>
          </select>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showCreateBucketModal = false">取消</button>
          <button class="modal-btn primary" @click="doCreateBucket">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import r2client from '../api/r2client.js'
import TreeNode from '../components/TreeNode.vue'

const router = useRouter()

// === 桶状态 ===
const buckets = ref([])
const currentBucket = ref(r2client.currentBucket)
const showCreateBucketModal = ref(false)
const newBucketName = ref('')
const newBucketLocation = ref('apac')

// === 导航状态 ===
const currentPath = ref('')
const addressInput = ref('')
const navHistory = ref([''])
const navHistoryIdx = ref(0)
const loading = ref(false)
const expandedFolders = ref(new Set())

// === 内容状态 ===
const folders = ref([])
const files = ref([])
const viewMode = ref('detail')
const sortField = ref('name')
const sortOrder = ref('asc')
const selectedItems = ref([])

// === 模态框 ===
const showUploadModal = ref(false)
const showNewFolderModal = ref(false)
const showRenameModal = ref(false)
const showCopyModal = ref(false)
const showMoveModal = ref(false)
const showDeleteModal = ref(false)
const uploadFiles = ref([])
const uploading = ref(false)
const uploadProgress = ref(0)
const newFolderName = ref('')
const renameTarget = ref(null)
const renameNewName = ref('')
const copyTarget = ref(null)
const moveTarget = ref(null)
const copyMoveTarget = ref('')
const deleteTargets = ref([])
const contextMenu = ref({ visible: false, x: 0, y: 0, target: '', item: null })

// === 列宽调整 ===
const DEFAULT_COL_WIDTHS = { icon: 28, name: 250, size: 80, date: 140, type: 100, actions: 70 }
const colWidths = ref({ ...DEFAULT_COL_WIDTHS })
// 从 localStorage 读取保存的列宽
const savedWidths = localStorage.getItem('r2_col_widths')
if (savedWidths) {
  try { Object.assign(colWidths.value, JSON.parse(savedWidths)) } catch(e) {}
}
const detailGridStyle = computed(() => {
  const w = colWidths.value
  return { gridTemplateColumns: `${w.icon}px ${w.name}px ${w.size}px ${w.date}px ${w.type}px ${w.actions}px` }
})
const resizingCol = ref(null)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)
const justResized = ref(false)

function startResize(col, event) {
  resizingCol.value = col
  resizeStartX.value = event.clientX
  resizeStartWidth.value = colWidths.value[col]
  justResized.value = true
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
function onResizeMove(event) {
  if (!resizingCol.value) return
  const delta = event.clientX - resizeStartX.value
  const newWidth = Math.max(30, resizeStartWidth.value + delta)
  colWidths.value[resizingCol.value] = newWidth
}
function onResizeEnd() {
  resizingCol.value = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  // 延迟清除 justResized 标志，防止 click 事件在 mouseup 后触发
  setTimeout(() => { justResized.value = false }, 100)
  // 保存列宽到 localStorage
  localStorage.setItem('r2_col_widths', JSON.stringify(colWidths.value))
}

// === 计算属性 ===
const items = computed(() => [...folders.value, ...files.value])
const sortedItems = computed(() => {
  const arr = [...items.value]
  const field = sortField.value
  const order = sortOrder.value === 'asc' ? 1 : -1
  arr.sort((a, b) => {
    const aIsFolder = a.prefix !== undefined
    const bIsFolder = b.prefix !== undefined
    if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
    let cmp = 0
    if (field === 'name') cmp = a.name.localeCompare(b.name)
    else if (field === 'size') cmp = (a.size || 0) - (b.size || 0)
    else if (field === 'date') cmp = (a.lastModified || '').localeCompare(b.lastModified || '')
    else if (field === 'type') cmp = itemType(a).localeCompare(itemType(b))
    return cmp * order
  })
  return arr
})
const totalSize = computed(() => files.value.reduce((s, f) => s + (f.size || 0), 0))
const currentPathDisplay = computed(() => currentPath.value ? '/' + currentPath.value : '/')
const rootFolders = computed(() => folders.value)
const canGoBack = computed(() => navHistoryIdx.value > 0)
const canGoForward = computed(() => navHistoryIdx.value < navHistory.value.length - 1)
const canGoUp = computed(() => currentPath.value !== '')

// === 格式化 ===
function formatSize(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0, size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}
function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('zh-CN') + ' ' + dt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
function itemIcon(item) {
  if (item.prefix !== undefined) return '📁'
  const ext = (item.name || '').split('.').pop().toLowerCase()
  const m = { jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️',svg:'🖼️', mp4:'🎬',avi:'🎬',mov:'🎬', mkv:'🎬', mp3:'🎵',wav:'🎵',flac:'🎵', pdf:'📕', doc:'📄',docx:'📄', xls:'📊',xlsx:'📊', zip:'📦',rar:'📦','7z':'📦', js:'📜',ts:'📜',py:'📜',json:'📜', html:'🌐',css:'🎨', txt:'📝',md:'📝', exe:'⚙️' }
  return m[ext] || '📄'
}
function itemType(item) {
  if (item.prefix !== undefined) return '文件夹'
  const ext = (item.name || '').split('.').pop().toLowerCase()
  const m = { jpg:'JPEG 图片',png:'PNG 图片', mp4:'MP4 视频', mp3:'MP3 音频', pdf:'PDF 文档', zip:'ZIP 压缩包','7z':'7z 压缩包', json:'JSON 文件', txt:'文本文件' }
  return m[ext] || (ext ? ext.toUpperCase() + ' 文件' : '文件')
}
function isSelected(item) { return selectedItems.value.some(s => (s.key||s.prefix) === (item.key||item.prefix)) }
function selectItem(item) {
  const key = item.key || item.prefix
  const idx = selectedItems.value.findIndex(s => (s.key||s.prefix) === key)
  if (idx >= 0) selectedItems.value.splice(idx, 1)
  else selectedItems.value.push(item)
}
function clearSelection() { selectedItems.value = [] }

// === 框选逻辑 ===
const winContent = ref(null)
const sel = ref({ isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0 })

const selBoxStyle = computed(() => {
  if (!sel.value.isSelecting) return {}
  const { startX, startY, endX, endY } = sel.value
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  if (width < 4 && height < 4) return { display: 'none' }
  return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }
})

// 获取容器内某点的 item-key
function getItemKeyAt(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY)
  if (!el) return null
  return el.closest('[data-item-key]')?.dataset?.itemKey ?? null
}

// 计算落在框选矩形内的所有 key
function getItemKeysInRect(rect) {
  const keys = []
  const { left: rLeft, top: rTop, right: rRight, bottom: rBottom } = rect
  document.querySelectorAll('[data-item-key]').forEach(el => {
    const itemRect = el.getBoundingClientRect()
    if (itemRect.left < rRight && itemRect.right > rLeft &&
        itemRect.top < rBottom && itemRect.bottom > rTop) {
      keys.push(el.dataset.itemKey)
    }
  })
  return keys
}

function onContentMouseDown(e) {
  if (e.button !== 0) return
  // 跳过交互元素
  if (e.target.closest('.action-btn, .resize-handle, button, input, select')) return
  sel.value.isSelecting = true
  sel.value.startX = e.clientX
  sel.value.startY = e.clientY
  sel.value.endX = e.clientX
  sel.value.endY = e.clientY
  // 清除已有选择（框选从空白开始，行为和按住 Ctrl 不同）
  if (!e.ctrlKey && !e.metaKey) clearSelection()
  // 监听全局 mousemove/mouseup
  document.addEventListener('mousemove', onDocMouseMove, { passive: true })
  document.addEventListener('mouseup', onDocMouseUp)
}
function onDocMouseMove(e) {
  if (!sel.value.isSelecting) return
  sel.value.endX = e.clientX
  sel.value.endY = e.clientY

  // 计算框选矩形（viewport 坐标）
  const startX = sel.value.startX
  const startY = sel.value.startY
  const endX = sel.value.endX
  const endY = sel.value.endY
  const selRect = {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY)
  }

  const keys = getItemKeysInRect(selRect)
  if (e.ctrlKey || e.metaKey) {
    // 合并模式
    const merged = new Set(selectedItems.value.map(i => i.key || i.prefix))
    keys.forEach(k => merged.add(k))
    selectedItems.value = items.value.filter(i => merged.has(i.key || i.prefix))
  } else {
    selectedItems.value = items.value.filter(i => keys.includes(i.key || i.prefix))
  }
}
function onDocMouseUp() {
  sel.value.isSelecting = false
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
}
function onContentMouseUp() {
  onDocMouseUp()
}

function onContentMouseMove(e) {
  // 由 document 级别的 onDocMouseMove 处理，此处仅用于防止事件冒泡
}

// 文件项点击（单独处理，区别于框选）
function onItemMouseDown(item, e) {
  if (e.button !== 0) return
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+点击：切换单个项的选中状态
    e.preventDefault()
    selectItem(item)
    // 阻止后续 click 事件
    const el = e.currentTarget
    const handler = () => { selectItem(item); el.removeEventListener('click', handler) }
    el.addEventListener('click', handler, { once: true })
  } else {
    // 普通点击：如果当前未选中，则只选中它（清除其他）
    if (!isSelected(item)) {
      selectedItems.value = [item]
    }
  }
}

// === 键盘快捷键 ===
function onGlobalKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault()
    selectedItems.value = items.value.slice()
  }
  if (e.key === 'Escape') clearSelection()
}

function sortBy(f) { if (justResized.value) return; sortField.value === f ? sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc' : (sortField.value = f, sortOrder.value = 'asc') }
function sortIndicator(f) { return sortField.value === f ? (sortOrder.value === 'asc' ? '↑' : '↓') : '' }
function toggleView() { viewMode.value = viewMode.value === 'detail' ? 'grid' : 'detail' }
function toggleExpand(prefix) { expandedFolders.value.has(prefix) ? expandedFolders.value.delete(prefix) : expandedFolders.value.add(prefix) }

// === 桶操作 ===
async function loadBuckets() {
  try {
    const data = await r2client.listBuckets()
    buckets.value = data.buckets || []
  } catch (e) { console.error(e) }
}
function switchBucket(name) {
  currentBucket.value = name
  r2client.setBucket(name)
  currentPath.value = ''
  addressInput.value = ''
  navHistory.value = ['']
  navHistoryIdx.value = 0
  loadDirectory('')
}
function onBucketChange() { switchBucket(currentBucket.value) }
async function doCreateBucket() {
  if (!newBucketName.value) return
  try {
    await r2client.createBucket(newBucketName.value, newBucketLocation.value)
    await loadBuckets()
    switchBucket(newBucketName.value)
  } catch (e) { console.error(e) }
  showCreateBucketModal.value = false; newBucketName.value = ''
}

// === 目录加载 ===
async function loadDirectory(prefix = '') {
  if (!currentBucket.value) return
  loading.value = true; selectedItems.value = []
  try {
    const data = await r2client.listObjects(currentBucket.value, prefix, '/')
    folders.value = (data.prefixes || []).map(p => ({ prefix: p, name: p.replace(prefix, '').replace(/\/$/, '') }))
    files.value = (data.objects || []).map(o => ({
      key: o.key, name: o.key.replace(prefix, ''),
      size: o.size, lastModified: o.lastModified, etag: o.etag,
    })).filter(f => f.name !== '')
  } catch (e) {
    if (e.message === 'AUTH_EXPIRED') { router.push('/login'); return }
    console.error(e)
  } finally { loading.value = false }
}
async function navigateTo(prefix) {
  currentPath.value = prefix; addressInput.value = prefix
  const newH = navHistory.value.slice(0, navHistoryIdx.value + 1)
  newH.push(prefix)
  navHistory.value = newH; navHistoryIdx.value = newH.length - 1
  await loadDirectory(prefix)
}
function goBack() { if (!canGoBack.value) return; navHistoryIdx.value--; currentPath.value = navHistory.value[navHistoryIdx.value]; addressInput.value = currentPath.value; loadDirectory(currentPath.value) }
function goForward() { if (!canGoForward.value) return; navHistoryIdx.value++; currentPath.value = navHistory.value[navHistoryIdx.value]; addressInput.value = currentPath.value; loadDirectory(currentPath.value) }
function goUp() { if (!canGoUp.value) return; const parts = currentPath.value.split('/').filter(Boolean); parts.pop(); navigateTo(parts.join('/') + (parts.length ? '/' : '')) }
function refresh() { loadDirectory(currentPath.value) }
function openItem(item) { item.prefix !== undefined ? navigateTo(item.prefix) : (isPreviewable(item) ? previewItem(item) : downloadItem(item)) }

// === 预览 vs 下载 ===
function isPreviewable(item) {
  if (item.prefix !== undefined) return false
  const ext = (item.name || '').split('.').pop().toLowerCase()
  const previewable = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif', 'mp4','webm','mov','avi','mkv', 'mp3','wav','ogg','flac','aac','m4a', 'pdf', 'txt','md','json','js','ts','py','html','css','xml','yaml','yml','sh','bat','csv','log','ini','conf','cfg','toml','env', 'woff','woff2','ttf','otf']
  return previewable.includes(ext)
}

function previewItem(item) {
  // 在浏览器中直接打开（后端不加 Content-Disposition: attachment）
  const url = `/api/s3/${currentBucket.value}/${encodeURIComponent(item.key)}`
  const headers = {}
  if (r2client.authToken) headers['Authorization'] = `Bearer ${r2client.authToken}`
  // 用 fetch 获取内容，然后在新窗口中展示
  fetch(url, { headers }).then(res => {
    if (!res.ok) throw new Error(`Error: ${res.status}`)
    return res.blob()
  }).then(blob => {
    const blobUrl = URL.createObjectURL(blob)
    window.open(blobUrl, '_blank')
    // 延迟释放，给新窗口加载时间
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }).catch(e => console.error('Preview failed:', e))
}

// === 下载 ===
function downloadItem(item) {
  // 强制下载（后端会加 Content-Disposition: attachment）
  const url = `/api/s3/${currentBucket.value}/${encodeURIComponent(item.key)}?download=true`
  const headers = {}
  if (r2client.authToken) headers['Authorization'] = `Bearer ${r2client.authToken}`
  fetch(url, { headers }).then(res => {
    if (!res.ok) throw new Error(`Download error: ${res.status}`)
    return res.blob()
  }).then(blob => {
    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = item.name
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  }).catch(e => console.error('Download failed:', e))
}

// === 删除 ===
function deleteSingleItem(item) {
  deleteTargets.value = [item]
  showDeleteModal.value = true
}
function deleteSelectedItems() {
  if (!selectedItems.value.length) return
  deleteTargets.value = [...selectedItems.value]
  showDeleteModal.value = true
}
async function confirmDelete() {
  if (!currentBucket.value) return
  const keys = deleteTargets.value.map(i => i.key || i.prefix)
  try { await r2client.deleteObjects(currentBucket.value, keys) } catch(e) { console.error(e) }
  showDeleteModal.value = false; deleteTargets.value = []; selectedItems.value = []; refresh()
}

// === 右键菜单 ===
function hideContextMenu() { contextMenu.value.visible = false }
function onRootContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'root', item:null } }
function onContentContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'content', item:null } }
function onItemContextMenu(item, e) { if (!isSelected(item)) selectedItems.value = [item]; contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'item', item } }

// === 其他操作 ===
async function doUpload() {
  if (!uploadFiles.value.length || !currentBucket.value) return
  uploading.value = true; uploadProgress.value = 0
  const total = uploadFiles.value.length; let done = 0; let failed = 0
  for (const file of uploadFiles.value) {
    const key = currentPath.value + file.name
    try { await r2client.putObject(currentBucket.value, key, file) } catch(e) { console.error(e); failed++ }
    done++; uploadProgress.value = Math.round((done/total)*100)
  }
  uploading.value = false; uploadFiles.value = []; uploadProgress.value = 0
  showUploadModal.value = false; refresh()
  if (failed > 0) alert(`${failed} 个文件上传失败，请查看控制台日志`)
}
function onFileSelect(e) { uploadFiles.value = [...e.target.files] }
function onDrop(e) { uploadFiles.value = [...e.dataTransfer.files] }
async function doCreateFolder() {
  if (!newFolderName.value || !currentBucket.value) return
  try { await r2client.createFolder(currentBucket.value, currentPath.value + newFolderName.value + '/') } catch(e) { console.error(e) }
  showNewFolderModal.value = false; newFolderName.value = ''; refresh()
}
async function doRename() {
  if (!renameTarget.value || !renameNewName.value || !currentBucket.value) return
  const oldKey = renameTarget.value.key || renameTarget.value.prefix
  const parts = oldKey.split('/'); parts[parts.length - (oldKey.endsWith('/') ? 2 : 1)] = renameNewName.value
  try { await r2client.renameObject(currentBucket.value, oldKey, parts.join('/')) } catch(e) { console.error(e) }
  showRenameModal.value = false; renameNewName.value = ''; refresh()
}
async function doCopyMove() {
  const target = showCopyModal.value ? copyTarget.value : moveTarget.value
  const action = showCopyModal.value ? 'copy' : 'move'
  if (!target || !copyMoveTarget.value || !currentBucket.value) return
  const srcKey = target.key || target.prefix
  let dstKey = copyMoveTarget.value; if (!dstKey.endsWith('/')) dstKey += '/'; dstKey += target.name
  try {
    action === 'copy' ? await r2client.copyObject(currentBucket.value, srcKey, dstKey) : await r2client.moveObject(currentBucket.value, srcKey, dstKey)
  } catch(e) { console.error(e) }
  showCopyModal.value = false; showMoveModal.value = false; copyMoveTarget.value = ''; refresh()
}

// === 初始化 ===
function doLogout() {
  r2client.authToken = ''
  localStorage.removeItem('r2_token')
  router.push('/login')
}

onMounted(async () => {
  if (!r2client.authToken) { router.push('/login'); return }
  document.addEventListener('keydown', onGlobalKeydown)
  await loadBuckets()
  if (currentBucket.value) await loadDirectory('')
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<style scoped>
.explorer-root { display:flex; flex-direction:column; height:100vh; }
.titlebar-icon { margin-right:6px; }
.titlebar-text { font-weight:500; }
.titlebar-actions { margin-left:auto; display:flex; gap:4px; }
.titlebar-btn { border:none; background:none; cursor:pointer; font-size:12px; padding:2px 8px; border-radius:3px; transition:all 0.15s; }
.titlebar-btn:hover { background:#e5e5e5; }
.titlebar-btn.logout { color:var(--win-text-secondary); }
.titlebar-btn.logout:hover { background:#fde; color:var(--win-danger); }
.sidebar-section { padding:4px 0; }
.sidebar-title { padding:6px 12px 4px; font-size:11px; color:var(--win-text-secondary); font-weight:600; }
.bucket-select { height:28px; border:1px solid var(--win-border); border-radius:3px; background:#fff; font-size:13px; padding:0 8px; min-width:140px; }
.bucket-info { font-size:10px; color:var(--win-text-secondary); margin-left:4px; }
.add-bucket { color:var(--win-accent); }
.upload-area { text-align:center; padding:16px; border:2px dashed var(--win-border); border-radius:8px; }
.upload-list { margin-top:12px; max-height:200px; overflow-y:auto; }
.upload-file-item { display:flex; align-items:center; justify-content:space-between; padding:4px 8px; font-size:13px; border-bottom:1px solid var(--win-border); }
.modal-input { height:36px; border:1px solid var(--win-border); border-radius:6px; padding:0 12px; font-size:14px; outline:none; width:100%; }
.modal-input:focus { border-color:var(--win-accent); }
.delete-list { margin-top:8px; max-height:200px; overflow-y:auto; }
.delete-item { padding:3px 0; font-size:13px; }

/* 详情视图 — 可调节列宽 */
.detail-view { height:100%; overflow-y:auto; }

.detail-header {
  display: grid;
  align-items: center;
  padding: 4px 0;
  background: var(--win-bg);
  border-bottom: 1px solid var(--win-border);
  font-size: 12px;
  color: var(--win-text-secondary);
  user-select: none;
  position: sticky;
  top: 0;
  z-index: 1;
}

.detail-header .col { cursor: pointer; padding: 2px 8px; overflow: hidden; }
.detail-header .col.col-name, .detail-header .col.col-size, .detail-header .col.col-date, .detail-header .col.col-type {
  overflow: visible; /* 允许 resize-handle 越界显示 */
}
.detail-header .col-icon { cursor: default; text-align: center; padding: 2px 0; }
.detail-header .col-actions { cursor: default; text-align: center; }

/* 列宽拖拽手柄 — 仅在 header 中显示 */
/* 列宽拖拽手柄 — 嵌套在 header 列右边界 */
.col { position: relative; }
.detail-header .resize-handle {
  position: absolute;
  top: 0; bottom: 0;
  right: -5px; /* 跨越列右边界 */
  width: 10px;
  cursor: col-resize;
  z-index: 3;
  /* 手柄本身透明 */
}
.detail-header .resize-handle::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  background: transparent;
  transition: background 0.15s;
}
.detail-header .resize-handle:hover::after {
  background: rgba(0, 90, 158, 0.5);
}

.file-row {
  display: grid;
  align-items: center;
  padding: 2px 0;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
  font-size: 13px;
  min-height: 26px;
}

.file-row:hover { background: #e5f3ff; }
.file-row.selected { background: var(--win-selected); border-color: var(--win-selected-border); }

.file-row .col-icon { font-size: 16px; text-align: center; padding: 2px 0; }
.file-row .col-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 8px; }
.file-row .col-size, .file-row .col-date, .file-row .col-type { color: var(--win-text-secondary); font-size: 12px; padding: 2px 8px; text-align: right; }
.file-row .col-actions { display: flex; gap: 2px; justify-content: center; }

.action-btn {
  width: 22px; height: 22px;
  border: 1px solid transparent; border-radius: 3px;
  background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: var(--win-text);
  transition: all 0.15s;
}
.action-btn:hover { background: #e5e5e5; border-color: var(--win-border); }
.action-btn.danger { color: var(--win-danger); }
.action-btn.danger:hover { background: #fde; border-color: #e81123; }
.action-btn.small { width: 18px; height: 18px; font-size: 10px; }

/* 网格视图中的操作按钮 */
.grid-actions {
  display: flex; gap: 2px; margin-top: 2px;
}

/* 框选矩形 */
.selection-box {
  position: absolute;
  z-index: 9999;
  background: rgba(64, 145, 247, 0.12);
  border: 1.5px solid rgba(64, 145, 247, 0.7);
  border-radius: 2px;
  pointer-events: none;
  /* display 由 selBoxStyle 控制 */
}
</style>
