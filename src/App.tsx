import { useState, useEffect, useCallback } from 'react'
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
    window.chrome.storage.local.get('alert', (result: any) => {
      if (result.alert) {
        setAlertState({ type: result.alert.type, message: result.alert.message })
      }
    })

    window.chrome.storage.local.get('isRunning', (result: any) => {
      if (result.isRunning) {
        setIsRunning(true)
      }
    })
    window.chrome.storage.onChanged.addListener(handleAlertMessages)
    return () => {
      window.chrome.storage.onChanged.removeListener(handleAlertMessages)
    }
  }, [])

  const setRunningState = async (state: boolean) => {
    setIsRunning(state)
    window.chrome.storage.local.set({ isRunning: state })
  }

  const clearAlertState = async () => {
    await window.chrome.storage.local.remove('alert')
    setAlertState(null)
  }

  const handleAlertMessages = (changes: any) => {
    if (changes.alert) {
      const newAlert = changes.alert.newValue
      if (newAlert) {
        setAlertState({ type: newAlert.type, message: newAlert.message })
        setRunningState(false)
      }
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

  const buildSearchUrl = (query: string) => 
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`

  const navigateToLinkedInSearch = async (searchUrl: string) => {
    const [currentTab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
    
    if (!currentTab.url?.includes(searchUrl)) {
      // await window.chrome.tabs.update(currentTab.id, { url: searchUrl })
      // const [newTab] = await window.chrome.tabs.query({ active: true, currentWindow: true })
      // return newTab.id
    }
    return currentTab.id
  }

  const sendAutomationMessage = useCallback(async (tabId: number) => {
    await window.chrome.runtime.sendMessage({
      action: 'trackAutomationTab',
      tabId: tabId
    })
    const retries = 3
    for (let i = 0; i < retries; i++) {
      try {
        await window.chrome.tabs.sendMessage(tabId, {
          action: 'startAutomation',
          searchQuery,
          message,
          peopleCount
        })
        return // Success
      } catch (error) {
        if (i === retries - 1) throw error
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }
  }, [searchQuery, message, peopleCount])

  const handleAutomationError = (error: any) => {
    console.log('linkedin-automation: Error starting automation:', error)
    setRunningState(false)
    setAlertState({ type: 'error', message: error.message || 'Error starting automation. Please try again.' })
  }

  const handleStartAutomation = async () => {
    try {
      validateInputs()
      await setRunningState(true)
      await clearAlertState()
      
      const searchUrl = buildSearchUrl(searchQuery)
      const tabId = await navigateToLinkedInSearch(searchUrl)

      console.log('linkedin-automation: Sending message to tab:', tabId)
      await sendAutomationMessage(tabId)
      console.log('linkedin-automation: Message sent to tab:', tabId)
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
        {isRunning ? 'Running...' : 'Start Automation'}
      </button>

      {alertState && (
        <div className={`alert alert-${alertState.type}`}>
          {alertState.message}
        </div>
      )}
    </div>
  )
}

export default App
