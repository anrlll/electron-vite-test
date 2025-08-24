import React, { useState, useRef, useEffect } from 'react'
import './App.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface LMStudioConfig {
  baseUrl: string
  model: string
}

const DEFAULT_CONFIG: LMStudioConfig = {
  baseUrl: 'http://localhost:1234',
  model: 'local-model' // LM Studioで読み込まれているモデル名
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<LMStudioConfig>(DEFAULT_CONFIG)
  const [showConfig, setShowConfig] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // LM Studio APIに送信するメッセージ履歴を準備
      const conversationHistory = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await window.electronAPI.callLMStudioAPI({
        endpoint: `${config.baseUrl}/v1/chat/completions`,
        method: 'POST',
        body: {
          model: config.model,
          messages: conversationHistory,
          temperature: 0.7,
          max_tokens: 1000,
          stream: false
        }
      })

      if (response.type === 'json' && response.data) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.data.choices[0]?.message?.content || 'エラー: レスポンスが空です',
          timestamp: new Date()
        }

        setMessages(prev => [...prev, assistantMessage])
      } else {
        throw new Error('無効なレスポンス形式')
      }
    } catch (error) {
      console.error('API call failed:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  const testConnection = async () => {
    setIsLoading(true)
    try {
      const response = await window.electronAPI.callLMStudioAPI({
        endpoint: `${config.baseUrl}/v1/models`,
        method: 'GET'
      })

      if (response.type === 'json' && response.data) {
        alert(`接続成功!\n利用可能なモデル数: ${response.data.data?.length || 0}`)
      } else {
        throw new Error('無効なレスポンス')
      }
    } catch (error) {
      alert(`接続エラー: ${error instanceof Error ? error.message : '不明なエラー'}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">LM Studio Chat</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors"
            >
              設定
            </button>
            <button
              onClick={testConnection}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors"
              disabled={isLoading}
            >
              接続テスト
            </button>
            <button
              onClick={clearChat}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="bg-white p-4 border-b border-gray-200 shadow-sm">
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="font-medium min-w-fit">ベースURL:</label>
              <input
                type="text"
                value={config.baseUrl}
                onChange={(e) => setConfig({...config, baseUrl: e.target.value})}
                placeholder="http://localhost:1234"
                className="border border-gray-300 rounded px-3 py-1 w-64"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="font-medium min-w-fit">モデル名:</label>
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig({...config, model: e.target.value})}
                placeholder="local-model"
                className="border border-gray-300 rounded px-3 py-1 w-48"
              />
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p>LM Studioとの会話を開始しましょう！</p>
            <p className="text-sm mt-2">まずは接続テストを実行してください。</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{message.content}</div>
              <div className={`text-xs mt-1 opacity-70`}>
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-200 text-gray-800 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-gray-200 shadow-lg">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力してください... (Enter: 送信, Shift+Enter: 改行)"
            disabled={isLoading}
            rows={3}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors h-fit self-end"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  )
}

export default App