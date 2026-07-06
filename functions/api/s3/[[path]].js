// Cloudflare Pages Function — S3 兼容 API 代理
// 通过 R2 S3 兼容接口操作任意桶的对象
// 需要环境变量: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

import { verifyAuth } from '../_auth.js'
import { signV4 } from './_sign.js'
import { sha256Hex } from './_sign.js'

async function md5Base64Fn(data) {
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const hash = await crypto.subtle.digest('MD5', data)
  return bufToBase64(hash)
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseDeleteResultXml(xml) {
  // <DeleteResult> 中每个 <Object> 返回 <Key> 和 <DeleteMarker> / <Error>
  const results = []
  for (const obj of xml.matchAll(/<Object>([\s\S]*?)<\/Object>/g)) {
    const content = obj[1]
    const hasError = /<Error>/.test(content)
    results.push(!hasError)
  }
  return results
}

// === S3 兼容 API 路由处理 ===
export async function onRequest(context) {
  const { request, env } = context

  if (!await verifyAuth(request, env)) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.CF_ACCOUNT_ID) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const method = request.method
  // 注意: Pages Function [[path]] 路由会自动解码 URL 中的 %2F
  // 所以 pathname 中 key 部分已经是解码后的原始路径
  const pathParts = url.pathname.replace('/api/s3/', '').split('/')
  const bucket = pathParts[0]
  // url.pathname 中 %XX 编码未被自动解码，需要手动 decode 得到原始 key
  const rawKey = pathParts.slice(1).join('/') || ''
  const key = rawKey ? decodeURIComponent(rawKey) : ''

  if (!bucket) {
    return new Response(JSON.stringify({ error: 'Bucket name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const accountId = env.CF_ACCOUNT_ID
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

  // === 列出对象 (GET /api/s3/{bucket}?list=true) ===
  if (method === 'GET' && url.searchParams.get('list') === 'true') {
    const prefix = url.searchParams.get('prefix') || ''
    const delimiter = url.searchParams.get('delimiter') || '/'
    const maxKeys = url.searchParams.get('max_keys') || '1000'
    const contToken = url.searchParams.get('continuation_token') || ''

    const queryParams = {
      'list-type': '2',
      'prefix': prefix,
      'delimiter': delimiter,
      'max-keys': maxKeys,
    }
    if (contToken) queryParams['continuation-token'] = contToken

    // S3: canonicalUri 不编码，就是 /bucket
    const canonicalUri = `/${bucket}`
    const signed = await signV4('GET', bucket, canonicalUri, queryParams, {}, null, env)

    const res = await fetch(`${endpoint}${signed.requestUrl}`, { method: 'GET', headers: signed.headers })

    if (!res.ok) {
      const errorXml = await res.text()
      console.error('S3 ListObjects error:', res.status, errorXml)
      return new Response(JSON.stringify({ error: `S3 API error: ${res.status}`, detail: errorXml }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const xml = await res.text()
    const json = parseListXml(xml, prefix)
    return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } })
  }

  // === 下载/预览对象 (GET /api/s3/{bucket}/{key} 或 GET ...?download=true) ===
  if (method === 'GET' && key) {
    // S3 规范: canonicalUri 不做 URI 编码，用原始 key
    const canonicalUri = `/${bucket}/${key}`
    const signed = await signV4('GET', bucket, canonicalUri, {}, {}, null, env)

    const s3Url = `${endpoint}${signed.requestUrl}`
    console.log('S3 GET object:', s3Url, 'origKey:', key)

    const res = await fetch(s3Url, { method: 'GET', headers: signed.headers })

    if (!res.ok) {
      const errText = await res.text()
      console.error('S3 GET object error:', res.status, errText)
      return new Response(JSON.stringify({ error: `S3 error: ${res.status}`, key, detail: errText }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const newHeaders = new Headers()
    const ct = res.headers.get('content-type')
    if (ct) newHeaders.set('content-type', ct)
    const cl = res.headers.get('content-length')
    if (cl) newHeaders.set('content-length', cl)
    const lm = res.headers.get('last-modified')
    if (lm) newHeaders.set('last-modified', lm)

    const viewable = ['image/', 'text/', 'application/pdf', 'video/', 'audio/'].some(t => (ct || '').startsWith(t))
    // 前端传 ?download=true 时强制下载，否则可预览类型不加 attachment header
    const forceDownload = url.searchParams.get('download') === 'true'
    if (!viewable || forceDownload) newHeaders.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`)

    return new Response(res.body, { status: res.status, headers: newHeaders })
  }

  // === 上传对象 (PUT /api/s3/{bucket}/{key}) ===
  if (method === 'PUT' && key) {
    const bodyBuffer = await request.arrayBuffer()
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream'

    // PUT 上传使用 UNSIGNED-PAYLOAD 避免 body hash 计算问题
    // （Workers 环境下 body 可能被修改，如 Content-Length 不匹配）
    const canonicalUri = `/${bucket}/${key}`
    const signed = await signV4('PUT', bucket, canonicalUri, {}, {
      'content-type': contentType,
    }, null, env) // body=null → UNSIGNED-PAYLOAD
    // fetch 会自动处理 content-type，无需再次设置

    console.log('S3 PUT:', key, 'size:', bodyBuffer.byteLength, 'contentType:', contentType)

    const res = await fetch(`${endpoint}${signed.requestUrl}`, {
      method: 'PUT', headers: signed.headers, body: bodyBuffer,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('S3 PUT error:', res.status, errText)
      return new Response(JSON.stringify({ error: `S3 PUT failed: ${res.status}`, key, detail: errText }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ key, size: bodyBuffer.byteLength, uploaded: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // === 删除对象 (DELETE /api/s3/{bucket}/{key}) ===
  if (method === 'DELETE' && key) {
    const canonicalUri = `/${bucket}/${key}`
    const signed = await signV4('DELETE', bucket, canonicalUri, {}, {}, null, env)

    const res = await fetch(`${endpoint}${signed.requestUrl}`, {
      method: 'DELETE', headers: signed.headers,
    })

    if (!res.ok && res.status !== 204) {
      const errText = await res.text()
      console.error('S3 DELETE error:', res.status, errText)
      return new Response(JSON.stringify({ error: `S3 DELETE failed: ${res.status}`, key, detail: errText }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ key, deleted: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // === 批量删除 (POST /api/s3/{bucket} body={ keys: [...] }) ===
  if (method === 'POST') {
    const body = await request.json()

    if (body.keys) {
      const results = []
      for (const k of body.keys) {
        if (k.endsWith('/')) {
          // 文件夹：先递归列出所有对象并删除，再删文件夹本身
          let contToken = ''
          let page = 0
          do {
            page++
            const listParams = { 'list-type': '2', 'prefix': k, 'delimiter': '', 'max-keys': '1000' }
            if (contToken) listParams['continuation-token'] = contToken
            const listSign = await signV4('GET', bucket, `/${bucket}`, listParams, {}, null, env)
            const listRes = await fetch(`${endpoint}${listSign.requestUrl}`, {
              method: 'GET', headers: listSign.headers,
            })
            if (!listRes.ok) {
              console.error('List for delete error:', listRes.status, await listRes.text())
              results.push({ key: k, deleted: false, error: `list failed: ${listRes.status}` })
              break
            }
            const listXml = await listRes.text()
            const objKeys = []
            for (const block of listXml.matchAll(/<Contents>[\s\S]*?<\/Contents>/g)) {
              const km = block[0].match(/<Key>([^<]+)<\/Key>/)
              if (km) objKeys.push(km[1])
            }
            const contMatch = listXml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
            contToken = contMatch ? contMatch[1] : ''

            for (const objKey of objKeys) {
              const delUri = `/${bucket}/${objKey}`
              const delSign = await signV4('DELETE', bucket, delUri, {}, {}, null, env)
              const delRes = await fetch(`${endpoint}${delSign.requestUrl}`, {
                method: 'DELETE', headers: delSign.headers,
              })
              results.push({ key: objKey, deleted: delRes.ok || delRes.status === 204 })
            }
          } while (contToken && page < 100) // 防止无限循环，最多 100 页

          // 最后删文件夹 marker 本身
          const markerUri = `/${bucket}/${k}`
          const markerSign = await signV4('DELETE', bucket, markerUri, {}, {}, null, env)
          const markerRes = await fetch(`${endpoint}${markerSign.requestUrl}`, {
            method: 'DELETE', headers: markerSign.headers,
          })
          results.push({ key: k, deleted: markerRes.ok || markerRes.status === 204 })
        } else {
          // 普通文件直接删除
          const canonicalUri = `/${bucket}/${k}`
          const signed = await signV4('DELETE', bucket, canonicalUri, {}, {}, null, env)
          const res = await fetch(`${endpoint}${signed.requestUrl}`, {
            method: 'DELETE', headers: signed.headers,
          })
          results.push({ key: k, deleted: res.ok || res.status === 204 })
        }
      }
      return new Response(JSON.stringify({ results }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (body.action === 'copy' && body.src && body.dst) {
      // GET src → PUT dst
      const srcCanonicalUri = `/${bucket}/${body.src}`
      const srcSigned = await signV4('GET', bucket, srcCanonicalUri, {}, {}, null, env)
      const srcRes = await fetch(`${endpoint}${srcSigned.requestUrl}`, {
        method: 'GET', headers: srcSigned.headers,
      })
      if (!srcRes.ok) {
        const errText = await srcRes.text()
        return new Response(JSON.stringify({ error: `Source not found: ${body.src}`, detail: errText }), {
          status: 404, headers: { 'Content-Type': 'application/json' },
        })
      }
      const srcBody = await srcRes.arrayBuffer()
      const srcCt = srcRes.headers.get('content-type') || 'application/octet-stream'

      const dstCanonicalUri = `/${bucket}/${body.dst}`
      const dstSigned = await signV4('PUT', bucket, dstCanonicalUri, {}, { 'content-type': srcCt }, null, env) // UNSIGNED-PAYLOAD
      // fetch 会自动处理 content-type

      const dstRes = await fetch(`${endpoint}${dstSigned.requestUrl}`, {
        method: 'PUT', headers: dstSigned.headers, body: srcBody,
      })

      if (!dstRes.ok) {
        const errText = await dstRes.text()
        return new Response(JSON.stringify({ error: `Copy PUT failed: ${dstRes.status}`, detail: errText }), {
          status: dstRes.status, headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ src: body.src, dst: body.dst, copied: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown POST action' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}

// === 解析 S3 ListObjectsV2 XML ===
function parseListXml(xml, requestPrefix = '') {
  const result = { objects: [], prefixes: [], truncated: false, nextContinuationToken: '' }

  const truncatedMatch = xml.match(/<IsTruncated>(true|false)<\/IsTruncated>/)
  if (truncatedMatch) result.truncated = truncatedMatch[1] === 'true'

  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
  if (tokenMatch) result.nextContinuationToken = tokenMatch[1]

  // CommonPrefixes (文件夹)
  for (const block of xml.matchAll(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g)) {
    const pm = block[0].match(/<Prefix>([^<]+)<\/Prefix>/)
    if (pm) result.prefixes.push(pm[1])
  }

  // Contents (文件)
  for (const block of xml.matchAll(/<Contents>[\s\S]*?<\/Contents>/g)) {
    const keyM = block[0].match(/<Key>([^<]+)<\/Key>/)
    const sizeM = block[0].match(/<Size>([^<]+)<\/Size>/)
    const dateM = block[0].match(/<LastModified>([^<]+)<\/LastModified>/)
    const etagM = block[0].match(/<ETag>"?([^"<]+)"?\s*<\/ETag>/)
    if (keyM) {
      const size = sizeM ? parseInt(sizeM[1]) : 0
      // 过滤掉文件夹 marker（key 以 / 结尾且 size=0）
      if (keyM[1].endsWith('/') && size === 0) continue
      result.objects.push({
        key: keyM[1],
        size,
        lastModified: dateM ? dateM[1] : '',
        etag: etagM ? etagM[1] : '',
      })
    }
  }

  return result
}


