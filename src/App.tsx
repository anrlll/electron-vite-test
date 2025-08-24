import React, { useState, useRef, useEffect } from 'react'

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
  model: 'local-model'
}

// LocalStorageのキー名（Electronアプリなので設定を保存）
const CONFIG_STORAGE_KEY = 'lm_studio_config'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<LMStudioConfig>(() => {
    try {
      const savedConfig = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig)
        return {
          baseUrl: parsed.baseUrl || DEFAULT_CONFIG.baseUrl,
          model: parsed.model || DEFAULT_CONFIG.model
        }
      }
    } catch (error) {
      console.warn('設定の読み込みに失敗しました:', error)
    }
    return DEFAULT_CONFIG
  })
  const [showConfig, setShowConfig] = useState(false)
  const [tempConfig, setTempConfig] = useState<LMStudioConfig>(config)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // APIURL設定を保存する関数
  const saveConfig = () => {
    try {
      const finalConfig = {
        baseUrl: tempConfig.baseUrl.trim() || DEFAULT_CONFIG.baseUrl,
        model: tempConfig.model.trim() || DEFAULT_CONFIG.model
      }
      
      setConfig(finalConfig)
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(finalConfig))
      setShowConfig(false)
      
      const successMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `設定を保存しました\n・API URL: ${finalConfig.baseUrl}\n・モデル名: ${finalConfig.model}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, successMessage])
    } catch (error) {
      console.error('設定の保存に失敗しました:', error)
      alert('設定の保存に失敗しました')
    }
  }

  // APIURL設定をリセットする関数
  const resetConfig = () => {
    setTempConfig(DEFAULT_CONFIG)
    setConfig(DEFAULT_CONFIG)
    localStorage.removeItem(CONFIG_STORAGE_KEY)
    
    const resetMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `設定をデフォルトに戻しました\n・API URL: ${DEFAULT_CONFIG.baseUrl}\n・モデル名: ${DEFAULT_CONFIG.model}`,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, resetMessage])
  }

  const toggleConfigPanel = () => {
    if (!showConfig) {
      setTempConfig(config)
    }
    setShowConfig(!showConfig)
  }

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
      const apiUrl = config.baseUrl.endsWith('/') 
        ? `${config.baseUrl}v1/chat/completions`
        : `${config.baseUrl}/v1/chat/completions`

      // LM Studio APIに送信するメッセージ履歴を準備
      const conversationHistory = [...messages, userMessage].map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await window.electronAPI.callLMStudioAPI({
        endpoint: apiUrl,
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
        content: `エラーが発生しました: ${error instanceof Error ? error.message : '不明なエラー'}\n\n設定を確認してください：\n・API URL: ${config.baseUrl}\n・モデル名: ${config.model}`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
      // 送信後に入力欄にフォーカスを戻す
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
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
      const modelsUrl = config.baseUrl.endsWith('/') 
        ? `${config.baseUrl}v1/models`
        : `${config.baseUrl}/v1/models`

      const response = await window.electronAPI.callLMStudioAPI({
        endpoint: modelsUrl,
        method: 'GET'
      })

      if (response.type === 'json' && response.data) {
        const connectionMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `接続成功！\n\nAPI URL: ${config.baseUrl}`,
          timestamp: new Date()
        }
        setMessages(prev => [...prev, connectionMessage])
      } else {
        throw new Error('無効なレスポンス')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '不明なエラー'
      const connectionErrorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `接続エラー\n\nAPI URL: ${config.baseUrl}\nエラー内容: ${errorMsg}\n\n設定を確認してください。`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, connectionErrorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-gray-100 overflow-hidden font-sans">
      {/* Header */}
      <div className="bg-gray-500 text-white p-4 shadow-lg shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold m-0">ChatSystemDemo</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleConfigPanel}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer"
            >
              {showConfig ? '閉じる' : '設定'}
            </button>
            <button
              onClick={testConnection}
              disabled={isLoading}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-md text-sm font-medium transition-colors duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              接続テスト
            </button>
            <button
              onClick={clearChat}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="bg-white p-4 border-b border-gray-200 shadow-sm shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block font-medium text-sm mb-2">
                API URL:
              </label>
              <input
                type="text"
                value={tempConfig.baseUrl}
                onChange={(e) => setTempConfig({...tempConfig, baseUrl: e.target.value})}
                placeholder={DEFAULT_CONFIG.baseUrl}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                空の場合: {DEFAULT_CONFIG.baseUrl} を使用
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveConfig}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors duration-200"
            >
              保存
            </button>
            <button
              onClick={resetConfig}
              className="px-3 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-md text-sm font-medium transition-colors duration-200"
            >
              デフォルトに戻す
            </button>
            <button
              onClick={() => setShowConfig(false)}
              className="px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-md text-sm font-medium transition-colors duration-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 min-h-0 scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-10">
            <p className="text-lg m-0">会話を開始しましょう！</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex mb-4 items-end gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'user' && (
              <div className="text-xs text-gray-500 mb-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            )}
            <div
              className={`max-w-[70%] px-4 py-3 rounded-xl shadow-sm ${
                message.role === 'user' 
                  ? 'bg-blue-500 text-white rounded-br-sm' 
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {message.content}
              </div>
            </div>
            {message.role === 'assistant' && (
              <div className="text-xs text-gray-500 mb-1">
                {message.timestamp.toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start mb-4">
            <div className="bg-white text-gray-800 max-w-[70%] px-4 py-3 rounded-xl rounded-bl-sm border border-gray-200 shadow-sm">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:160ms]"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:320ms]"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-gray-200 shadow-lg shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力してください... (Enter: 送信, Shift+Enter: 改行)"
            disabled={isLoading}
            rows={2}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 resize-none outline-none text-sm leading-relaxed min-h-[40px] max-h-32 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors duration-200"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  )
}

export default App