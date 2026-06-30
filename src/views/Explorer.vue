<template>
  <div class="explorer-root" @click="hideContextMenu" @contextmenu.prevent="onRootContextMenu">
    <!-- 标题栏 -->
    <div class="win-titlebar">
      <span class="titlebar-icon">🗄️</span>
      <span class="titlebar-text">{{ currentBucket || 'R2 Explorer' }} — {{ currentPathDisplay }}</span>
    </div>

    <!-- 工具栏 -->
    <div class="win-toolbar">
      <button class="win-toolbar-btn" @click="goBack" :disabled="!canGoBack">⬅</button>
      <button class="win-toolbar-btn" @click="goForward" :disabled="!canGoForward">➡</button>
      <button class="win-toolbar-btn" @click="goUp" :disabled="!canGoUp">⬆</button>
      <button class="win-toolbar-btn" @click="refresh">🔄</button>
      <!-- 桶选择器 -->
      <select class="bucket-select" v-model="currentBucket" @change="onBucketChange">
        <option value="" disabled>选择存储桶...</option>
        <option v-for="b in buckets" :key="b.name" :value="b.name">{{ b.name }} ({{ b.location || '?' }})</option>
      </select>
      <div class="win-addressbar">
        <input v-model="addressInput" @keydown.enter="navigateTo(addressInput)" placeholder="输入路径..." />
      </div>
      <button class="win-toolbar-btn primary" @click="showUploadModal = true" :disabled="!currentBucket">⬆ 上传</button>
      <button class="win-toolbar-btn" @click="showNewFolderModal = true" :disabled="!currentBucket">📁 新建文件夹</button>
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

        <!-- 当前桶目录树 -->
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
      <div class="win-content" @contextmenu.prevent="onContentContextMenu" @click="clearSelection">
        <!-- 未选择桶 -->
        <div v-if="!currentBucket" class="empty-state">
          <span class="icon" style="font-size:64px">🗄️</span>
          <span class="text" style="font-size:16px">请从左侧选择一个存储桶，或创建新存储桶</span>
        </div>

        <!-- Loading -->
        <div v-else-if="loading" class="loading">加载中...</div>

        <!-- 空状态 -->
        <div v-else-if="items.length === 0" class="empty-state">
          <span class="icon">📂</span>
          <span class="text">此文件夹为空</span>
        </div>

        <!-- 详情视图 -->
        <div v-else-if="viewMode === 'detail'" class="detail-view">
          <div class="detail-header">
            <span class="col name" @click="sortBy('name')">名称 {{ sortIndicator('name') }}</span>
            <span class="col size" @click="sortBy('size')">大小 {{ sortIndicator('size') }}</span>
            <span class="col date" @click="sortBy('date')">修改日期 {{ sortIndicator('date') }}</span>
            <span class="col type" @click="sortBy('type')">类型 {{ sortIndicator('type') }}</span>
          </div>
          <div v-for="item in sortedItems" :key="item.key || item.prefix"
            class="file-item" :class="{ selected: isSelected(item) }"
            @click.stop="selectItem(item)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)">
            <span class="icon">{{ itemIcon(item) }}</span>
            <span class="name">{{ item.name }}</span>
            <span class="size">{{ item.size ? formatSize(item.size) : '' }}</span>
            <span class="date">{{ item.lastModified ? formatDate(item.lastModified) : '' }}</span>
            <span class="type">{{ itemType(item) }}</span>
          </div>
        </div>

        <!-- 网格视图 -->
        <div v-else class="grid-view">
          <div v-for="item in sortedItems" :key="item.key || item.prefix"
            class="grid-item" :class="{ selected: isSelected(item) }"
            @click.stop="selectItem(item)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)">
            <span class="icon">{{ itemIcon(item) }}</span>
            <span class="name">{{ item.name }}</span>
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
        <div class="context-menu-item" @click="openItem(contextMenu.item)">📂 打开</div>
        <div class="context-menu-item" @click="downloadItem(contextMenu.item)">⬇ 下载</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="showRenameModal = true; renameTarget = contextMenu.item">✏️ 重命名</div>
        <div class="context-menu-item" @click="showCopyModal = true; copyTarget = contextMenu.item">📋 复制到...</div>
        <div class="context-menu-item" @click="showMoveModal = true; moveTarget = contextMenu.item">📦 移动到...</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item danger" @click="deleteSelected">🗑️ 删除</div>
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
          <p>确定要删除 {{ deleteTargets.length }} 个项目吗？此操作不可撤销。</p>
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
import { ref, computed, watch, onMounted } from 'vue'
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
const history = ref([''])
const historyIndex = ref(0)
const loading = ref(false)
const expandedFolders = ref(new Set())

