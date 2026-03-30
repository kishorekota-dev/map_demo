import React from 'react'
import { createRoot } from 'react-dom/client'
import { initializeRuntimeConfig } from '@/config/runtimeConfig'
import './styles/global.css'

async function bootstrap() {
  const container = document.getElementById('root')

  if (!container) {
    // eslint-disable-next-line no-console
    console.error('Root container not found')
    return
  }

  await initializeRuntimeConfig()

  const { default: App } = await import('./App')
  const root = createRoot(container)

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
