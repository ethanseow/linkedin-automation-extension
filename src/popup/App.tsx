import { useState, useEffect, useCallback } from 'react'
import './App.css'

function App() {
  const [selectedFlow, setSelectedFlow] = useState<'myNetwork' | 'searchQuery' | null>(null)
  const [searchQuery, setSearchQuery] = useState('crypto')
  const [message, setMessage] = useState('Hi!')
  const [peopleCount, setPeopleCount] = useState(20)
  const [isRunning, setIsRunning] = useState(false)
  const [alertState, setAlertState] = useState<{type: string, message: string} | null>(null)
  
  useEffect(() => {
    window.chrome.storage.session.get(['alert', 'isRunning', 'selectedFlow', 'searchQuery', 'peopleCount'], (result: any) => {
      if (result.alert) {
        setAlertState({ type: result.alert.type, message: result.alert.message })
      }
      if (result.isRunning) {
        setIsRunning(result.isRunning)
      }
      if (result.selectedFlow) {
        setSelectedFlow(result.selectedFlow)
      }
      if (result.searchQuery) {
        setSearchQuery(result.searchQuery)
      }
      if (result.peopleCount) {
        setPeopleCount(result.peopleCount)
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

  const validateInputs = (flow: 'myNetwork' | 'searchQuery') => {
    if (flow === 'searchQuery' && !searchQuery.trim()) {
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

  const handleStartAutomation = useCallback(async () => {
    if (!selectedFlow) return
    
    try {
      validateInputs(selectedFlow)
      setIsRunning(true)
      setAlertState(null)
      
      const tabId = await getCurrentTabId()

      if (selectedFlow === 'searchQuery') {
        console.log('linkedin-automation: Sending message to tab:', tabId)
        await startAction('startPeopleSearchAutomation', {
          tabId,
          searchQuery,
          message,
          peopleCount
        })
        console.log('linkedin-automation: Message sent to tab:', tabId)
      } else {
        console.log('linkedin-automation: Starting my network automation on tab:', tabId)
        await startAction('startMyNetworkAutomation', {
          tabId,
          peopleCount
        })
        console.log('linkedin-automation: My network automation started on tab:', tabId)
      }
    } catch (error) {
      handleAutomationError(error)
    }
  }, [selectedFlow, searchQuery, message, peopleCount])

  const resetFlow = () => {
    setSelectedFlow(null)
    setIsRunning(false)
    setAlertState(null)
  }

  const isStartButtonDisabled = () => {
    if (isRunning || peopleCount < 1) return true
    if (selectedFlow === 'searchQuery' && !searchQuery.trim()) return true
    return false
  }

  return (
    <div className="app">
      <h2>LinkedIn Automation</h2>
      
      {!selectedFlow && (
        <div>
          <button 
            onClick={() => setSelectedFlow('myNetwork')}
            className="start-btn"
            style={{ marginBottom: '10px' }}
          >
            Mass Connect with "My Network"
          </button>

          <button 
            onClick={() => setSelectedFlow('searchQuery')}
            className="start-btn"
          >
            Connect with People From Search Query
          </button>
        </div>
      )}

      {selectedFlow === 'myNetwork' && (
        <div>
          <button 
            onClick={resetFlow}
            className="back-btn"
            disabled={isRunning}
          >
            ← Back
          </button>

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
        </div>
      )}

      {selectedFlow === 'searchQuery' && (
        <div>
          <button 
            onClick={resetFlow}
            className="back-btn"
            disabled={isRunning}
          >
            ← Back
          </button>

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
        </div>
      )}

      {
        selectedFlow !== null && (
          <button 
            onClick={handleStartAutomation}
            disabled={isStartButtonDisabled()}
            className="start-btn"
          >
            Start Automation
          </button>
        )
      }
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
