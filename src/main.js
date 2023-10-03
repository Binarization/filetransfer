import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Antd接入Iconfont
import { createFromIconfontCN } from '@ant-design/icons-vue'

const IconFont = createFromIconfontCN({
    scriptUrl: '//at.alicdn.com/t/c/font_4273299_uhj7m024np8.js'
})

const app = createApp(App)

app.component('IconFont', IconFont)

app.use(router)

app.mount('#app')
