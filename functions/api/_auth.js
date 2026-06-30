// Cloudflare Pages Function — 认证验证中间件
// 所有受保护的 API 路由应使用此中间件

export async function verifyAuth(request, env) {
  // 如果 AUTH_PASSWORD 为空，无需验证
  if (!env.AUTH_PASSWORD) return true

  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)
  try {
    const decoded = atob(token)
    const [password] = decoded.split(':')
    return password === env.AUTH_PASSWORD
  } catch {
    return false
  }
}
