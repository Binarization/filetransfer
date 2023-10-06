import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: HomeView
        },
        {
            path: '/scan',
            name: 'scan',
            // route level code-splitting
            // this generates a separate chunk (About.[hash].js) for this route
            // which is lazy-loaded when the route is visited.
            component: () => import('../views/ScanView.vue')
        },
        {
            path: '/transfer/:id?',
            name: 'transfer',
            // route level code-splitting
            // this generates a separate chunk (About.[hash].js) for this route
            // which is lazy-loaded when the route is visited.
            component: () => import('../views/TransferView.vue')
        },
        {
            path: '/warning',
            name: 'warning',
            props: true,
            component: () => import('../views/WarningView.vue')
        },
    ]
})

export default router
