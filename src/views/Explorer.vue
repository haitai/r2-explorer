<template>
  <div class="explorer-root" @click="hideContextMenu" @contextmenu.prevent="onRootContextMenu">
    <!-- 标题栏 -->
    <div class="win-titlebar">
      <span class="titlebar-icon"><Icon name="bucket" :size="16" /></span>
      <span class="titlebar-text">{{ currentBucket || 'R2 Explorer' }} — {{ currentPathDisplay }}</span>
      <div class="titlebar-actions">
        <button class="titlebar-btn logout" @click="doLogout" title="退出登录"><Icon name="logout" :size="14" /> 退出</button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="win-toolbar">
      <button class="win-toolbar-btn icon-only" @click="goBack" :disabled="!canGoBack" title="后退"><Icon name="back" :size="16" /></button>
      <button class="win-toolbar-btn icon-only" @click="goForward" :disabled="!canGoForward" title="前进"><Icon name="forward" :size="16" /></button>
      <button class="win-toolbar-btn icon-only" @click="goUp" :disabled="!canGoUp" title="上一级"><Icon name="up" :size="16" /></button>
      <button class="win-toolbar-btn icon-only" @click="refresh" title="刷新"><Icon name="refresh" :size="16" /></button>
      <div class="win-breadcrumb">
        <!-- 存储桶段 -->
        <span class="crumb" v-if="currentBucket">
          <span class="crumb-text" @click="switchBucket(currentBucket)">{{ currentBucket }}</span>
        </span>
        <span class="crumb-placeholder" v-else>选择存储桶...</span>
        <!-- 桶后的箭头：点击弹出桶列表 -->
        <span class="crumb-sep" v-if="currentBucket" @click.stop="toggleCrumbDropdown('bucket', $event)"><Icon :name="(crumbDropdown.open && crumbDropdown.type === 'bucket') ? 'chevron-down' : 'chevron-right'" :size="12" /></span>
        <!-- 路径段 -->
        <template v-for="(seg, i) in pathSegments" :key="i">
          <span class="crumb">
            <span class="crumb-text" @click="navigateTo(seg.prefix)">{{ seg.name }}</span>
          </span>
          <span class="crumb-sep" @click.stop="toggleCrumbDropdown(i, $event)"><Icon :name="(crumbDropdown.open && crumbDropdown.type === i) ? 'chevron-down' : 'chevron-right'" :size="12" /></span>
        </template>
        <!-- 下拉菜单 -->
        <div v-if="crumbDropdown.open" class="crumb-dropdown" :style="{ left: crumbDropdown.x + 'px', top: crumbDropdown.y + 'px' }" @click.stop>
          <div v-if="crumbDropdown.type === 'bucket'">
            <div v-for="b in buckets" :key="b.name" class="crumb-dropdown-item" :class="{active: b.name === currentBucket}" @click="switchBucket(b.name); closeCrumbDropdown()">{{ b.name }}</div>
          </div>
          <div v-else>
            <div v-if="crumbDropdown.loading" class="crumb-dropdown-loading">加载中...</div>
            <div v-else-if="crumbDropdown.items.length === 0" class="crumb-dropdown-empty">无子文件夹</div>
            <div v-for="item in crumbDropdown.items" :key="item.prefix" class="crumb-dropdown-item" @click="navigateTo(item.prefix); closeCrumbDropdown()">{{ item.name }}</div>
          </div>
        </div>
      </div>
      <button class="win-toolbar-btn primary" @click="showUploadModal = true" :disabled="!currentBucket"><Icon name="upload" :size="14" /> 上传</button>
      <button class="win-toolbar-btn" @click="showNewFolderModal = true" :disabled="!currentBucket"><Icon name="new-folder" :size="14" /> 新建</button>
      <button class="win-toolbar-btn danger" @click="deleteSelectedItems" :disabled="!selectedItems.length || !currentBucket"><Icon name="delete" :size="14" /> 删除</button>
      <button class="win-toolbar-btn" @click="toggleView"><Icon :name="viewMode === 'detail' ? 'grid-view' : 'detail-view'" :size="14" /> {{ viewMode === 'detail' ? '网格' : '详情' }}</button>
    </div>

    <!-- 主体 -->
    <div class="win-body">
      <!-- 侧栏 -->
      <div class="win-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-section">
          <div class="sidebar-title">存储桶</div>
          <div v-for="b in buckets" :key="b.name"
            class="tree-node"
            :class="{ active: currentBucket === b.name }"
            :title="b.name"
            @click="switchBucket(b.name)">
            <span class="icon"><Icon name="bucket" :size="16" /></span>
            <span>{{ b.name }}</span>
            <span class="bucket-info">{{ b.location }}</span>
          </div>
          <div class="tree-node add-bucket" @click="showCreateBucketModal = true">
            <span class="icon"><Icon name="new-bucket" :size="16" /></span> <span>新建存储桶</span>
          </div>
        </div>

        <div v-if="currentBucket" class="sidebar-section">
          <div class="sidebar-title">目录树</div>
          <div class="tree-node" @click="navigateTo('')" :class="{ active: currentPath === '' }" title="根目录">
            <span class="icon"><Icon name="home" :size="16" /></span> 根目录
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

      <!-- 侧栏宽度调节手柄 -->
      <div
        class="sidebar-resizer"
        :class="{ dragging: sidebarResizing }"
        @mousedown="startSidebarResize"
      ></div>

      <!-- 内容区 -->
      <div class="win-content"
        ref="winContent"
        @contextmenu.prevent.stop="onContentContextMenu"
        @mousedown="onContentMouseDown"
        @mouseup="onContentMouseUp">

        <!-- 框选矩形（用于网格视图） -->
        <div v-if="sel.isSelecting && viewMode === 'grid'" class="selection-box" :style="selBoxStyle"></div>
        <div v-if="!currentBucket" class="empty-state">
          <span class="icon" style="font-size:64px"><Icon name="bucket" :size="64" /></span>
          <span class="text" style="font-size:16px">请从左侧选择一个存储桶，或创建新存储桶</span>
        </div>

        <div v-else-if="loading" class="loading">加载中...</div>

        <div v-else-if="items.length === 0" class="empty-state">
          <span class="icon"><Icon name="folder-open" :size="48" /></span>
          <span class="text">此文件夹为空</span>
        </div>

        <!-- 详情视图 -->
        <div v-else-if="viewMode === 'detail'" class="detail-view" ref="detailView">
          <!-- 框选矩形（用于详情视图） -->
          <div v-if="sel.isSelecting" class="selection-box" :style="selBoxStyle"></div>
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
            :class="{ selected: isSelected(item), folder: item.prefix !== undefined, 'is-cut': isCutItem(item) }"
            :data-item-key="item.key || item.prefix"
            @mousedown.left.exact="onItemMouseDown(item, $event)"
            @click="onItemClick(item, $event)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)">
            <span class="col col-icon"><Icon :name="itemIconName(item)" :size="16" /></span>
            <span class="col col-name">{{ item.name }}</span>
            <span class="col col-size">{{ item.size ? formatSize(item.size) : '' }}</span>
            <span class="col col-date">{{ item.lastModified ? formatDate(item.lastModified) : '' }}</span>
            <span class="col col-type">{{ itemType(item) }}</span>
            <span class="col col-actions">
              <button class="action-btn more" @click.stop="showActionMenu(item, $event)" title="操作"><Icon name="more-h" :size="14" /></button>
            </span>
          </div>
        </div>

        <!-- 网格视图 -->
        <div v-else class="grid-view">
          <div v-for="item in sortedItems" :key="item.key || item.prefix"
            class="grid-item" :class="{ selected: isSelected(item), 'is-cut': isCutItem(item) }"
            :data-item-key="item.key || item.prefix"
            @mousedown.left.exact="onItemMouseDown(item, $event)"
            @click="onItemClick(item, $event)"
            @dblclick="openItem(item)"
            @contextmenu.prevent.stop="onItemContextMenu(item, $event)" :title="item.name">
            <span class="icon">
              <img v-if="isImage(item)" :src="getThumbUrl(item)" class="grid-thumb" loading="lazy" />
              <Icon v-else :name="itemIconName(item)" :size="36" />
            </span>
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
      <span v-if="pasteStatus" style="color: var(--win-accent); margin-left: auto">{{ pasteStatus }}</span>
    </div>

    <!-- 详情操作菜单 -->
    <div v-if="actionMenu.visible" class="action-menu" :style="{ right: actionMenu.right + 'px', top: actionMenu.y + 'px' }" @click.stop>
      <div v-if="actionMenu.item.prefix !== undefined" class="action-menu-item" @click="openItem(actionMenu.item)"><Icon name="folder-open" :size="14" /> 打开</div>
      <template v-if="actionMenu.item.prefix === undefined">
        <div v-if="isPreviewable(actionMenu.item)" class="action-menu-item" @click="previewItem(actionMenu.item); hideActionMenu()"><Icon name="preview" :size="14" /> 预览</div>
        <div class="action-menu-item" @click="downloadItem(actionMenu.item); hideActionMenu()"><Icon name="download" :size="14" /> 下载</div>
      </template>
      <div class="action-menu-item" @click="deleteSingleItem(actionMenu.item); hideActionMenu()"><Icon name="delete" :size="14" /> 删除</div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <template v-if="contextMenu.target === 'item'">
        <div v-if="contextMenu.item.prefix !== undefined" class="context-menu-item" @click="openItem(contextMenu.item)"><Icon name="folder-open" :size="14" /> 打开文件夹</div>
        <div v-if="contextMenu.item.prefix === undefined && isPreviewable(contextMenu.item)" class="context-menu-item" @click="previewItem(contextMenu.item)"><Icon name="preview" :size="14" /> 预览</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="downloadItem(contextMenu.item)"><Icon name="download" :size="14" /> 下载</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="showRenameModal = true; renameTarget = contextMenu.item; renameNewName = contextMenu.item.name"><Icon name="rename" :size="14" /> 重命名</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="openCopyMove('copy')"><Icon name="copy" :size="14" /> 复制到...</div>
        <div v-if="contextMenu.item.prefix === undefined" class="context-menu-item" @click="openCopyMove('move')"><Icon name="move" :size="14" /> 移动到...</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item danger" @click="deleteSingleItem(contextMenu.item)"><Icon name="delete" :size="14" /> 删除</div>
      </template>
      <template v-if="contextMenu.target === 'content' || contextMenu.target === 'root'">
        <div class="context-menu-item has-submenu">
          <Icon name="detail-view" :size="14" /> 查看
          <Icon name="chevron-right" :size="10" style="margin-left:auto" />
          <div class="context-submenu">
            <div class="context-menu-item" @click="viewMode = 'detail'"><Icon name="detail-view" :size="14" /> 详情</div>
            <div class="context-menu-item" @click="viewMode = 'grid'"><Icon name="grid-view" :size="14" /> 网格</div>
          </div>
        </div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="refresh"><Icon name="refresh" :size="14" /> 刷新</div>
        <div class="context-menu-sep" />
        <div class="context-menu-item" @click="showNewFolderModal = true"><Icon name="new-folder" :size="14" /> 新建文件夹</div>
        <div class="context-menu-item" @click="showUploadModal = true"><Icon name="upload" :size="14" /> 上传文件</div>
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
              <button style="border:none;background:none;color:#e81123;cursor:pointer;display:flex;align-items:center" @click="uploadFiles.splice(i, 1)"><Icon name="close" :size="12" /></button>
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
        <div class="modal-header">{{ showCopyModal ? '复制到' : '移动到' }} ({{ copyMoveSources.length }} 项)</div>
        <div class="modal-body">
          <div style="margin-bottom:8px;max-height:80px;overflow-y:auto;font-size:12px;color:var(--win-text-secondary)">
            <div v-for="s in copyMoveSources" :key="s.key||s.prefix" style="padding:1px 0; display:flex; align-items:center; gap:4px"><Icon :name="itemIconName(s)" :size="14" /> {{ s.name }}</div>
          </div>
          <select v-model="copyMoveBucket" class="modal-input" style="margin-bottom:8px">
            <option v-for="b in buckets" :key="b.name" :value="b.name">{{ b.name }}</option>
          </select>
          <input v-model="copyMoveTarget" class="modal-input" placeholder="目标路径（如 folder/subfolder/）" :disabled="copyMoving" />
        </div>
        <div v-if="copyMoving" style="padding:0 20px 12px">
          <div style="font-size:12px;color:var(--win-text-secondary);margin-bottom:4px">{{ copyMoveProgress }}</div>
          <div class="progress-bar"><div class="fill" :style="{ width: copyMovePercent + '%' }" /></div>
        </div>
        <div class="modal-footer">
          <button class="modal-btn" @click="showCopyModal=false;showMoveModal=false" :disabled="copyMoving">取消</button>
          <button class="modal-btn primary" @click="doCopyMove" :disabled="copyMoving">{{ copyMoving ? '操作中...' : (showCopyModal ? '复制' : '移动') }}</button>
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
              <Icon :name="itemIconName(t)" :size="14" /> {{ t.name }}
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
import Icon from '../components/Icon.vue'

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
const copyMoveSources = ref([])
const copyMoveTarget = ref('')
const copyMoveBucket = ref('')
const copyMoving = ref(false)
const copyMoveProgress = ref('')
const copyMovePercent = ref(0)
const deleteTargets = ref([])
const contextMenu = ref({ visible: false, x: 0, y: 0, target: '', item: null })
const actionMenu = ref({ visible: false, right: 0, y: 0, item: null })

