import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const host = document.getElementById('root')
if (!host) throw new Error('нет узла #root')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
