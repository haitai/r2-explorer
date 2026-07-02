// Cloudflare Pages Function — S3 兼容 API 代理
// 通过 R2 S3 兼容接口操作任意桶的对象
// 需要环境变量: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY

import { verifyAuth } from '../_auth.js'

// === AWS Signature V4 签名 ===
// R2 S3 兼容实现要求 canonical URI 做 URI 编码（/ 不编码）
// 注意: 这与 AWS S3 文档规范不同（AWS S3 不编码 canonical URI），但 R2 的行为是编码
// - canonicalUri: 原始未编码的路径（传入参数），签名计算时自动编码
// - canonicalQuerystring: 查询参数必须按 key 排序，key/value 分别 URI 编码

async function signV4(method, bucket, canonicalUri, queryParams, extraHeaders, body, env) {
  const accessKey = env.R2_ACCESS_KEY_ID
  const secretKey = env.R2_SECRET_ACCESS_KEY
  const accountId = env.CF_ACCOUNT_ID
  const host = `${accountId}.r2.cloudflarestorage.com`

  const service = 's3'
  const region = 'auto'
  const now = new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const dateStamp = amzDate.slice(0, 8)

  const payloadHash = body ? await sha256Hex(body) : 'UNSIGNED-PAYLOAD'

  // AWS V4 规范: 所有 header name 必须小写
  const allHeaders = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  // extraHeaders 中的 key 统一转为小写
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    allHeaders[k.toLowerCase()] = v
  }

  // 构建规范查询字符串（参数按 key 字典序排列，key/value 分别 URI 编码）
  const sortedKeys = Object.keys(queryParams || {}).sort()
  const canonicalQuerystring = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')

  const signedHeaderKeys = Object.keys(allHeaders).sort()
  const signedHeadersStr = signedHeaderKeys.join(';')
  const canonicalHeaders = signedHeaderKeys
    .map(k => `${k}:${allHeaders[k]?.toString().trim()}`)
    .join('\n') + '\n'

  // R2 S3 兼容: canonicalUri 需要 URI 编码（/ 不编码）
  // 这与 AWS S3 规范不同（AWS S3 不编码），但 R2 的实现要求编码
  const encodedCanonicalUri = canonicalUri.split('/').map(s => encodeURIComponent(s)).join('/')

  // Canonical Request
  const canonicalRequest = [
    method,
    encodedCanonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = await hmacChain(secretKey, dateStamp, region, service)
  const signature = await hmacHex(signingKey, stringToSign)

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`
  const requestHeaders = { ...allHeaders, Authorization: authHeader }
  delete requestHeaders.host // fetch 会自动设置 host

  // 实际请求 URL: 路径部分也用编码后的 canonicalUri
  const queryString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')
  const requestUrl = queryString ? `${encodedCanonicalUri}?${queryString}` : encodedCanonicalUri

  return { host, headers: requestHeaders, requestUrl }
}

async function sha256Hex(data) {
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufToHex(hash)
}

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

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256(key, data) {
  if (typeof key === 'string') key = new TextEncoder().encode(key)
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', cryptoKey, data)
}

async function hmacHex(key, data) {
  return bufToHex(await hmacSha256(key, data))
}

async function hmacChain(secretKey, date, region, service) {
  let k = await hmacSha256('AWS4' + secretKey, date)
  k = await hmacSha256(k, region)
  k = await hmacSha256(k, service)
  k = await hmacSha256(k, 'aws4_request')
  return k
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
  const key = pathParts.slice(1).join('/') ? decodeURIComponent(pathParts.slice(1).join('/')) : ''

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
      // 使用 S3 DeleteObjects API（POST ?delete + XML body）
      const xmlBody = '<?xml version="1.0" encoding="UTF-8"?><Delete>' +
        body.keys.map(k => `<Object><Key>${escapeXml(k)}</Key></Object>`).join('') +
        '</Delete>'
      const md5Base64 = await md5Base64Fn(xmlBody)

      const canonicalUri = `/${bucket}`
      const queryParams = { 'delete': '' }
      const signed = await signV4('POST', bucket, canonicalUri, queryParams, {
        'content-type': 'application/xml',
        'content-md5': md5Base64,
      }, xmlBody, env)

      const deleteUrl = `${endpoint}${signed.requestUrl}`
      const res = await fetch(deleteUrl, {
        method: 'POST',
        headers: signed.headers,
        body: xmlBody,
      })

      if (!res.ok && res.status !== 200) {
        const errText = await res.text()
        console.error('S3 DeleteObjects error:', res.status, errText)
        return new Response(JSON.stringify({ error: `DeleteObjects failed: ${res.status}`, detail: errText }), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const resText = await res.text()
      const deleteResults = parseDeleteResultXml(resText)
      const results = body.keys.map((k, i) => ({ key: k, deleted: deleteResults[i] }))
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
