import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type LogLevel = 'info' | 'success' | 'error' | 'pending';

export interface LogEntry {
  id: number;
  timestamp: Date;
  message: string;
  level: LogLevel;
  txHash?: string;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (message: string, level?: LogLevel, txHash?: string) => void;
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | null>(null);

export function useTransactionLog() {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useTransactionLog must be used within a LogProvider');
  }
  return context;
}

export function LogProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const idCounter = useRef(0);

  const addLog = useCallback((message: string, level: LogLevel = 'info', txHash?: string) => {
    const entry: LogEntry = {
      id: idCounter.current++,
      timestamp: new Date(),
      message,
      level,
      txHash,
    };
    setLogs(prev => [...prev, entry]);
    console.log(`[${level.toUpperCase()}] ${message}`, txHash ? `(${txHash})` : '');
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function TransactionLog() {
  const { logs, clearLogs } = useTransactionLog();
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (logs.length === 0) {
    return null;
  }

  return (
    <div className="transaction-log">
      <div className="log-header">
        <h3>Transaction Log</h3>
        <button onClick={clearLogs} className="clear-log-btn">Clear</button>
      </div>
      <div className="log-entries">
        {logs.map(entry => (
          <div key={entry.id} className={`log-entry log-${entry.level}`}>
            <span className="log-time">{formatTime(entry.timestamp)}</span>
            <span className="log-level-icon">
              {entry.level === 'success' && '✓'}
              {entry.level === 'error' && '✗'}
              {entry.level === 'pending' && '◌'}
              {entry.level === 'info' && '•'}
            </span>
            <span className="log-message">{entry.message}</span>
            {entry.txHash && (
              <span className="log-tx-hash" title={entry.txHash}>
                {truncateHash(entry.txHash)}
              </span>
            )}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
