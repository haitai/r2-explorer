// Cloudflare Pages Function — 认证中间件
// 验证密码并返回 JWT token

export async function onRequestPost(context) {
  const { request, env } = context
  const { password } = await request.json()

  // 如果 AUTH_PASSWORD 为空，则无需密码，直接通过
  if (!env.AUTH_PASSWORD) {
    return new Response(JSON.stringify({ token: 'open', authenticated: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (password !== env.AUTH_PASSWORD) {
    return new Response(JSON.stringify({ error: '密码错误' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 简单 token：用 base64 编码密码 + 时间戳作为 token
  const token = btoa(`${password}:${Date.now()}`)

  return new Response(JSON.stringify({ token, authenticated: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
