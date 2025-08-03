import { useState } from 'react'
import './App.css'

// Chrome extension API types
declare global {
  interface Window {
    chrome: any
  }
}

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [message, setMessage] = useState('')
  const [isRunning, setIsRunning] = useState(false)

  const handleStartAutomation = async () => {
    if (!searchQuery.trim() || !message.trim()) {
      alert('Please fill in both search query and message')
      return
    }

    setIsRunning(true)
    
    try {
      // Get current tab
      const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
      
      console.log('Current tab URL:', tab.url)
      
      if (!tab.url?.toLowerCase().includes('linkedin.com')) {
        alert('Please navigate to LinkedIn first')
        setIsRunning(false)
        return
      }
      
      if (tab.id) {
        try {
          // Try to send message to content script
          await window.chrome.tabs.sendMessage(tab.id, {
            action: 'startAutomation',
            searchQuery,
            message
          })
        } catch (error) {
          console.log('Content script not loaded, injecting dynamically...')
          
          // Inject content script dynamically
          await window.chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          })
          
          // Wait a moment for script to load
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Try sending message again
          await window.chrome.tabs.sendMessage(tab.id, {
            action: 'startAutomation',
            searchQuery,
            message
          })
        }
      }
    } catch (error) {
      console.error('Error starting automation:', error)
      alert('Error starting automation. Make sure you are on LinkedIn and refresh the page.')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="app">
      <h2>LinkedIn Automation</h2>
      
      <div className="form-group">
        <label>Search Query:</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="e.g., crypto asset managers"
          disabled={isRunning}
        />
      </div>

      <div className="form-group">
        <label>Message:</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter your outreach message..."
          rows={4}
          disabled={isRunning}
        />
      </div>

      <button 
        onClick={handleStartAutomation}
        disabled={isRunning || !searchQuery.trim() || !message.trim()}
        className="start-btn"
      >
        {isRunning ? 'Running...' : 'Start Automation'}
      </button>

      <p className="info">
        Limit: 20 people max
      </p>
    </div>
  )
}

export default App
