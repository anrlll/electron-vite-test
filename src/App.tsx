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

  // アプリケーション全体のスタイル
  const appStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  }

  // ヘッダーのスタイル
  const headerStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
    color: 'white',
    padding: '16px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    flexShrink: 0
  }

  // 設定パネルのスタイル
  const configPanelStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '16px',
    borderBottom: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    flexShrink: 0
  }

  // メッセージエリアのスタイル
  const messagesAreaStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    minHeight: 0,
    scrollbarWidth: 'thin'
  }

  // 入力エリアのスタイル
  const inputAreaStyle: React.CSSProperties = {
    backgroundColor: 'white',
    padding: '16px',
    borderTop: '1px solid #e5e7eb',
    boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
    flexShrink: 0
  }

  // ボタンの基本スタイル
  const buttonBaseStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease-in-out',
    fontFamily: 'inherit'
  }

  // ヘッダーボタンのスタイル
  const headerButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    marginLeft: '8px'
  }

  // 送信ボタンのスタイル
  const sendButtonStyle: React.CSSProperties = {
    ...buttonBaseStyle,
    backgroundColor: isLoading || !input.trim() ? '#9ca3af' : '#3b82f6',
    color: 'white',
    padding: '10px 24px',
    cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer'
  }

  // テキストエリアのスタイル
  const textareaStyle: React.CSSProperties = {
    flex: 1,
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    padding: '8px 12px',
    resize: 'none',
    outline: 'none',
    fontSize: '14px',
    lineHeight: '1.5',
    minHeight: '40px',
    maxHeight: '128px',
    fontFamily: 'inherit',
    marginRight: '12px'
  }

  // 入力フィールドのスタイル
  const inputFieldStyle: React.CSSProperties = {
    width: '100%',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit'
  }

  return (
    <div style={appStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>LM Studio Chat</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button
              onClick={toggleConfigPanel}
              style={headerButtonStyle}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
            >
              {showConfig ? '閉じる' : '設定'}
            </button>
            <button
              onClick={testConnection}
              style={{...headerButtonStyle, opacity: isLoading ? 0.6 : 1}}
              disabled={isLoading}
              onMouseEnter={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)')}
              onMouseLeave={(e) => !isLoading && (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)')}
            >
              接続テスト
            </button>
            <button
              onClick={clearChat}
              style={headerButtonStyle}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'}
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div style={configPanelStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: '500', fontSize: '14px', marginBottom: '8px' }}>
                API URL:
              </label>
              <input
                type="text"
                value={tempConfig.baseUrl}
                onChange={(e) => setTempConfig({...tempConfig, baseUrl: e.target.value})}
                placeholder={DEFAULT_CONFIG.baseUrl}
                style={inputFieldStyle}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                空の場合: {DEFAULT_CONFIG.baseUrl} を使用
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={saveConfig}
              style={{
                ...buttonBaseStyle,
                backgroundColor: '#3b82f6',
                color: 'white'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
            >
              保存
            </button>
            <button
              onClick={resetConfig}
              style={{
                ...buttonBaseStyle,
                backgroundColor: '#6b7280',
                color: 'white'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6b7280'}
            >
              デフォルトに戻す
            </button>
            <button
              onClick={() => setShowConfig(false)}
              style={{
                ...buttonBaseStyle,
                backgroundColor: '#d1d5db',
                color: '#374151'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#9ca3af'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#d1d5db'}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div style={messagesAreaStyle}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '40px' }}>
            <p style={{ fontSize: '18px', margin: 0 }}>会話を開始しましょう！</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: '16px'
            }}
          >
            <div
              style={{
                maxWidth: '70%',
                padding: '12px 16px',
                borderRadius: '12px',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                backgroundColor: message.role === 'user' ? '#3b82f6' : 'white',
                color: message.role === 'user' ? 'white' : '#1f2937',
                border: message.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                borderBottomRightRadius: message.role === 'user' ? '4px' : '12px',
                borderBottomLeftRadius: message.role === 'assistant' ? '4px' : '12px'
              }}
            >
              <div style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: '14px',
                lineHeight: '1.5'
              }}>
                {message.content}
              </div>
              <div style={{
                fontSize: '12px',
                marginTop: '8px',
                color: message.role === 'user' ? 'rgba(255, 255, 255, 0.7)' : '#6b7280'
              }}>
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '16px' }}>
            <div style={{
              backgroundColor: 'white',
              color: '#1f2937',
              maxWidth: '70%',
              padding: '12px 16px',
              borderRadius: '12px',
              borderBottomLeftRadius: '4px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#9ca3af',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out'
                }}></div>
                <div style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#9ca3af',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out 0.16s'
                }}></div>
                <div style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#9ca3af',
                  borderRadius: '50%',
                  animation: 'bounce 1.4s infinite ease-in-out 0.32s'
                }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={inputAreaStyle}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="メッセージを入力してください... (Enter: 送信, Shift+Enter: 改行)"
            disabled={isLoading}
            rows={2}
            style={{
              ...textareaStyle,
              opacity: isLoading ? 0.6 : 1
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            style={sendButtonStyle}
            onMouseEnter={(e) => {
              if (!isLoading && input.trim()) {
                e.currentTarget.style.backgroundColor = '#2563eb'
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading && input.trim()) {
                e.currentTarget.style.backgroundColor = '#3b82f6'
              }
            }}
          >
            送信
          </button>
        </div>
      </div>

      {/* CSS for bounce animation */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0.8);
            opacity: 0.5;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

export default App