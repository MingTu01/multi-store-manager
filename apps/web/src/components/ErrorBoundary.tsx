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

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0, isRemoveChildError: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const isRemoveChild = error.message?.includes('removeChild') || 
                          error.message?.includes('not a child of this node');
    return { 
      hasError: !isRemoveChild, // Don't show error UI for removeChild
      error,
      isRemoveChildError: isRemoveChild
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (this.state.isRemoveChildError) {
      // Auto-recover from React 19 removeChild bug
      console.warn('[ErrorBoundary] React 19 removeChild bug, auto-recovering');
      this.setState({ hasError: false, error: null, isRemoveChildError: false });
      return;
    }

    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));
    console.error('[ErrorBoundary]', error.message);

    if (this.state.errorCount > 5) {
      console.error('[ErrorBoundary] Too many errors, forcing reload');
      window.location.reload();
    }
  }

  componentWillUnmount() {
    if (this.resetTimer) clearTimeout(this.resetTimer);
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
