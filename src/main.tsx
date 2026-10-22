import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// No StrictMode: the game controller starts an engine search on mount, and double-mounting would start two.
createRoot(document.getElementById('root')!).render(<App />)
