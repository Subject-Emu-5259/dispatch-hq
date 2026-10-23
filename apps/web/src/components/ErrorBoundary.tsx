// ============================================
// Dispatch HQ — Root Error Boundary
// ============================================
// Catches any render crash anywhere in the app and shows a recovery
// screen instead of unmounting to a blank black page. A single bad API
// payload or component bug must never brick the whole game session.

import { Component, type ReactNode } from 'react';
import { Siren, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] App crashed:', error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-gray-950 flex flex-col items-center justify-center text-center p-6">
          <div className="w-12 h-12 rounded-2xl bg-dispatch-red/20 flex items-center justify-center mb-4">
            <Siren className="w-6 h-6 text-dispatch-red" />
          </div>
          <h1 className="text-lg font-black text-white mb-1">Dispatch Interrupted</h1>
          <p className="text-xs text-gray-500 max-w-sm mb-5">
            Something went wrong on the console. Your progress is safe — reload to resume operations.
          </p>
          <button
            onClick={this.handleReload}
            className="flex items-center gap-2 px-4 py-2 bg-dispatch-red text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reload Game
          </button>
          {this.state.error?.message && (
            <p className="mt-4 text-[9px] text-gray-700 max-w-sm break-words">{this.state.error.message}</p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
