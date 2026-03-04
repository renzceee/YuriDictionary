import { defineConfig } from 'vite'

export default defineConfig({
    base: '/YuriDictionary/', // Must match your GitHub repository name exactly
    server: {
        allowedHosts: ['.ngrok-free.app']
    }
})