// === 内部剪贴板 ===
// { mode: 'copy'|'cut', items: [...], sourceBucket: 'xxx' }
const clipboard = ref({ mode: '', items: [], sourceBucket: '' })
const pasteStatus = ref('')  // 粘贴操作时的状态文案

// === 侧栏宽度调节 ===
const sidebarWidth = ref(parseInt(localStorage.getItem('r2_sidebar_width')) || 220)
const sidebarResizing = ref(false)
function startSidebarResize(e) {
  e.preventDefault()
  sidebarResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value
  const onMove = (ev) => {
    const newWidth = Math.max(150, Math.min(500, startWidth + ev.clientX - startX))
    sidebarWidth.value = newWidth
  }
  const onUp = () => {
    sidebarResizing.value = false
    localStorage.setItem('r2_sidebar_width', sidebarWidth.value)
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.userSelect = 'none'
}

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

// 面包屑路径段
const pathSegments = computed(() => {
  if (!currentPath.value) return []
  const parts = currentPath.value.replace(/\/$/, '').split('/').filter(Boolean)
  let prefix = ''
  return parts.map(name => {
    prefix += name + '/'
    return { name, prefix }
  })
})

// 面包屑下拉菜单
const crumbDropdown = ref({ open: false, x: 0, y: 0, type: '', index: -1, items: [], loading: false })

function toggleCrumbDropdown(type, e) {
  if (crumbDropdown.value.open && crumbDropdown.value.type === type && crumbDropdown.value.index === (typeof type === 'number' ? type : -1)) {
    closeCrumbDropdown()
    return
  }
  const rect = e.currentTarget.getBoundingClientRect()
  crumbDropdown.value = { open: true, x: rect.left, y: rect.bottom + 2, type, index: typeof type === 'number' ? type : -1, items: [], loading: type !== 'bucket' }
  if (type === 'bucket') {
    // 桶列表已在 buckets 中
    return
  }
  // 加载该层级的子文件夹
  const prefix = type === 0 ? '' : pathSegments.value[type - 1].prefix
  loadSubFolders(prefix)
}

async function loadSubFolders(prefix) {
  crumbDropdown.value.loading = true
  try {
    const data = await r2client.listObjects(currentBucket.value, prefix, '/')
    const items = (data.prefixes || []).map(p => ({ prefix: p, name: p.replace(prefix, '').replace(/\/$/, '') }))
    crumbDropdown.value.items = items
  } catch (e) {
    console.error(e)
    crumbDropdown.value.items = []
  } finally {
    crumbDropdown.value.loading = false
  }
}

function closeCrumbDropdown() {
  crumbDropdown.value.open = false
}
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
function itemIconName(item) {
  if (item.prefix !== undefined) return 'folder'
  const ext = (item.name || '').split('.').pop().toLowerCase()
  const m = {
    jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image', svg:'image', bmp:'image',
    mp4:'video', avi:'video', mov:'video', mkv:'video', wmv:'video',
    mp3:'audio', wav:'audio', flac:'audio', aac:'audio', ogg:'audio',
    pdf:'pdf',
    doc:'doc', docx:'doc',
    xls:'spreadsheet', xlsx:'spreadsheet',
    zip:'archive', rar:'archive', '7z':'archive', tar:'archive', gz:'archive',
    js:'code', ts:'code', py:'code', json:'code', html:'web', css:'code',
    txt:'text', md:'text', log:'text',
    exe:'app', msi:'app', dmg:'app', deb:'app',
  }
  return m[ext] || 'file-generic'
}
function itemType(item) {
  if (item.prefix !== undefined) return '文件夹'
  const ext = (item.name || '').split('.').pop().toLowerCase()
  const m = { jpg:'JPEG 图片',png:'PNG 图片', mp4:'MP4 视频', mp3:'MP3 音频', pdf:'PDF 文档', zip:'ZIP 压缩包','7z':'7z 压缩包', json:'JSON 文件', txt:'文本文件' }
  return m[ext] || (ext ? ext.toUpperCase() + ' 文件' : '文件')
}
function isSelected(item) { return selectedItems.value.some(s => (s.key||s.prefix) === (item.key||item.prefix)) }
function isCutItem(item) {
  if (clipboard.value.mode !== 'cut') return false
  return clipboard.value.items.some(s => (s.key||s.prefix) === (item.key||item.prefix))
}
function selectItem(item) {
  const key = item.key || item.prefix
  const idx = selectedItems.value.findIndex(s => (s.key||s.prefix) === key)
  if (idx >= 0) selectedItems.value.splice(idx, 1)
  else selectedItems.value.push(item)
}
function clearSelection() { selectedItems.value = [] }

// === 框选逻辑 ===
const winContent = ref(null)
const detailView = ref(null)
const sel = ref({ isSelecting: false, startX: 0, startY: 0, endX: 0, endY: 0 })

const selBoxStyle = computed(() => {
  if (!sel.value.isSelecting) return {}
  const { startX, startY, endX, endY } = sel.value
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  if (width < 4 && height < 4) return { display: 'none' }

  // 详情视图：用容器相对坐标
  if (viewMode.value === 'detail' && detailView.value) {
    const rect = detailView.value.getBoundingClientRect()
    return {
      left: `${left - rect.left}px`,
      top: `${top - rect.top}px`,
      width: `${width}px`,
      height: `${height}px`
    }
  }
  // 网格视图：viewport 绝对坐标（position: absolute 相对 win-content）
  const winRect = winContent.value?.getBoundingClientRect() ?? { left: 0, top: 0 }
  return {
    left: `${left - winRect.left}px`,
    top: `${top - winRect.top}px`,
    width: `${width}px`,
    height: `${height}px`
  }
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
  // 防止拖拽时浏览器选中文字
  document.body.style.userSelect = 'none'
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
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onDocMouseMove)
  document.removeEventListener('mouseup', onDocMouseUp)
}
function onContentMouseUp() {
  onDocMouseUp()
}

function onContentMouseMove(e) {
  // 由 document 级别的 onDocMouseMove 处理，此处仅用于防止事件冒泡
}

// 文件项点击（单选）
function onItemClick(item, e) {
  if (e.ctrlKey || e.metaKey) {
    e.stopPropagation()
    selectItem(item) // toggle
  } else {
    // 普通点击：选中该项（不清除已选中的）
    if (!isSelected(item)) {
      selectedItems.value = [...selectedItems.value, item]
    }
  }
}

// 文件项按下（仅用于开始框选，单选由 click 处理）
function onItemMouseDown(item, e) {
  if (e.button !== 0) return
  // 单选逻辑移至 onItemClick 处理
}

// === 键盘快捷键 ===
function isInputFocused() {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
}

function onGlobalKeydown(e) {
  // Ctrl+A 保持原有逻辑
  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
    if (isInputFocused()) return
    e.preventDefault()
    selectedItems.value = items.value.slice()
    return
  }
  if (e.key === 'Escape') { clearSelection(); return }

  // 输入框聚焦时不拦截复制/剪切/粘贴/删除
  if (isInputFocused()) return

  // Ctrl+C 复制
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
    if (!selectedItems.value.length) return
    e.preventDefault()
    clipboard.value = {
      mode: 'copy',
      items: selectedItems.value.filter(i => i.prefix === undefined),
      sourceBucket: currentBucket.value
    }
    return
  }
  // Ctrl+X 剪切
  if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
    if (!selectedItems.value.length) return
    e.preventDefault()
    clipboard.value = {
      mode: 'cut',
      items: selectedItems.value.filter(i => i.prefix === undefined),
      sourceBucket: currentBucket.value
    }
    return
  }
  // Ctrl+V 粘贴（内部剪贴板优先）
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
    if (!clipboard.value.items.length) return  // 没有内部剪贴板内容，交给 paste 事件处理上传
    e.preventDefault()
    doPaste()
    return
  }
  // Delete 删除
  if (e.key === 'Delete') {
    if (!selectedItems.value.length) return
    e.preventDefault()
    deleteSelectedItems()
    return
  }
}

