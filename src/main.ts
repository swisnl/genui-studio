import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import '@swis/genui-widgets/styles'
import './styles/global.scss'

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
