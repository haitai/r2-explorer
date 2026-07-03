// R2 API 客户端 — 多桶版本
// 所有桶级别操作通过 Cloudflare REST API
// 所有对象级别操作通过 S3 兼容 API 代理（Workers Pages Function）

const API_BASE = '/api'

class R2Client {
  constructor() {
    this.authToken = localStorage.getItem('r2_token') || ''
    this.currentBucket = localStorage.getItem('r2_bucket') || ''
  }

  setToken(token) {
    this.authToken = token
    localStorage.setItem('r2_token', token)
  }

  clearToken() {
    this.authToken = ''
    localStorage.removeItem('r2_token')
    localStorage.removeItem('r2_bucket')
  }

  setBucket(bucket) {
    this.currentBucket = bucket
    localStorage.setItem('r2_bucket', bucket)
  }

  async _request(path, options = {}) {
    const headers = { ...(options.headers || {}) }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
    if (res.status === 401) {
      this.clearToken()
      throw new Error('AUTH_EXPIRED')
    }
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`API_ERROR: ${res.status} ${text}`)
    }
    return res
  }

  // === 认证 ===
  async login(password) {
    const res = await fetch(`${API_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) throw new Error('LOGIN_FAILED')
    const data = await res.json()
    this.setToken(data.token)
    return data
  }

  // === 存储桶管理 (Cloudflare REST API) ===
  async listBuckets(cursor = '', nameContains = '') {
    let path = `/buckets?action=list&per_page=100`
    if (cursor) path += `&cursor=${cursor}`
    if (nameContains) path += `&name_contains=${encodeURIComponent(nameContains)}`
    const res = await this._request(path)
    return res.json()
  }

  async createBucket(name, location = 'apac', storageClass = 'Standard') {
    const res = await this._request(`/buckets?action=create&name=${encodeURIComponent(name)}&location=${location}&storage_class=${storageClass}`)
    return res.json()
  }

  async deleteBucket(name) {
    const res = await this._request(`/buckets?action=delete&name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    return res.json()
  }

  async getBucketInfo(name) {
    const res = await this._request(`/buckets?action=get&name=${encodeURIComponent(name)}`)
    return res.json()
  }

  // === 对象操作 (S3 兼容 API 代理) ===

  // 列出 bucket 内的对象（支持 prefix + delimiter 实现目录浏览）
  async listObjects(bucket, prefix = '', delimiter = '/') {
    const params = new URLSearchParams()
    params.set('list', 'true')
    if (prefix) params.set('prefix', prefix)
    if (delimiter) params.set('delimiter', delimiter)
    const res = await this._request(`/s3/${bucket}?${params}`)
    return res.json()
  }

  // 下载对象
  async getObject(bucket, key) {
    const res = await this._request(`/s3/${bucket}/${encodeURIComponent(key)}`)
    return res
  }

  // 获取对象下载 URL
  getDownloadUrl(bucket, key) {
    return `${API_BASE}/s3/${bucket}/${encodeURIComponent(key)}`
  }

  // 上传对象
  async putObject(bucket, key, file) {
    const res = await this._request(`/s3/${bucket}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    return res.json()
  }

  // 删除对象
  async deleteObject(bucket, key) {
    const res = await this._request(`/s3/${bucket}/${encodeURIComponent(key)}`, { method: 'DELETE' })
    return res.json()
  }

  // 批量删除
  async deleteObjects(bucket, keys) {
    const res = await this._request(`/s3/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    })
    return res.json()
  }

  // 创建"文件夹"
  async createFolder(bucket, prefix) {
    const key = prefix.endsWith('/') ? prefix : prefix + '/'
    const res = await this._request(`/s3/${bucket}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: '',
      headers: { 'Content-Type': 'application/octet-stream', 'x-r2-folder-marker': 'true' },
    })
    return res.json()
  }

  // 复制对象（通过 get + put 实现）
  async copyObject(bucket, srcKey, dstKey) {
    const srcObj = await this.getObject(bucket, srcKey)
    const body = await srcObj.arrayBuffer()
    const contentType = srcObj.headers.get('content-type') || 'application/octet-stream'
    return this.putObject(bucket, dstKey, new Blob([body], { type: contentType }))
  }

  // 移动对象（copy + delete）
  async moveObject(bucket, srcKey, dstKey) {
    await this.copyObject(bucket, srcKey, dstKey)
    return this.deleteObject(bucket, srcKey)
  }

  // 上传对象（原始响应，不 parse JSON）
  async putObjectRaw(bucket, key, blob, contentType) {
    const res = await this._request(`/s3/${bucket}/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: blob,
      headers: { 'Content-Type': contentType },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`上传失败: ${res.status} ${text}`)
    }
    return res
  }

  // 跨桶复制：客户端中转 GET 源桶 → PUT 目标桶
  async crossBucketCopy(srcBucket, srcKey, dstBucket, dstKey) {
    const res = await this.getObject(srcBucket, srcKey)
    if (!res.ok) throw new Error(`读取源文件失败: ${res.status}`)
    const blob = await res.blob()
    const contentType = res.headers.get('Content-Type') || 'application/octet-stream'
    return this.putObjectRaw(dstBucket, dstKey, blob, contentType)
  }

  // 重命名
  async renameObject(bucket, oldKey, newKey) {
    return this.moveObject(bucket, oldKey, newKey)
  }
}

export default new R2Client()
