import {createRouter, createWebHashHistory} from 'vue-router'
import MapView from '../views/MapView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: MapView
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
