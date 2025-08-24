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

// LocalStorageのキー名（Electronアプリなので設定を保存）
const CONFIG_STORAGE_KEY = 'lm_studio_config'

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<LMStudioConfig>(() => {
    // 初期化時にlocalStorageから設定を読み込む
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 設定を保存する関数
  const saveConfig = () => {
    try {
      // 空文字列の場合はデフォルト値を使用
      const finalConfig = {
        baseUrl: tempConfig.baseUrl.trim() || DEFAULT_CONFIG.baseUrl,
        model: tempConfig.model.trim() || DEFAULT_CONFIG.model
      }
      
      setConfig(finalConfig)
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(finalConfig))
      setShowConfig(false)
      
      // 成功メッセージを表示
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

  // 設定をリセットする関数
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

  // 設定パネルを開く時に現在の設定を一時設定にコピー
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
      // 現在の設定を使用してAPIエンドポイントを構築
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
        const models = response.data.data || []
        const modelList = models.map((m: any) => m.id || m.name || '不明').join(', ')
        
        const connectionMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ 接続成功！\n\nAPI URL: ${config.baseUrl}\n利用可能なモデル数: ${models.length}\nモデル一覧: ${modelList || 'なし'}`,
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
        content: `❌ 接続エラー\n\nAPI URL: ${config.baseUrl}\nエラー内容: ${errorMsg}\n\n設定を確認してください。`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, connectionErrorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-full h-screen bg-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 shadow-lg flex-shrink-0">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">LM Studio Chat</h1>
            <p className="text-xs opacity-80 mt-1">API: {config.baseUrl}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleConfigPanel}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors text-sm"
            >
              {showConfig ? '閉じる' : '設定'}
            </button>
            <button
              onClick={testConnection}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors text-sm"
              disabled={isLoading}
            >
              接続テスト
            </button>
            <button
              onClick={clearChat}
              className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-colors text-sm"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="bg-white p-4 border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-sm mb-2">API URL:</label>
                <input
                  type="text"
                  value={tempConfig.baseUrl}
                  onChange={(e) => setTempConfig({...tempConfig, baseUrl: e.target.value})}
                  placeholder={DEFAULT_CONFIG.baseUrl}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  空の場合: {DEFAULT_CONFIG.baseUrl} を使用
                </p>
              </div>
              <div>
                <label className="block font-medium text-sm mb-2">モデル名:</label>
                <input
                  type="text"
                  value={tempConfig.model}
                  onChange={(e) => setTempConfig({...tempConfig, model: e.target.value})}
                  placeholder={DEFAULT_CONFIG.model}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  空の場合: {DEFAULT_CONFIG.model} を使用
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveConfig}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
              >
                保存
              </button>
              <button
                onClick={resetConfig}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm"
              >
                デフォルトに戻す
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors text-sm"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p className="text-lg">LM Studioとの会話を開始しましょう！</p>
            <p className="text-sm mt-2">まずは接続テストを実行してください。</p>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg text-left max-w-md mx-auto">
              <h3 className="font-medium text-blue-900 mb-2">現在の設定:</h3>
              <p className="text-sm text-blue-800">API URL: {config.baseUrl}</p>
              <p className="text-sm text-blue-800">モデル名: {config.model}</p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-3 rounded-lg shadow-sm ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</div>
              <div className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 max-w-xs lg:max-w-md px-4 py-3 rounded-lg rounded-bl-sm border border-gray-200 shadow-sm">
              <div className="flex items-center space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white p-4 border-t border-gray-200 shadow-lg flex-shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力してください... (Enter: 送信, Shift+Enter: 改行)"
            disabled={isLoading}
            rows={2}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm leading-relaxed max-h-32 min-h-[2.5rem]"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 transparent'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="px-6 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  )
}

export default App