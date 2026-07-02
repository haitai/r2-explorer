// Cloudflare REST API 代理 — 管理所有 R2 存储桶
// 使用 CF_ACCOUNT_ID + CF_API_TOKEN 通过 Cloudflare API 管理桶级别操作

import { verifyAuth } from './_auth.js'
import { signV4 } from './s3/_sign.js'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

function cfHeaders(env) {
  return {
    'Authorization': `Bearer ${env.CF_API_TOKEN}`,
    'Content-Type': 'application/json',
  }
}

export async function onRequestGet(context) {
  const { request, env } = context
  if (!await verifyAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const action = url.searchParams.get('action') || 'list'

  // === 列出所有 R2 存储桶 ===
  if (action === 'list') {
    const cursor = url.searchParams.get('cursor') || ''
    const perPage = url.searchParams.get('per_page') || '100'
    const nameContains = url.searchParams.get('name_contains') || ''

    let cfUrl = `${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets?per_page=${perPage}`
    if (cursor) cfUrl += `&cursor=${cursor}`
    if (nameContains) cfUrl += `&name_contains=${nameContains}`

    const res = await fetch(cfUrl, { headers: cfHeaders(env) })
    const data = await res.json()

    if (!data.success) {
      return new Response(JSON.stringify({ error: data.errors }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const rawBuckets = data.result.buckets || []

    // 并行获取每个桶的对象数量（轻量请求，只取第一页）
    const accountId = env.CF_ACCOUNT_ID
    const endpoint = accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null

    const countPromises = rawBuckets.map(async (b) => {
      if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        return { name: b.name, objectCount: null }
      }
      try {
        const signed = await signV4('GET', b.name, `/${b.name}`, {
          'list-type': '2', 'max-keys': '1', 'delimiter': '',
        }, {}, null, env)
        const res = await fetch(`${endpoint}${signed.requestUrl}`, {
          method: 'GET', headers: signed.headers,
        })
        if (!res.ok) return { name: b.name, objectCount: null }
        const xml = await res.text()
        const truncated = xml.includes('<IsTruncated>true</IsTruncated>')
        // 只有 IsTruncated=true 才说明有对象；如果返回空结果（无 Contents），也是空的
        const hasObjects = xml.includes('<Contents>')
        return { name: b.name, objectCount: truncated || hasObjects ? '?' : 0 }
      } catch {
        return { name: b.name, objectCount: null }
      }
    })

    const counts = await Promise.all(countPromises)
    const countMap = Object.fromEntries(counts.map(c => [c.name, c.objectCount]))
    const buckets = rawBuckets.map(b => ({ ...b, objectCount: countMap[b.name] ?? null }))

    return new Response(JSON.stringify({
      buckets,
      cursor: data.result_info?.cursor || null,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // === 创建存储桶 ===
  if (action === 'create') {
    const name = url.searchParams.get('name')
    const location = url.searchParams.get('location') || 'apac'
    const storageClass = url.searchParams.get('storage_class') || 'Standard'

    if (!name) {
      return new Response(JSON.stringify({ error: 'name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets`, {
      method: 'POST',
      headers: cfHeaders(env),
      body: JSON.stringify({ name, location, storageClass }),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // === 删除存储桶 ===
  if (action === 'delete') {
    const name = url.searchParams.get('name')
    if (!name) {
      return new Response(JSON.stringify({ error: 'name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets/${name}`, {
      method: 'DELETE',
      headers: cfHeaders(env),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // === 获取存储桶详情 ===
  if (action === 'get') {
    const name = url.searchParams.get('name')
    if (!name) {
      return new Response(JSON.stringify({ error: 'name required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets/${name}`, {
      headers: cfHeaders(env),
    })
    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

// POST — 创建存储桶
export async function onRequestPost(context) {
  const { request, env } = context
  if (!await verifyAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json()
  const { name, location, storageClass } = body

  if (!name) {
    return new Response(JSON.stringify({ error: 'name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets`, {
    method: 'POST',
    headers: cfHeaders(env),
    body: JSON.stringify({
      name,
      location: location || 'apac',
      storageClass: storageClass || 'Standard',
    }),
  })
  const data = await res.json()
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// DELETE — 删除存储桶
export async function onRequestDelete(context) {
  const { request, env } = context
  if (!await verifyAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const url = new URL(request.url)
  const name = url.searchParams.get('name')

  if (!name) {
    return new Response(JSON.stringify({ error: 'name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch(`${CF_API_BASE}/accounts/${env.CF_ACCOUNT_ID}/r2/buckets/${name}`, {
    method: 'DELETE',
    headers: cfHeaders(env),
  })
  const data = await res.json()
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
}
