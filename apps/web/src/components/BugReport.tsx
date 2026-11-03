// ============================================
// Dispatch HQ — Bug Report Modal
// ============================================

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, fetchKnownIssues, fetchMyBugReports, type KnownIssue, type MyBugReport, type BugReportStatus } from '../lib/apiClient';
import { Bug, X, Send, CheckCircle, Wrench, Search, FileText } from 'lucide-react';

interface BugReportProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  'UI / Display',
  'Gameplay / Mechanics',
  'Pathfinding / Navigation',
  'CAD System',
  'Performance',
  'Other',
];

type BugTab = 'report' | 'known' | 'mine';

const STATUS_META: Record<BugReportStatus, { label: string; chip: string }> = {
  new: { label: 'New', chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  investigating: { label: 'Investigating', chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  fixed: { label: 'Fixed', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
};

function statusChip(status: BugReportStatus) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded font-bold uppercase border ${meta.chip}`}>
      {meta.label}
    </span>
  );
}

export default function BugReport({ isOpen, onClose }: BugReportProps) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BugTab>('report');
  const [known, setKnown] = useState<KnownIssue[]>([]);
  const [knownLoading, setKnownLoading] = useState(false);
  const [mine, setMine] = useState<MyBugReport[]>([]);
  const [mineLoading, setMineLoading] = useState(false);

  // Load the known-issues list whenever the modal opens or the tab is shown.
  useEffect(() => {
    if (!isOpen || tab !== 'known') return;
    let mounted = true;
    setKnownLoading(true);
    fetchKnownIssues()
      .then((issues) => mounted && setKnown(Array.isArray(issues) ? issues : []))
      .catch(() => mounted && setKnown([]))
      .finally(() => mounted && setKnownLoading(false));
    return () => { mounted = false; };
  }, [isOpen, tab]);

  // Load the player's own reports whenever the modal opens or the tab is shown.
  useEffect(() => {
    if (!isOpen || tab !== 'mine') return;
    let mounted = true;
    setMineLoading(true);
    fetchMyBugReports()
      .then((reports) => mounted && setMine(Array.isArray(reports) ? reports : []))
      .catch(() => mounted && setMine([]))
      .finally(() => mounted && setMineLoading(false));
    return () => { mounted = false; };
  }, [isOpen, tab]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setError(null);

    const categoryLabel = category || 'Other';
    const fullDescription = [title.trim(), description.trim(), steps.trim() ? `Steps to reproduce:
${steps.trim()}` : ''].filter(Boolean).join('\n\n');

    let ok = false;
    try {
      await apiFetch('/bug-reports', {
        method: 'POST',
        body: JSON.stringify({ category: categoryLabel, description: fullDescription }),
      });
      setSubmitted(true);
      ok = true;
    } catch {
      // Surface the failure instead of a silent catch — players should know
      // their report did not reach the server.
      setError('Could not submit the report — check your connection and try again.');
    } finally {
      setSubmitting(false);
    }

    if (ok) {
      setTimeout(() => {
        setSubmitted(false);
        setTitle('');
        setDescription('');
        setSteps('');
        setCategory('');
        onClose();
      }, 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-4 bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div className="flex items-center gap-2.5">
                <Bug className="w-5 h-5 text-dispatch-red" />
                <div>
                  <h2 className="text-sm font-bold text-white">Report a Bug</h2>
                  <p className="text-[11px] text-gray-500">Help us improve Dispatch HQ</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Tab switcher */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setTab('report')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${tab === 'report' ? 'text-dispatch-red border-b-2 border-dispatch-red' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Bug className="w-3 h-3" /> Report
              </button>
              <button
                onClick={() => setTab('known')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${tab === 'known' ? 'text-dispatch-red border-b-2 border-dispatch-red' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Wrench className="w-3 h-3" /> Known Issues
              </button>
              <button
                onClick={() => setTab('mine')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${tab === 'mine' ? 'text-dispatch-red border-b-2 border-dispatch-red' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <FileText className="w-3 h-3" /> My Reports
              </button>
            </div>

            {tab === 'mine' ? (
              <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
                {mineLoading && <p className="text-xs text-gray-500 text-center py-6 animate-pulse">Loading your reports…</p>}
                {!mineLoading && mine.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-8">You haven't filed any reports yet.</p>
                )}
                {!mineLoading && mine.map((r) => (
                  <div key={r.id} className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-bold text-white uppercase">{r.category}</span>
                      {statusChip(r.status)}
                      {r.assignee && <span className="text-[11px] text-gray-500 ml-auto">👤 {r.assignee}</span>}
                    </div>
                    <p className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">{r.description}</p>
                    {r.notes ? (
                      <div className="mt-1.5 flex items-start gap-1.5 px-2 py-1.5 rounded bg-blue-500/10 border border-blue-500/25">
                        <span className="text-[11px]">💬</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-300">Team Note</p>
                          <p className="text-[11px] text-blue-200 whitespace-pre-wrap break-words">{r.notes}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-gray-600">
                        Status: {STATUS_META[r.status]?.label ?? r.status} — check back for an update.
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-gray-600">
                      Filed {new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                ))}
              </div>
            ) : tab === 'known' ? (
              <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/30 text-[11px] text-gray-400">
                  <Search className="w-3.5 h-3.5 shrink-0 text-dispatch-red" />
                  Check the known list first — your issue may already be on our radar.
                </div>
                {knownLoading && <p className="text-xs text-gray-500 text-center py-6 animate-pulse">Loading known issues…</p>}
                {!knownLoading && known.length === 0 && (
                  <p className="text-xs text-gray-600 text-center py-8">No known issues right now — the city is running clean.</p>
                )}
                {!knownLoading && known.map((issue) => (
                  <div key={issue.id} className="bg-gray-800/40 border border-gray-700/30 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[11px] font-bold text-white uppercase">{issue.category}</span>
                      {statusChip(issue.status)}
                      {issue.assignee && <span className="text-[11px] text-gray-500 ml-auto">👤 {issue.assignee}</span>}
                    </div>
                    <p className="text-[11px] text-gray-300 whitespace-pre-wrap break-words">{issue.description}</p>
                  </div>
                ))}
              </div>
            ) : submitted ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <CheckCircle className="w-12 h-12 text-green-400 mb-3" />
                <p className="text-sm font-semibold text-white">Report Submitted</p>
                <p className="text-xs text-gray-400 mt-1">Thank you for your feedback!</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    Category
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                          category === cat
                            ? 'bg-dispatch-red/20 text-dispatch-red border-dispatch-red/40'
                            : 'bg-gray-800/50 text-gray-400 border-gray-700/30 hover:border-gray-600'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    Title <span className="text-dispatch-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief description of the issue"
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-dispatch-red/40"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    Description <span className="text-dispatch-red">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened? What did you expect to happen?"
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-dispatch-red/40 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    Steps to Reproduce
                  </label>
                  <textarea
                    value={steps}
                    onChange={(e) => setSteps(e.target.value)}
                    placeholder="1. Go to...\n2. Click...\n3. Observe..."
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700/40 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-dispatch-red/40 resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dispatch-red/10 border border-dispatch-red/30 text-[11px] text-red-400">
                    <Bug className="w-3.5 h-3.5 shrink-0" /> {error}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-700/50 text-gray-400 text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!title.trim() || !description.trim() || submitting}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-dispatch-red text-white text-sm font-medium hover:bg-dispatch-red/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Submit Report
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}