// 监听 paste 事件：若剪贴板里有本地文件，则走上传流程
function onGlobalPaste(e) {
  const files = e.clipboardData?.files
  if (!files || !files.length) return
  // 只在有当前桶时才拦截上传
  if (!currentBucket.value) return
  e.preventDefault()
  uploadFiles.value = Array.from(files)
  doUpload()
}

// 执行粘贴：基于 clipboard 和当前路径进行复制/移动
async function doPaste() {
  const { mode, items: srcs, sourceBucket } = clipboard.value
  if (!srcs.length || !sourceBucket || !currentBucket.value) return

  const dstBucket = currentBucket.value
  const dstBase = currentPath.value
  const isCut = mode === 'cut'
  const sameBucket = dstBucket === sourceBucket
  const total = srcs.length
  let done = 0; let failed = 0
  pasteStatus.value = `正在粘贴 0/${total}...`

  for (const item of srcs) {
    const srcKey = item.key
    let dstKey = dstBase
    if (dstKey !== '' && !dstKey.endsWith('/')) dstKey += '/'
    dstKey += item.name
    pasteStatus.value = `正在粘贴 (${done + 1}/${total}) ${item.name}`

    try {
      if (sameBucket) {
        // 同桶：跳过源=目标的情形
        if (srcKey === dstKey) { done++; continue }
        isCut ? await r2client.moveObject(sourceBucket, srcKey, dstKey) : await r2client.copyObject(sourceBucket, srcKey, dstKey)
      } else {
        // 跨桶
        await r2client.crossBucketCopy(sourceBucket, srcKey, dstBucket, dstKey)
        if (isCut) await r2client.deleteObject(sourceBucket, srcKey)
      }
    } catch(e) {
      console.error(`Paste failed: ${item.name}`, e)
      failed++
    }
    done++
  }

  // 粘贴完成后保留剪贴板内容（复制模式可多次粘贴），剪切模式则清空
  if (isCut) {
    clipboard.value = { mode: '', items: [], sourceBucket: '' }
  }

  if (failed > 0) {
    pasteStatus.value = `完成，${failed} 项失败`
    setTimeout(() => { pasteStatus.value = '' }, 3000)
  } else {
    // 短暂提示后清状态栏，但剪贴板内容保留
    pasteStatus.value = `已粘贴 ${total} 项`
    setTimeout(() => { pasteStatus.value = '' }, 2000)
  }
  refresh()
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

// === 图片缩略图 ===
function isImage(item) {
  if (item.prefix !== undefined) return false
  const ext = (item.name || '').split('.').pop().toLowerCase()
  return ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext)
}
function getThumbUrl(item) {
  // 通过 S3 API 获取，auth token 作为 query param 避免 CORS 问题
  const base = `/api/s3/${currentBucket.value}/${encodeURIComponent(item.key)}`
  return r2client.authToken ? `${base}?token=${encodeURIComponent(r2client.authToken)}` : base
}

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
function hideContextMenu() { contextMenu.value.visible = false; actionMenu.value.visible = false; closeCrumbDropdown() }
function showActionMenu(item, e) {
  e.preventDefault()
  const rect = e.target.getBoundingClientRect()
  actionMenu.value = { visible: true, right: window.innerWidth - rect.right, y: rect.bottom + 2, item }
  setTimeout(() => {
    const close = () => { actionMenu.value.visible = false; document.removeEventListener('click', close) }
    document.addEventListener('click', close)
  }, 0)
}
function hideActionMenu() { actionMenu.value.visible = false }
function onRootContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'root', item:null } }
function onContentContextMenu(e) { contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'content', item:null } }
function onItemContextMenu(item, e) { if (!isSelected(item)) selectedItems.value = [item]; contextMenu.value = { visible:true, x:e.clientX, y:e.clientY, target:'item', item } }

