<template>
  <div id="app-root">
    <router-view />
  </div>
</template>

<script setup>
</script>

<style>
:root {
  --win-bg: #ffffff;
  --win-border: #d5d5d5;
  --win-sidebar: #ffffff;
  --win-sidebar-hover: #cde8ff;
  --win-sidebar-selected: #cccccc;
  --win-selected: #cce8ff;
  --win-selected-border: #99d1ff;
  --win-toolbar-bg: #fafafa;
  --win-titlebar: #ffffff;
  --win-text: #1a1a1a;
  --win-text-secondary: #616161;
  --win-icon-folder: #e8b230;
  --win-icon-file: #4a90d9;
  --win-accent: #0078d4;
  --win-danger: #e81123;
  --win-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

#app-root {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--win-bg);
  color: var(--win-text);
}

/* Windows 资源管理器风格通用样式 */
.win-titlebar {
  height: 32px;
  background: var(--win-titlebar);
  border-bottom: 1px solid var(--win-border);
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 12px;
  user-select: none;
}

.win-toolbar {
  height: 48px;
  background: var(--win-toolbar-bg);
  border-bottom: 1px solid var(--win-border);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
}

.win-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: var(--win-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.win-toolbar-btn.icon-only {
  padding: 4px 8px;
}

.win-toolbar-btn:hover {
  background: #e5e5e5;
  border-color: var(--win-border);
}

.win-toolbar-btn:active {
  background: #ccc;
}

.win-toolbar-btn.primary {
  color: var(--win-accent);
}

.win-toolbar-btn.danger {
  color: var(--win-danger);
}

.win-addressbar {
  height: 32px;
  background: #fff;
  border: 1px solid var(--win-border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 13px;
  flex: 1;
}

.win-addressbar input {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 13px;
  outline: none;
  color: var(--win-text);
}

.win-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.win-sidebar {
  background: var(--win-sidebar);
  border-right: 1px solid var(--win-border);
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
  white-space: nowrap;
}

.sidebar-resizer {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}
.sidebar-resizer:hover,
.sidebar-resizer.dragging {
  background: var(--win-accent);
}

.win-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: #fff;
  position: relative;
}

.win-statusbar {
  height: 24px;
  background: var(--win-bg);
  border-top: 1px solid var(--win-border);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  color: var(--win-text-secondary);
  gap: 16px;
}

/* 文件项样式 */
.file-item {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
  font-size: 13px;
  min-height: 24px;
}

.file-item:hover {
  background: #e5f3ff;
}

.file-item.selected {
  background: var(--win-selected);
  border-color: var(--win-selected-border);
}

.file-item .icon {
  width: 20px;
  height: 20px;
  margin-right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.file-item .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item .size, .file-item .date {
  width: 80px;
  text-align: right;
  color: var(--win-text-secondary);
  font-size: 12px;
}

/* 详情视图列头 */
.detail-header {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  background: var(--win-bg);
  border-bottom: none;
  font-size: 12px;
  color: var(--win-text-secondary);
  user-select: none;
  position: sticky;
  top: 0;
}

.detail-header .col {
  cursor: pointer;
  padding: 2px 4px;
  border-right: 1px solid var(--win-border);
}

.detail-header .col.name { flex: 1; min-width: 200px; }
.detail-header .col.size { width: 80px; }
.detail-header .col.date { width: 120px; }
.detail-header .col.type { width: 120px; }

/* 侧栏树节点 */
.tree-node {
  padding: 6px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  border-radius: 3px;
  margin: 1px 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-node:hover {
  background: var(--win-sidebar-hover);
}

.tree-node.active {
  background: var(--win-sidebar-selected);
  font-weight: 500;
}

.tree-node .expand-icon {
  width: 16px;
  font-size: 10px;
  text-align: center;
}

/* 上下文菜单 */
.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid var(--win-border);
  box-shadow: var(--win-shadow);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 180px;
  z-index: 9999;
}

.context-menu-item {
  padding: 6px 24px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-menu-item {
  padding: 6px 16px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu-item:hover {
  background: var(--win-selected);
}

.context-menu-item.danger {
  color: var(--win-danger);
}

.context-menu-sep {
  height: 1px;
  background: var(--win-border);
  margin: 4px 8px;
}

/* 模态对话框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-box {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  min-width: 360px;
  max-width: 500px;
}

.modal-header {
  padding: 16px 20px 12px;
  font-size: 14px;
  font-weight: 600;
}

.modal-body {
  padding: 12px 20px;
}

.modal-footer {
  padding: 12px 20px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-btn {
  padding: 6px 20px;
  border: 1px solid var(--win-border);
  border-radius: 4px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.modal-btn:hover {
  background: #e9e9e9;
}

.modal-btn.primary {
  background: var(--win-accent);
  color: #fff;
  border-color: var(--win-accent);
}

.modal-btn.primary:hover {
  background: #106ebe;
}

.modal-btn.danger {
  background: var(--win-danger);
  color: #fff;
  border-color: var(--win-danger);
}

/* 进度条 */
.progress-bar {
  height: 4px;
  background: var(--win-border);
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar .fill {
  height: 100%;
  background: var(--win-accent);
  transition: width 0.3s;
}

/* 网格视图 */
.grid-view {
  display: flex;
  flex-wrap: wrap;
  padding: 8px;
  gap: 4px;
}

.grid-item {
  width: 90px;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: 4px;
  transition: all 0.15s;
  text-align: center;
}

.grid-item:hover {
  background: #e5f3ff;
  border-color: #cde;
}

.grid-item.selected {
  background: var(--win-selected);
  border-color: var(--win-selected-border);
}

.grid-item .icon {
  font-size: 36px;
  line-height: 1;
}

.grid-item .name {
  font-size: 11px;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 84px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--win-text-secondary);
}

.empty-state .icon {
  font-size: 48px;
  opacity: 0.4;
}

.empty-state .text {
  font-size: 14px;
  margin-top: 12px;
}

/* Loading spinner */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: var(--win-text-secondary);
}

.loading::before {
  content: '';
  width: 20px;
  height: 20px;
  border: 2px solid var(--win-border);
  border-top-color: var(--win-accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  margin-right: 8px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

