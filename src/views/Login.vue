<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-icon">🗄️</span>
        <h1>R2 Explorer</h1>
        <p>Cloudflare R2 资源管理器</p>
      </div>
      <div class="login-form">
        <input
          v-model="password"
          type="password"
          placeholder="输入访问密码"
          class="login-input"
          @keyup.enter="doLogin"
          autofocus
        />
        <button class="login-btn" @click="doLogin" :disabled="loading">
          {{ loading ? '验证中...' : '登录' }}
        </button>
        <p v-if="error" class="login-error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import r2client from '../api/r2client.js'

const router = useRouter()
const password = ref('')
const loading = ref(false)
const error = ref('')

async function doLogin() {
  if (!password.value) return
  loading.value = true
  error.value = ''
  try {
    await r2client.login(password.value)
    router.push('/')
  } catch (e) {
    if (e.message === 'LOGIN_FAILED') {
      error.value = '密码错误'
    } else {
      error.value = e.message
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #0078d4 0%, #005a9e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.3);
  width: 400px;
  overflow: hidden;
}

.login-logo {
  text-align: center;
  padding: 32px 24px 16px;
}

.logo-icon {
  font-size: 48px;
}

.login-logo h1 {
  font-size: 20px;
  font-weight: 600;
  margin-top: 8px;
  color: #1a1a1a;
}

.login-logo p {
  font-size: 13px;
  color: #616161;
  margin-top: 4px;
}

.login-form {
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-input {
  height: 40px;
  border: 1px solid #d5d5d5;
  border-radius: 6px;
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.login-input:focus {
  border-color: #0078d4;
}

.login-btn {
  height: 40px;
  background: #0078d4;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.login-btn:hover:not(:disabled) {
  background: #106ebe;
}

.login-btn:disabled {
  opacity: 0.7;
}

.login-error {
  color: #e81123;
  font-size: 13px;
  text-align: center;
}
</style>
