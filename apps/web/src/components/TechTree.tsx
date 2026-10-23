// ============================================
// Dispatch HQ — Tech Tree / Upgrade System
// ============================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Shield, Brain, Target, Lock, Check, X, Info } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';
import { useNotifications } from './NotificationCenter';
import { TECH_TREE, TECH_BY_ID, BRANCH_CONFIG, type TechBranch, isTechUnlocked } from '@/lib/techTree';
import { saveGame } from '@/hooks/useSaveSystem';

interface TechTreeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TechTree({ isOpen, onClose }: TechTreeProps) {
  const {
    player,
    techPurchased,
    purchaseTech,
  } = useGameStore();

  const credits = player?.credits || 0;
  const { addNotification } = useNotifications();
  const [selectedBranch, setSelectedBranch] = useState<TechBranch>('response');

  const handlePurchase = (techId: string) => {
    const result = purchaseTech(techId);
    if (result) {
      const tech = TECH_BY_ID[techId];
      addNotification({
        type: 'success',
        title: 'Technology Purchased!',
        message: `${tech?.name}: ${tech?.effect}`,
        icon: '🎉',
        duration: 4000,
      });
      saveGame().catch(() => {});
    } else {
      const tech = TECH_BY_ID[techId];
      if (!tech) return;
      if (techPurchased.has(techId)) return;
      if (!isTechUnlocked(tech, techPurchased)) {
        addNotification({
          type: 'error',
          title: 'Requirements Not Met',
          message: 'Research prerequisite technologies first.',
          icon: '🔒',
          duration: 3000,
        });
      } else if (credits < tech.cost) {
        addNotification({
          type: 'error',
          title: 'Insufficient Credits',
          message: `Need ${tech.cost.toLocaleString()} credits.`,
          icon: '💰',
          duration: 3000,
        });
      }
    }
  };

  const branchTechs = TECH_TREE.filter(t => t.branch === selectedBranch).sort((a, b) => a.tier - b.tier);
  const branchConfig = BRANCH_CONFIG[selectedBranch];

  const purchasedCount = [...techPurchased].length;
  const totalCount = TECH_TREE.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-dispatch-cyan/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-dispatch-cyan" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Dispatch Tech Tree</h2>
                  <p className="text-[10px] text-gray-500">
                    {purchasedCount}/{totalCount} technologies researched •{' '}
                    <span className="text-dispatch-green font-semibold">{credits.toLocaleString()} credits</span>
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Branch tabs */}
            <div className="flex gap-2 px-4 py-3 border-b border-gray-800/30 overflow-x-auto">
              {(Object.keys(BRANCH_CONFIG) as TechBranch[]).map((branch) => {
                const config = BRANCH_CONFIG[branch];
                const branchTechsAll = TECH_TREE.filter(t => t.branch === branch);
                const purchasedInB = branchTechsAll.filter(t => techPurchased.has(t.id)).length;
                return (
                  <button
                    key={branch}
                    onClick={() => setSelectedBranch(branch)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      selectedBranch === branch
                        ? `${config.bg} ${config.border} border ${config.color}`
                        : 'bg-gray-800/30 border border-transparent text-gray-400 hover:bg-gray-800/50'
                    }`}
                  >
                    {branch === 'response' && <Zap className="w-4 h-4" />}
                    {branch === 'efficiency' && <Shield className="w-4 h-4" />}
                    {branch === 'technology' && <Brain className="w-4 h-4" />}
                    {branch === 'training' && <Target className="w-4 h-4" />}
                    <span>{config.label}</span>
                    <span className="text-[10px] opacity-60">{purchasedInB}/{branchTechsAll.length}</span>
                  </button>
                );
              })}
            </div>

            {/* Active modifiers summary */}
            <div className="px-4 py-2 bg-gray-950/40 border-b border-gray-800/30 flex flex-wrap gap-2">
              {purchasedCount === 0 ? (
                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Research upgrades to unlock gameplay bonuses.
                </span>
              ) : (
                [...techPurchased].map((id) => {
                  const tech = TECH_BY_ID[id];
                  if (!tech) return null;
                  const cfg = BRANCH_CONFIG[tech.branch];
                  return (
                    <span key={id} className={`text-[10px] px-2 py-1 rounded border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                      {tech.icon} {tech.effect}
                    </span>
                  );
                })
              )}
            </div>

            {/* Tech nodes */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="relative space-y-6">
                {branchTechs.map((tech, index) => {
                  const canAfford = credits >= tech.cost;
                  const reqsMet = isTechUnlocked(tech, techPurchased);
                  const isPurchased = techPurchased.has(tech.id);
                  const isAvailable = reqsMet && !isPurchased && canAfford;

                  return (
                    <div key={tech.id} className="flex items-center gap-4">
                      {/* Connector line */}
                      {index < branchTechs.length - 1 && (
                        <div className="absolute left-[40px] top-16 bottom-0 w-px bg-gradient-to-b from-gray-700/60 to-transparent -z-10" />
                      )}

                      <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.08 }}
                        className={`flex-1 p-4 rounded-xl border transition-all ${
                          isPurchased
                            ? `${branchConfig.bg} ${branchConfig.border}`
                            : isAvailable
                            ? 'bg-gray-800/50 border-gray-600/50 hover:border-gray-500/60'
                            : 'bg-gray-800/20 border-gray-800/30 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${
                            isPurchased ? branchConfig.bg : 'bg-gray-800/60'
                          }`}>
                            {isPurchased ? <Check className={`w-6 h-6 ${branchConfig.color}`} /> : tech.icon}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-white">{tech.name}</h3>
                              <span className="text-[9px] px-1.5 py-0.5 bg-gray-800 rounded text-gray-500 font-mono">
                                T{tech.tier}
                              </span>
                              {isPurchased && (
                                <span className={`text-[9px] px-1.5 py-0.5 ${branchConfig.bg} ${branchConfig.color} rounded`}>
                                  Researched
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">{tech.description}</p>
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              <span className={`text-[10px] font-semibold ${
                                canAfford || isPurchased ? 'text-dispatch-green' : 'text-dispatch-red'
                              }`}>
                                {tech.cost.toLocaleString()} credits
                              </span>
                              {tech.requires && tech.requires.length > 0 && (
                                <span className="text-[10px] text-gray-600">
                                  Requires: {tech.requires.map(r => TECH_BY_ID[r]?.name).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action */}
                          <div className="shrink-0">
                            {isPurchased ? (
                              <div className={`w-8 h-8 rounded-lg ${branchConfig.bg} flex items-center justify-center`}>
                                <Check className={`w-4 h-4 ${branchConfig.color}`} />
                              </div>
                            ) : !reqsMet ? (
                              <Lock className="w-5 h-5 text-gray-600" />
                            ) : (
                              <button
                                onClick={() => handlePurchase(tech.id)}
                                disabled={!isAvailable}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                  isAvailable
                                    ? `${branchConfig.bg} ${branchConfig.color} hover:brightness-125`
                                    : 'bg-gray-800/40 text-gray-600 cursor-not-allowed'
                                }`}
                              >
                                {canAfford ? 'Research' : 'Need $'}
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
