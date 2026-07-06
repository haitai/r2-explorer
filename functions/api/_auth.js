// Cloudflare Pages Function — 认证验证中间件
// 所有受保护的 API 路由应使用此中间件

export async function verifyAuth(request, env) {
  // 如果 AUTH_PASSWORD 为空，无需验证
  if (!env.AUTH_PASSWORD) return true

  // 优先从 Authorization header 获取 token
  const authHeader = request.headers.get('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    try {
      const decoded = atob(token)
      const [password] = decoded.split(':')
      return password === env.AUTH_PASSWORD
    } catch {
      return false
    }
  }

  // 其次从 URL query string 获取 token（用于图片缩略图等无法设置 header 的场景）
  const url = new URL(request.url)
  const queryToken = url.searchParams.get('token')
  if (queryToken) {
    try {
      const decoded = atob(queryToken)
      const [password] = decoded.split(':')
      return password === env.AUTH_PASSWORD
    } catch {
      return false
    }
  }

  return false
}
