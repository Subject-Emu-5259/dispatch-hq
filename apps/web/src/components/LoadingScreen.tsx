// ============================================
// Dispatch HQ — Loading Screen
// ============================================
// Animated loading screen with progress, tips, and dispatch branding.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Truck, Shield, Flame, Heart } from 'lucide-react';
import { RELEASE_NOTES } from '../data/releaseNotes';

interface LoadingScreenProps {
  onComplete: () => void;
}

const LOADING_TIPS = [
  'Dispatch units closest to the incident for fastest response times.',
  'Each city has unique traits — Paris spawns more fires, London slows response with congestion.',
  'Claim your daily login bonus on the main menu — Commander members get 5 coins per day.',
  'Alliance members can share missions in real time — respond to your allies\' calls from the Alliance tab.',
  'Radio chatter changes with the city — London says \'Acknowledged\', Paris says \'Reçu\', Tokyo says \'Shōchi\'.',
  'Match unit types to mission requirements for faster clearance and bigger speed bonuses.',
  'Upgrade your stations to unlock better units, faster deployment, and expanded crew capacity.',
  'Use recall to reposition units mid-mission — useful when a closer unit becomes available.',
  'Weather affects gameplay: storms boost road rescues, fog slows response, heatwaves drive EMS calls.',
  'Patrol crime hot zones to spot incidents early — toggle the Crime Heat overlay to find them.',
  'Build the City General Hospital and helipad for EMS patients and critical airlifts.',
  'The Shift Report debriefs every shift — patrol coverage, crew fatigue, and CPU-handled calls.',
];

const SERVICE_ICONS = [Radio, Shield, Flame, Heart, Truck, Radio];

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + Math.random() * 15 + 5;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsReady(true), 500);
          return 100;
        }
        return next;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-dispatch-red/5 via-transparent to-dispatch-blue/5" />

      {/* Animated background icons */}
      <div className="absolute inset-0 overflow-hidden opacity-10">
        {SERVICE_ICONS.map((Icon, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{
              x: Math.random() * 1200,
              y: Math.random() * 800,
              rotate: 0,
            }}
            animate={{
              y: [Math.random() * 800, Math.random() * 800],
              rotate: 360,
            }}
            transition={{
              duration: 15 + Math.random() * 10,
              repeat: Infinity,
              ease: 'linear',
            }}
          >
            <Icon className="w-16 h-16 text-dispatch-red" />
          </motion.div>
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Title */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="mb-8 text-center"
        >
          <img
            src="/logo.png?v=13"
            alt="Dispatch HQ"
            className="w-24 h-24 rounded-full object-cover border border-gray-700/50 shadow-2xl mx-auto mb-5"
          />
          <h1 className="text-4xl font-black text-white tracking-tight text-center">
            DISPATCH <span className="text-dispatch-red">HQ</span>
          </h1>
          <p className="text-sm text-gray-500 text-center mt-1 font-medium">
            Emergency Dispatch Simulation
          </p>
        </motion.div>

        {/* Loading bar */}
        <div className="w-64 mb-6">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-gray-500 font-medium">Loading</span>
            <span className="text-dispatch-red font-bold font-mono">{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-dispatch-red to-dispatch-orange rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Tip */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tipIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="max-w-sm text-center"
          >
            <p className="text-[11px] text-gray-600 uppercase tracking-wider font-semibold mb-1">Dispatch Tip</p>
            <p className="text-sm text-gray-400">{LOADING_TIPS[tipIndex]}</p>
          </motion.div>
        </AnimatePresence>

        {/* Ready button */}
        <AnimatePresence>
          {isReady && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onComplete}
              className="mt-8 px-8 py-3 bg-dispatch-red hover:bg-red-600 text-white font-bold rounded-xl
                         shadow-lg shadow-dispatch-red/30 transition-colors"
            >
              Enter Dispatch HQ
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Version — always mirrors the latest release note so it never goes stale */}
      <div className="absolute bottom-4 left-4">
        <p className="text-[11px] text-gray-700 font-mono">v{RELEASE_NOTES[0]?.version ?? '0.8.0'}</p>
      </div>
    </motion.div>
  );
}