// 打开复制/移动弹窗：取已选中的文件（非文件夹）作为操作源
function openCopyMove(mode) {
  const targets = selectedItems.value.filter(i => i.prefix === undefined)
  if (!targets.length) return
  // 如果右键菜单指向的文件在已选中里就用已选中的，否则单文件
  copyMoveSources.value = targets
  copyMoveBucket.value = currentBucket.value
  copyMoveTarget.value = ''
  copyMovePercent.value = 0
  copyMoveProgress.value = ''
  copyMoving.value = false
  if (mode === 'copy') showCopyModal.value = true
  else showMoveModal.value = true
}

async function doCopyMove() {
  const sources = copyMoveSources.value
  const isCopy = showCopyModal.value
  const dstBucket = copyMoveBucket.value || currentBucket.value
  const dstBase = copyMoveTarget.value || ''
  if (!sources.length || !currentBucket.value || !dstBucket) return

  copyMoving.value = true
  const total = sources.length
  let done = 0; let failed = 0
  for (const item of sources) {
    const srcKey = item.key
    let dstKey = dstBase
    if (dstKey !== '' && !dstKey.endsWith('/')) dstKey += '/'
    dstKey += item.name
    copyMoveProgress.value = `(${done + 1}/${total}) ${item.name}`

    try {
      if (dstBucket === currentBucket.value) {
        // 同桶
        isCopy ? await r2client.copyObject(currentBucket.value, srcKey, dstKey) : await r2client.moveObject(currentBucket.value, srcKey, dstKey)
      } else {
        // 跨桶
        await r2client.crossBucketCopy(currentBucket.value, srcKey, dstBucket, dstKey)
        if (!isCopy) await r2client.deleteObject(currentBucket.value, srcKey)
      }
    } catch(e) {
      console.error(`Failed ${isCopy ? 'copy' : 'move'}: ${item.name}`, e)
      failed++
    }
    done++
    copyMovePercent.value = Math.round((done / total) * 100)
  }

  if (failed > 0) {
    copyMoveProgress.value = `完成，${failed} 项失败`
    setTimeout(() => { copyMoveProgress.value = '' }, 3000)
  }

  copyMoving.value = false
  showCopyModal.value = false; showMoveModal.value = false
  copyMoveTarget.value = ''; copyMoveBucket.value = ''
  copyMovePercent.value = 0
  refresh()
}
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

