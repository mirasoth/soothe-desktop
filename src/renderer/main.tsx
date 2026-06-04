import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.js';
import { registerAllRenderers } from './event-renderers/index.js';
import './index.css';

registerAllRenderers();

const root = document.getElementById('root');
if (!root) throw new Error('soothe-desktop: #root not found');

// If the preload script didn't run, window.soothe is undefined and the app
// will throw on first IPC call leaving a blank screen. Show a visible
// diagnostic instead.
function PreloadMissing(): React.ReactElement {
  return (
    <div
      style={{
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        color: '#dc2626',
        background: '#0b0b0c',
        minHeight: '100vh',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
        Preload script did not load
      </h1>
      <p style={{ color: '#a1a1aa' }}>
        <code>window.soothe</code> is undefined. The Electron <code>webPreferences.preload</code>{' '}
        path is likely wrong, or the preload threw at load time. Check the main process console.
      </p>
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[soothe-desktop] renderer error:', error, info);
  }
  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '2rem',
            fontFamily: 'ui-monospace, monospace',
            color: '#fca5a5',
            background: '#0b0b0c',
            minHeight: '100vh',
            whiteSpace: 'pre-wrap',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Renderer crashed</h1>
          <div>{String(this.state.error.message)}</div>
          <pre style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#a1a1aa' }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const hasBridge =
  typeof window !== 'undefined' && (window as Window & { soothe?: unknown }).soothe;

// NOTE: StrictMode is intentionally NOT used here. React 18 StrictMode double-
// invokes effects in dev (mount → cleanup → mount), which works fine for pure
// React state but causes our IPC listener registration to fire twice. Even
// though we return a cleanup, there is a window during the double-mount where
// the second listener registers before any incoming event is matched against
// the deregistration, causing every event from main to be appended to the
// store twice. The renderer is small enough that StrictMode's other benefits
// don't outweigh this concrete bug.
ReactDOM.createRoot(root).render(
  <ErrorBoundary>{hasBridge ? <App /> : <PreloadMissing />}</ErrorBoundary>,
);
