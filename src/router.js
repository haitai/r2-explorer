import { createRouter, createWebHistory } from 'vue-router'
import Explorer from './views/Explorer.vue'
import Login from './views/Login.vue'

const routes = [
  { path: '/', name: 'explorer', component: Explorer },
  { path: '/login', name: 'login', component: Login },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
