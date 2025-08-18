import { useState, useEffect } from 'react'
import './App.css'

declare global {
  interface Window {
    chrome: any
  }
}


function App() {
  const [searchQuery, setSearchQuery] = useState('crypto')
  const [message, setMessage] = useState('Hi!')
  const [peopleCount, setPeopleCount] = useState(20)
  const [isRunning, setIsRunning] = useState(false)
  const [alertState, setAlertState] = useState<{type: string, message: string} | null>(null)

  useEffect(() => {

    window.chrome.storage.onChanged.addListener(handleAlertMessages)
    
    return () => {
      window.chrome.storage.onChanged.removeListener(handleAlertMessages)
    }
  }, [])

  const handleAlertMessages = (changes: any) => {
    if (changes.alert) {
      const newAlert = changes.alert.newValue
      if (newAlert) {
        setAlertState({ type: newAlert.type, message: newAlert.message })
        setIsRunning(false)
        
        setTimeout(() => {
          setAlertState(null)
          window.chrome.storage.local.remove('alert')
        }, 5000)
      }
    }
  }

  const handleStartAutomation = async () => {
    if (!searchQuery.trim()) {
      alert('Please fill in both search query and message')
      return
    }

    if (peopleCount < 1 || peopleCount > 100) {
      alert('Please enter a valid number of people (1-100)')
      return
    }

    setIsRunning(true)
    setAlertState(null)
    
    try {
      // TODO: perhaps navigating to a new tab causes issues with the extension sending messages to the wrong tab
      let newTabId = null
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;
      const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
      
      if (!tab.url?.includes(searchUrl)) {
        await window.chrome.tabs.update(tab.id, { url: searchUrl })
        const [newTab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
        newTabId = newTab.id
      }

      // TODO: it gets stuck here when I am on chrome://extensions and I use extension as normal   
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      console.log('linkedin-automation: Sending message to tab:', tab.id)
      await window.chrome.tabs.sendMessage(newTabId ?? tab.id, {
        action: 'startAutomation',
        searchQuery,
        message,
        peopleCount
      })
    } catch (error) {
      console.error('linkedin-automation: Error starting automation:', error)
      alert('Error starting automation. Please try again.')
      setIsRunning(false)
    }
  }

  return (
    <div className="app">
      <h2>LinkedIn Automation</h2>
      
      {alertState && (
        <div className={`alert alert-${alertState.type}`}>
          {alertState.message}
        </div>
      )}
      
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

      <div className="form-group">
        <label>Number of People:</label>
        <input
          type="text"
          value={peopleCount === 0 ? '' : peopleCount}
          onChange={(e) => {
            const value = e.target.value
            if(value === '') {
              setPeopleCount(0)
              return
            }
            if(isNaN(Number(value)) || Number(value) < 1) {
              return
            }
            setPeopleCount(Number(value))
          }}
          placeholder="e.g., 20"
          pattern="[0-9]+"
          disabled={isRunning}
        />
      </div>

      <button 
        onClick={handleStartAutomation}
        disabled={isRunning || !searchQuery.trim() || peopleCount < 1}
        className="start-btn"
      >
        {isRunning ? 'Running...' : 'Start Automation'}
      </button>
    </div>
  )
}

export default App
