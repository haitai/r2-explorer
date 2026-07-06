<template>
  <div class="login-page" @keydown.enter="doLogin">
    <!-- 实时时钟 -->
    <div class="clock-area">
      <div class="clock-time">{{ clockTime }}</div>
      <div class="clock-date">{{ clockDate }}</div>
    </div>

    <!-- 居中登录面板 -->
    <div class="login-center" :class="{ 'slide-in': showPanel, 'shake': shakeAnim }">
      <div class="user-avatar">
        <svg viewBox="0 0 80 80" width="80" height="80">
          <circle cx="40" cy="40" r="39" fill="#0078d4"/>
          <circle cx="40" cy="28" r="12" fill="#fff"/>
          <path d="M16 68 a24 24 0 0 1 48 0" fill="#fff"/>
        </svg>
      </div>
      <div class="user-name">Administrator</div>
      <div class="pwd-row">
        <input
          ref="pwdInput"
          v-model="password"
          type="password"
          placeholder="密码"
          class="pwd-input"
          @keyup.enter="doLogin"
          autofocus
        />
        <button class="pwd-arrow" @click="doLogin" :disabled="loading" aria-label="提交">
          <svg viewBox="0 0 20 20" width="20" height="20"><path d="M9 4l7 6-7 6" fill="#fff"/></svg>
        </button>
      </div>
      <div v-if="loading" class="loading-indicator">
        <svg class="spinner" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="12" cy="12" r="10" stroke="#fff" stroke-width="2" fill="none" stroke-dasharray="60" stroke-dashoffset="20"/>
        </svg>
        <span>正在验证...</span>
      </div>
      <div v-if="error && !loading" class="error-text">{{ error }}</div>
    </div>

    <!-- 页脚 -->
    <div class="login-footer">R2 Explorer · Cloudflare R2 资源管理器</div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import r2client from '../api/r2client.js'

const router = useRouter()
const password = ref('')
const loading = ref(false)
const error = ref('')
const showPanel = ref(false)
const shakeAnim = ref(false)
const pwdInput = ref(null)
const clockTime = ref('')
const clockDate = ref('')
let clockTimer = null

function updateClock() {
  const now = new Date()
  const h = now.getHours().toString().padStart(2, '0')
  const m = now.getMinutes().toString().padStart(2, '0')
  clockTime.value = `${h}:${m}`
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const month = (now.getMonth() + 1).toString()
  const day = now.getDate().toString()
  clockDate.value = `${month}月${day}日, ${weekdays[now.getDay()]}`
}

async function doLogin() {
  if (!password.value || loading.value) return
  loading.value = true
  error.value = ''
  shakeAnim.value = false
  try {
    await r2client.login(password.value)
    router.push('/')
  } catch (e) {
    if (e.message === 'LOGIN_FAILED') {
      error.value = '密码错误'
    } else {
      error.value = e.message
    }
    shakeAnim.value = true
    setTimeout(() => { shakeAnim.value = false }, 600)
    setTimeout(() => { password.value = ''; pwdInput.value?.focus() }, 700)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  setTimeout(() => { showPanel.value = true }, 400)
})

onUnmounted(() => {
  clearInterval(clockTimer)
})
</script>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  background:
    radial-gradient(ellipse 120% 80% at 50% 120%, rgba(0,120,212,0.25) 0%, transparent 70%),
    radial-gradient(ellipse 80% 60% at 30% 40%, rgba(0,90,158,0.15) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 70% 20%, rgba(100,160,255,0.08) 0%, transparent 50%),
    linear-gradient(180deg, #001428 0%, #002050 40%, #003080 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  overflow: hidden;
  position: relative;
}

/* 时钟区域 */
.clock-area {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  opacity: 0.9;
}
.clock-time {
  font-size: 86px;
  font-weight: 600;
  letter-spacing: -2px;
  line-height: 1;
}
.clock-date {
  font-size: 16px;
  font-weight: 400;
  margin-top: 8px;
  opacity: 0.8;
}

/* 登录面板 */
.login-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.login-center.slide-in {
  opacity: 1;
  transform: translateY(0);
}
.login-center.shake {
  animation: shakePwd 0.5s ease;
}

@keyframes shakePwd {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-12px); }
  30% { transform: translateX(10px); }
  45% { transform: translateX(-8px); }
  60% { transform: translateX(6px); }
  75% { transform: translateX(-3px); }
}

/* 用户头像 */
.user-avatar {
  margin-bottom: 4px;
}

.user-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
}

/* 密码行 */
.pwd-row {
  display: flex;
  align-items: center;
  gap: 0;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 6px;
  width: 260px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.pwd-row:focus-within {
  border-color: #0078d4;
  box-shadow: 0 0 0 1px #0078d4;
}

.pwd-input {
  flex: 1;
  height: 36px;
  background: transparent;
  border: none;
  color: #fff;
  font-size: 14px;
  padding: 0 12px;
  outline: none;
}
.pwd-input::placeholder {
  color: rgba(255,255,255,0.4);
}

.pwd-arrow {
  width: 36px;
  height: 36px;
  background: #0078d4;
  border: none;
  border-radius: 0 6px 6px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  flex-shrink: 0;
}
.pwd-arrow:hover:not(:disabled) {
  background: #106ebe;
}
.pwd-arrow:disabled {
  opacity: 0.5;
}

/* 加载指示器 */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  opacity: 0.7;
  margin-top: 4px;
}
.spinner {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误文字 */
.error-text {
  color: #ff6b6b;
  font-size: 13px;
  margin-top: 4px;
}

/* 页脚 */
.login-footer {
  position: absolute;
  bottom: 40px;
  font-size: 12px;
  opacity: 0.4;
}
</style>
