// ============================================
// Dispatch HQ — Shop Modal (v0.31.0)
// ============================================
// The membership + coins storefront. Fetches the catalog from /api/shop/catalog,
// opens Stripe checkout (or shows the manual-payment notice), and spends coins
// on credits. The coin balance mirrors into the game store so the TopBar chip
// updates the moment a spend lands.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Coins, Crown, Zap } from 'lucide-react';
import { fetchShopCatalog, createShopCheckout, spendCoins, type ShopCatalog } from '@/lib/apiClient';
import { useGameStore } from '@/stores/gameStore';
import { playClick } from '@/utils/sound';
import { COIN_CREDITS_RATE } from '@dispatch-hq/shared';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const priceLabel = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function ShopModal({ isOpen, onClose }: ShopModalProps) {
  const [catalog, setCatalog] = useState<ShopCatalog | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCatalog(null);
    setMsg(null);
    fetchShopCatalog()
      .then((c) => { if (!cancelled) setCatalog(c); })
      .catch(() => { if (!cancelled) setMsg({ ok: false, text: 'Could not load the shop — try again.' }); });
    return () => { cancelled = true; };
  }, [isOpen]);

  async function buy(kind: 'membership' | 'coin_pack', itemId: string, label: string) {
    playClick();
    setBusy(itemId);
    setMsg(null);
    try {
      const res = await createShopCheckout(kind, itemId);
      if (res.url) {
        window.open(res.url, '_blank', 'noopener');
        setMsg({ ok: true, text: `Checkout opened for ${label} — refresh this shop after paying.` });
      } else {
        setMsg({ ok: false, text: res.message ?? 'Manual checkout — reach out to the founder to complete this order.' });
      }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message ?? 'Checkout failed.' });
    } finally {
      setBusy(null);
    }
  }

  async function buyCredits() {
    playClick();
    setBusy('credits');
    setMsg(null);
    try {
      const res = await spendCoins({ kind: 'buy_credits', coins: COIN_CREDITS_RATE.coins });
      const st = useGameStore.getState();
      const p = st.player;
      if (p) {
        st.updatePlayer({ coins: res.coins, credits: (p.credits ?? 0) + (res.creditsGranted ?? 0) });
      }
      setCatalog((c) => (c ? { ...c, me: { ...c.me, coins: res.coins } } : c));
      setMsg({ ok: true, text: `+${(res.creditsGranted ?? 0).toLocaleString()} credits` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error)?.message ?? 'Purchase failed.' });
    } finally {
      setBusy(null);
    }
  }

  const coins = catalog?.me.coins ?? 0;
  const isPremium = catalog?.me.isPremium ?? false;
  const tier = catalog?.tier ?? null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gray-900/95 border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto p-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-white">Shop</h2>
                <p className="text-[11px] text-gray-500">Membership &amp; coins — supports the city</p>
              </div>
              <button onClick={onClose} aria-label="Close shop" className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Balance */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gray-800/50 border border-gray-700/40">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white tabular-nums">{coins.toLocaleString()} coins</span>
              {isPremium && (
                <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
                  <Crown className="w-3 h-3" /> COMMANDER
                </span>
              )}
            </div>

            {/* Membership */}
            {tier && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">{tier.name} Membership</h3>
                  <span className="ml-auto text-sm font-black text-amber-300">{priceLabel(tier.priceCents)}/mo</span>
                </div>
                <ul className="text-[11px] text-gray-400 space-y-1 mb-3">
                  <li>• ×{tier.creditMultiplier} credits on every call</li>
                  <li>• ×{tier.trainingSpeedMultiplier} training speed</li>
                  <li>• ✦ Commander badge in the top bar</li>
                  <li>• 🤝 Alliance auto-respond enabled</li>
                </ul>
                {isPremium ? (
                  <p className="text-[11px] text-amber-300/80">
                    Active until {catalog?.me.premiumExpiresAt ? new Date(catalog.me.premiumExpiresAt).toLocaleDateString() : '—'}.
                  </p>
                ) : (
                  <button
                    onClick={() => void buy('membership', tier.id, 'Commander Membership')}
                    disabled={busy !== null}
                    className="w-full px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold hover:bg-amber-500/30 disabled:opacity-40 transition-colors"
                  >
                    {busy === tier.id ? 'Opening…' : 'Subscribe'}
                  </button>
                )}
              </div>
            )}

            {/* Coin packs */}
            {catalog && catalog.packs.length > 0 && (
              <div className="mb-4">
                <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Coin packs</h3>
                <div className="grid grid-cols-2 gap-2">
                  {catalog.packs.map((p) => {
                    // Value badge: packs that give ≥2× coins per dollar vs the Starter pack
                    const starterRate = catalog.packs[0] ? catalog.packs[0].coinCount / catalog.packs[0].priceCents : 1;
                    const thisRate = p.coinCount / p.priceCents;
                    const valueRatio = thisRate / starterRate;
                    const badge = valueRatio >= 2 ? 'BEST VALUE' : valueRatio >= 1.5 ? 'GREAT DEAL' : null;
                    return (
                    <div key={p.id} className="relative rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 flex flex-col">
                      {badge && (
                        <span className="absolute -top-2 -right-1 text-[11px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {badge}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-500">{p.name}</span>
                      <span className="text-sm font-black text-amber-300 flex items-center gap-1 tabular-nums">
                        <Coins className="w-3.5 h-3.5" /> {p.coinCount.toLocaleString()}
                      </span>
                      <button
                        onClick={() => void buy('coin_pack', p.id, p.name)}
                        disabled={busy !== null}
                        className="mt-2 w-full px-2 py-1.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
                      >
                        {busy === p.id ? '…' : priceLabel(p.priceCents)}
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Spend coins on credits */}
            <div className="mb-2 rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-white flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" /> Buy credits
                </p>
                <p className="text-[11px] text-gray-500">
                  {COIN_CREDITS_RATE.coins} coins → {COIN_CREDITS_RATE.credits.toLocaleString()} credits
                </p>
              </div>
              <button
                onClick={() => void buyCredits()}
                disabled={busy !== null || coins < COIN_CREDITS_RATE.coins}
                className="px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold hover:bg-cyan-500/25 disabled:opacity-40 transition-colors shrink-0"
              >
                {busy === 'credits' ? '…' : 'Buy'}
              </button>
            </div>

            <p className="text-[11px] text-gray-600 mb-3">
              Training skips are available on a unit's training card. Coins are premium currency — everything else stays earnable in-game.
            </p>

            {msg && (
              <p className={`text-[11px] ${msg.ok ? 'text-dispatch-green' : 'text-amber-400'}`}>{msg.text}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