// === 内容状态 ===
const folders = ref([])
const files = ref([])
const viewMode = ref('detail')
const sortField = ref('name')
const sortOrder = ref('asc')
const selectedItems = ref([])

// === UI 模态框 ===
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
const rootFolders = computed(() => folders.value.filter(f => !f.prefix.includes('/')))
const canGoBack = computed(() => historyIndex.value > 0)
const canGoForward = computed(() => historyIndex.value < history.value.length - 1)
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
function sortBy(f) { sortField.value === f ? sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc' : (sortField.value = f, sortOrder.value = 'asc') }
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
  history.value = ['']
  historyIndex.value = 0
  loadDirectory('')
}

function onBucketChange() {
  switchBucket(currentBucket.value)
}

async function doCreateBucket() {
  if (!newBucketName.value) return
  try {
    await r2client.createBucket(newBucketName.value, newBucketLocation.value)
    await loadBuckets()
    switchBucket(newBucketName.value)
  } catch (e) { console.error(e) }
  showCreateBucketModal.value = false
  newBucketName.value = ''
}

// === 目录加载 ===
async function loadDirectory(prefix = '') {
  if (!currentBucket.value) return
  loading.value = true
  selectedItems.value = []
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
  currentPath.value = prefix
  addressInput.value = prefix
  const newH = history.value.slice(0, historyIndex.value + 1)
  newH.push(prefix)
  history.value = newH
  historyIndex.value = newH.length - 1
  await loadDirectory(prefix)
}

function goBack() { if (!canGoBack.value) return; historyIndex.value--; currentPath.value = history.value[historyIndex.value]; addressInput.value = currentPath.value; loadDirectory(currentPath.value) }
function goForward() { if (!canGoForward.value) return; historyIndex.value++; currentPath.value = history.value[historyIndex.value]; addressInput.value = currentPath.value; loadDirectory(currentPath.value) }
function goUp() { if (!canGoUp.value) return; const parts = currentPath.value.split('/').filter(Boolean); parts.pop(); navigateTo(parts.join('/') + (parts.length ? '/' : '')) }
function refresh() { loadDirectory(currentPath.value) }
function openItem(item) { item.prefix !== undefined ? navigateTo(item.prefix) : downloadItem(item) }
function downloadItem(item) {
  const url = r2client.getDownloadUrl(currentBucket.value, item.key)
  const a = document.createElement('a')
  a.href = url; a.download = item.name; a.target = '_blank'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// === 右键菜单 ===
function hideContextMenu() { contextMenu.value.visible = false }
function onRootContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'root', item:null } }
function onContentContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'content', item:null } }
function onItemContextMenu(item, e) { if (!isSelected(item)) selectedItems.value = [item]; contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'item', item } }

// === 操作 ===
async function doUpload() {
  if (!uploadFiles.value.length || !currentBucket.value) return
  uploading.value = true; uploadProgress.value = 0
  const total = uploadFiles.value.length; let done = 0
  for (const file of uploadFiles.value) {
    const key = currentPath.value + file.name
    try { await r2client.putObject(currentBucket.value, key, file) } catch(e) { console.error(e) }
    done++; uploadProgress.value = Math.round((done/total)*100)
  }
  uploading.value = false; uploadFiles.value = []; uploadProgress.value = 0
  showUploadModal.value = false; refresh()
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
function deleteSelected() { deleteTargets.value = selectedItems.value.length ? selectedItems.value : [contextMenu.value.item]; showDeleteModal.value = true }
async function confirmDelete() {
  if (!currentBucket.value) return
  const keys = deleteTargets.value.map(i => i.key || i.prefix)
  try { await r2client.deleteObjects(currentBucket.value, keys) } catch(e) { console.error(e) }
  showDeleteModal.value = false; deleteTargets.value = []; selectedItems.value = []; refresh()
}

// === 初始化 ===
onMounted(async () => {
  if (!r2client.authToken) { router.push('/login'); return }
  await loadBuckets()
  if (currentBucket.value) await loadDirectory('')
})
</script>

<style scoped>
.explorer-root { display:flex; flex-direction:column; height:100vh; }
.titlebar-icon { margin-right:6px; }
.titlebar-text { font-weight:500; }
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
.detail-view { height:100%; overflow-y:auto; }
</style>
