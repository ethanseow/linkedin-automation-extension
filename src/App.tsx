import { useState } from 'react'
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
    const [tab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
    await window.chrome.tabs.sendMessage(tab.id, {
      action: 'startAutomation',
      searchQuery,
      message,
      peopleCount
    })
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

      <div className="form-group">
        <label>Number of People:</label>
        <input
          type="text"
          onChange={(e) => {
            const parsed = parseInt(e.target.value)
            if (isNaN(parsed)) { return }
            setPeopleCount(parsed)
          }}
          placeholder="e.g., 20"
          disabled={isRunning}
        />
      </div>

      <button 
        onClick={handleStartAutomation}
        disabled={isRunning || !searchQuery.trim() || peopleCount < 1 || peopleCount > 100}
        className="start-btn"
      >
        {isRunning ? 'Running...' : 'Start Automation'}
      </button>

      <p className="info">
        Connect with {peopleCount} people (max: 100)
      </p>
    </div>
  )
}

export default App
