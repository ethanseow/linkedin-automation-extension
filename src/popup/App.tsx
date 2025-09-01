import { useState, useEffect, useCallback } from 'react'
import './App.css'

function App() {
  const [searchQuery, setSearchQuery] = useState('crypto')
  const [message, setMessage] = useState('Hi!')
  const [peopleCount, setPeopleCount] = useState(20)
  const [isRunning, setIsRunning] = useState(false)
  const [alertState, setAlertState] = useState<{type: string, message: string} | null>(null)
  
  useEffect(() => {
    window.chrome.storage.session.get('alert', (result: any) => {
      if (result.alert) {
        setAlertState({ type: result.alert.type, message: result.alert.message })
      }
    })
    window.chrome.storage.session.get('isRunning', (result: any) => {
      if (result.isRunning) {
        setIsRunning(result.isRunning)
      }
    })
    window.chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      window.chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  const handleUpdate = (message: any) => {
    setIsRunning(message.isRunning)
    setAlertState({ type: message.alert.type, message: message.alert.message })
  }

  const handleMessage = (message: any) => {
    if (message.action === 'update') {
      handleUpdate(message)
    }
  }

  const validateInputs = () => {
    if (!searchQuery.trim()) {
      throw new Error('Please fill in the search query')
    }
    if (peopleCount < 1 || peopleCount > 100) {
      throw new Error('Please enter a valid number of people (1-100).')
    }
  }

  const getCurrentTabId = async () => {
    const [currentTab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
    if (!currentTab.id) {
      throw new Error('No active tab found')
    }
    return currentTab.id
  }

  const startAction = useCallback(async (action: string, payload: any) => {
    const retries = 3
    for (let i = 0; i < retries; i++) {
      try {
        await window.chrome.runtime.sendMessage({
          action,
          payload 
        })
        return
      } catch (error) {
        if (i === retries - 1) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    throw new Error(`Failed to start ${action}`)
  }, [])

  const handleAutomationError = (error: any) => {
    console.log('linkedin-automation: Error starting automation:', error)
    setIsRunning(false)
    setAlertState({ type: 'error', message: error.message || 'Error starting automation. Please try again.' })
  }

  const handleStartAutomation = async () => {
    try {
      validateInputs()
      setIsRunning(true)
      setAlertState(null)
      
      const tabId = await getCurrentTabId()

      console.log('linkedin-automation: Sending message to tab:', tabId)
      await startAction('startPeopleSearchAutomation', {
        tabId,
        searchQuery,
        message,
        peopleCount
      })
      console.log('linkedin-automation: Message sent to tab:', tabId)
    } catch (error) {
      handleAutomationError(error)
    }
  }

  const handleMyConnect = async () => {
    try {
      setIsRunning(true)
      setAlertState(null)
      
      const tabId = await getCurrentTabId()
      
      console.log('linkedin-automation: Starting my network automation on tab:', tabId)
      await startAction('startMyNetworkAutomation', {
        tabId,
        peopleCount
      })
      console.log('linkedin-automation: My network automation started on tab:', tabId)
    } catch (error) {
      handleAutomationError(error)
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
        Start Automation
      </button>

      <button 
        onClick={handleMyConnect}
        disabled={isRunning}
        className="start-btn"
      >
        Mass Connect with My Network
      </button>

      {isRunning && (
        <div className="running-indicator">
          Running ...
        </div>
      )}

      {alertState && (
        <div className={`alert alert-${alertState.type}`}>
          {alertState.message}
        </div>
      )}
    </div>
  )
}

export default App