// === 初始化 ===
function doLogout() {
  r2client.authToken = ''
  localStorage.removeItem('r2_token')
  router.push('/login')
}

onMounted(async () => {
  if (!r2client.authToken) { router.push('/login'); return }
  document.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('paste', onGlobalPaste)
  await loadBuckets()
  if (currentBucket.value) await loadDirectory('')
})

onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('paste', onGlobalPaste)
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
.bucket-select { height:32px; border:1px solid var(--win-border); border-radius:3px; background:#fff; font-size:13px; padding:0 8px; min-width:140px; }

/* 面包屑导航 */
.win-breadcrumb {
  height: 32px;
  background: #fff;
  border: 1px solid var(--win-border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  padding: 0 4px;
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  position: relative;
}
.crumb {
  display: inline-flex;
  align-items: center;
  height: 24px;
  border-radius: 3px;
  white-space: nowrap;
}
.crumb-text {
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 3px 0 0 3px;
}
.crumb-text:hover { background: var(--win-sidebar-hover); }
.crumb-arrow {
  padding: 2px 4px;
  cursor: pointer;
  border-radius: 0 3px 3px 0;
  display: inline-flex;
  align-items: center;
}
.crumb-arrow:hover { background: var(--win-sidebar-hover); }
.crumb-sep {
  display: inline-flex;
  align-items: center;
  color: var(--win-text-secondary);
  margin: 0 1px;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
}
.crumb-sep:hover { background: var(--win-sidebar-hover); color: var(--win-text); }
.crumb-placeholder {
  color: var(--win-text-secondary);
  padding: 0 8px;
}
.crumb-dropdown {
  position: fixed;
  background: #fff;
  border: 1px solid var(--win-border);
  box-shadow: var(--win-shadow);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 9999;
}
.crumb-dropdown-item {
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.crumb-dropdown-item:hover { background: var(--win-sidebar-hover); }
.crumb-dropdown-item.active { font-weight: 600; color: var(--win-accent); }
.crumb-dropdown-loading, .crumb-dropdown-empty {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--win-text-secondary);
}
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
.detail-view { height:100%; overflow-y:auto; position: relative; }

.detail-header {
  display: grid;
  align-items: center;
  padding: 4px 0;
  background: var(--win-bg);
  border-bottom: none;
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
.file-row.is-cut { opacity: 0.5; }
.file-row.is-cut.selected { background: #fff4e5; border-color: #f0a040; }

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
.action-btn.more {
  font-weight: bold;
  font-size: 14px;
  width: 26px;
  height: 24px;
}

/* 详情操作菜单（省略号弹出） */
.action-menu {
  position: fixed;
  z-index: 10000;
  background: #fff;
  border: 1px solid var(--win-border, #d6d6d6);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 4px 0;
  min-width: 120px;
}
.action-menu-item {
  padding: 7px 16px;
  font-size: 13px;
  color: var(--win-text, #212121);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}
.action-menu-item:hover { background: #e5f3ff; }

/* 网格视图 */
.grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  padding: 12px;
  align-content: start;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  text-align: center;
  user-select: none;
}

.grid-item:hover { background: #e5f3ff; }
.grid-item.selected { background: var(--win-selected); border-color: var(--win-selected-border); }
.grid-item.is-cut { opacity: 0.5; }

.grid-item .icon {
  width: 64px;
  height: 64px;
  font-size: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  margin-bottom: 6px;
  flex-shrink: 0;
}

.grid-item .name {
  font-size: 12px;
  word-break: break-all;
  line-height: 1.4;
  max-height: 2.8em;
  overflow: hidden;
  width: 100%;
}

/* 网格图片缩略图 */
.grid-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
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
