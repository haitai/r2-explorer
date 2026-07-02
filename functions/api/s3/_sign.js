// AWS Signature V4 — R2 S3 兼容签名（共享模块）
// 被 s3/[[path]].js 和 buckets.js 共用

export async function signV4(method, bucket, canonicalUri, queryParams, extraHeaders, body, env) {
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

  const allHeaders = {
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  for (const [k, v] of Object.entries(extraHeaders || {})) {
    allHeaders[k.toLowerCase()] = v
  }

  const sortedKeys = Object.keys(queryParams || {}).sort()
  const canonicalQuerystring = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')

  const signedHeaderKeys = Object.keys(allHeaders).sort()
  const signedHeadersStr = signedHeaderKeys.join(';')
  const canonicalHeaders = signedHeaderKeys
    .map(k => `${k}:${allHeaders[k]?.toString().trim()}`)
    .join('\n') + '\n'

  const encodedCanonicalUri = canonicalUri.split('/').map(s => encodeURIComponent(s)).join('/')

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
  delete requestHeaders.host

  const queryString = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&')
  const requestUrl = queryString ? `${encodedCanonicalUri}?${queryString}` : encodedCanonicalUri

  return { host, headers: requestHeaders, requestUrl }
}

export async function sha256Hex(data) {
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bufToHex(hash)
}

export function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function hmacSha256(key, data) {
  if (typeof key === 'string') key = new TextEncoder().encode(key)
  if (typeof data === 'string') data = new TextEncoder().encode(data)
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', cryptoKey, data)
}

export async function hmacHex(key, data) {
  return bufToHex(await hmacSha256(key, data))
}

export async function hmacChain(secretKey, date, region, service) {
  let k = await hmacSha256('AWS4' + secretKey, date)
  k = await hmacSha256(k, region)
  k = await hmacSha256(k, service)
  k = await hmacSha256(k, 'aws4_request')
  return k
}
