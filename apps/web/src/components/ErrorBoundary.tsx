import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
  isRemoveChildError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private removeChildInterceptCount = 0;
  private originalConsoleError: typeof console.error | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0, isRemoveChildError: false };
    this.setupConsoleErrorInterceptor();
  }

  /**
   * 拦截 console.error，过滤掉包含 "removeChild" 的错误消息。
   * 使用计数器限制最多拦截 10 次，防止无限循环。
   */
  private setupConsoleErrorInterceptor() {
    this.originalConsoleError = console.error.bind(console);
    const self = this;

    console.error = function (...args: unknown[]) {
      const message = args
        .map((a) => (typeof a === 'string' ? a : String(a)))
        .join(' ');

      if (message.includes('removeChild') || message.includes('not a child of this node')) {
        if (self.removeChildInterceptCount < 10) {
          self.removeChildInterceptCount++;
          // 静默吞掉，不再输出到控制台
          return;
        }
        // 超过 10 次，放行原始输出，避免隐藏真正的问题
      }

      if (self.originalConsoleError) {
        self.originalConsoleError(...args);
      }
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isRemoveChild = error.message?.includes('removeChild') ||
                          error.message?.includes('not a child of this node');
    return {
      hasError: !isRemoveChild, // removeChild 错误不显示错误 UI
      error,
      isRemoveChildError: isRemoveChild
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.state.isRemoveChildError) {
      // 静默处理 removeChild 错误，不 setState hasError，不显示错误页面
      return;
    }

    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    this.originalConsoleError?.('[ErrorBoundary]', error.message);

    if (this.state.errorCount > 5) {
      this.originalConsoleError?.('[ErrorBoundary] Too many errors, forcing reload');
      window.location.reload();
    }
  }

  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    // 恢复原始 console.error
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorCount: 0, isRemoveChildError: false });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError && !this.state.isRemoveChildError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '100vh', padding: '2rem', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          background: '#f8fafc'
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '2rem', maxWidth: '400px',
            width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{'😵'}</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
              {'页面出错了'}
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                background: '#6366f1', color: 'white', border: 'none', borderRadius: '12px',
                padding: '0.75rem 2rem', fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer'
              }}
            >
              {'返回首页'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}