"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useState, useEffect, useMemo } from "react";
import {
  SEED_TOKEN_ADDRESS, YIELD_GARDEN_ADDRESS, SEED_TOKEN_ABI, YIELD_GARDEN_ABI,
} from "./abi";

const DAY = 86400;
/** Time to a full canopy. Kept short on purpose: a visitor who plants should see
 *  the plot respond within their session, not 24 hours later. */
const FULL_GROWTH = 2 * 3600;

/* Rewards can span many orders of magnitude depending on the emission rate,
   so pick the unit that actually reads well instead of printing 0.000. */
function fmtReward(wei?: bigint) {
  if (!wei) return { v: "0", u: "WEI" };
  const eth = Number(formatEther(wei));
  if (eth >= 0.0001) return { v: eth.toFixed(5), u: "ETH" };
  const gwei = Number(wei) / 1e9;
  if (gwei >= 1) return { v: gwei.toFixed(2), u: "GWEI" };
  return { v: Number(wei).toLocaleString("en-US"), u: "WEI" };
}
const fmtTok = (v?: bigint, d = 2) =>
  v === undefined ? "—" : Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: d });

/* ─────────────────────── THE PLANT ─────────────────────── */
function Plant({ growth, dew }: { growth: number; dew: number }) {
  // growth 0..1 drives stem height and leaf count
  const H = 210 * growth;
  const topY = 250 - H;
  const leafCount = Math.min(8, Math.floor(growth * 9));

  const leaves = useMemo(
    () =>
      Array.from({ length: leafCount }, (_, i) => {
        const t = (i + 1) / (leafCount + 1);
        const y = 250 - H * t;
        const side = i % 2 === 0 ? 1 : -1;
        const size = 16 + 16 * (1 - t) * growth;
        const sway = Math.sin(t * Math.PI) * 6 * side;
        return { y, side, size, x: 100 + sway };
      }),
    [leafCount, H, growth]
  );

  return (
    <svg viewBox="0 0 200 270" className="w-full h-full" role="img" aria-label="Your plot">
      {/* soil mound */}
      <ellipse cx="100" cy="252" rx="52" ry="10" fill="rgba(26,18,11,0.9)" />
      <ellipse cx="100" cy="250" rx="38" ry="6" fill="rgba(56,38,22,0.85)" />

      {growth <= 0 ? (
        /* dormant seed */
        <g>
          <ellipse cx="100" cy="244" rx="9" ry="12" fill="#7c5c33" />
          <path d="M100 236 q4 -6 0 -10" stroke="var(--leaf)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.75" />
        </g>
      ) : (
        <g className="sway">
          <g className="grow">
            {/* stem */}
            <path
              d={`M100 250 Q ${100 + 10 * growth} ${250 - H / 2} 100 ${topY}`}
              stroke="var(--leaf-deep)" strokeWidth={3 + 2 * growth} fill="none" strokeLinecap="round"
            />
            {/* leaves */}
            {leaves.map((l, i) => (
              <path
                key={i}
                d={`M${l.x} ${l.y} q ${l.side * l.size} ${-l.size * 0.55} ${l.side * l.size * 1.5} 0 q ${-l.side * l.size * 0.5} ${l.size * 0.7} ${-l.side * l.size * 1.5} 0 z`}
                fill="var(--leaf)" opacity={0.55 + 0.4 * (i / Math.max(leaves.length, 1))}
              />
            ))}
            {/* crown bud */}
            <circle cx="100" cy={topY} r={4 + 3 * growth} fill="var(--leaf)" opacity="0.9" />
          </g>

          {/* harvest dew — one drop per unit of pending reward, capped */}
          {Array.from({ length: Math.min(5, dew) }).map((_, i) => {
            const l = leaves[Math.max(0, leaves.length - 1 - i)];
            if (!l) return null;
            return (
              <circle
                key={`d${i}`} className="dew"
                cx={l.x + l.side * l.size * 1.2} cy={l.y + 4} r="4.5"
                fill="var(--harvest)"
                style={{ animationDelay: `${i * 0.45}s`, filter: "drop-shadow(0 0 6px rgba(251,191,36,0.8))" }}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(t);
  }, []);

  const acc = address as `0x${string}` | undefined;
  const G = { address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI } as const;

  const { data: stakeInfo, refetch: rStake } = useReadContract({
    ...G, functionName: "stakes", args: acc ? [acc] : undefined, query: { enabled: !!acc },
  });
  const { data: pending, refetch: rPend } = useReadContract({
    ...G, functionName: "pendingRewards", args: acc ? [acc] : undefined,
    query: { enabled: !!acc, refetchInterval: 6000 },
  });
  const { data: totalStaked, refetch: rTotal } = useReadContract({
    ...G, functionName: "totalStaked", query: { refetchInterval: 6000 },
  });
  const { data: rate } = useReadContract({ ...G, functionName: "rewardRatePerTokenPerSecond" });

  const { data: seedBal, refetch: rBal } = useReadContract({
    address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "balanceOf",
    args: acc ? [acc] : undefined, query: { enabled: !!acc },
  });
  const { data: allowance, refetch: rAllow } = useReadContract({
    address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "allowance",
    args: acc ? [acc, YIELD_GARDEN_ADDRESS] : undefined, query: { enabled: !!acc },
  });

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isMining;
  useEffect(() => {
    if (isSuccess) { rStake(); rPend(); rTotal(); rBal(); rAllow(); reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const staked = stakeInfo?.[0] ?? 0n;
  const stakedAt = Number(stakeInfo?.[1] ?? 0n);
  const isPlanted = staked > 0n;
  const elapsed = isPlanted ? Math.max(0, now - stakedAt) : 0;
  // sqrt curve so a fresh plot sprouts fast, then eases toward a full canopy
  const growth = isPlanted ? Math.max(0.14, Math.min(1, Math.sqrt(elapsed / FULL_GROWTH))) : 0;

  const amtWei = amount ? parseEther(amount) : 0n;
  const needsApproval = allowance !== undefined && amtWei > 0n && (allowance as bigint) < amtWei;
  const reward = fmtReward(pending);
  const dewCount = pending && pending > 0n ? Math.min(5, 1 + Math.floor(Number(pending) / 5e4)) : 0;

  const faucet = () =>
    writeContract({ address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "mint", args: [acc!, parseEther("500")] });
  const approve = () =>
    writeContract({ address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "approve", args: [YIELD_GARDEN_ADDRESS, amtWei] });
  const plant = () =>
    writeContract({ address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "stake", args: [amtWei] });
  const harvest = () =>
    writeContract({ address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "claimRewards" });
  const uproot = () =>
    writeContract({ address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "unstake" });

  const days = Math.floor(elapsed / DAY), hrs = Math.floor((elapsed % DAY) / 3600);

  return (
    <div className="min-h-dvh flex flex-col">
      {/* ══════════ SKY / PLOT SCENE ══════════ */}
      <section className="sky relative flex-1 min-h-[54vh] overflow-hidden">
        {/* pollen */}
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="pollen"
            style={{
              left: `${(i * 7 + 6) % 96}%`, bottom: `${(i * 13) % 45}%`,
              width: `${2 + (i % 3)}px`, height: `${2 + (i % 3)}px`,
              ["--dur" as string]: `${11 + (i % 6) * 2.5}s`,
              ["--delay" as string]: `${i * 1.1}s`,
              ["--dx" as string]: `${((i % 5) - 2) * 22}px`,
              opacity: 0.4,
            }}
          />
        ))}

        {/* header */}
        <header className="relative z-20 flex items-start justify-between gap-6 px-6 md:px-10 pt-7">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight leading-none">
              Yield<span style={{ color: "var(--leaf)" }}>Garden</span>
            </h1>
            <p className="text-[12px] tracking-[0.16em] text-white/40 mt-2 uppercase">
              Plant SEED · Harvest ETH
            </p>
          </div>
          <ConnectButton />
        </header>

        {/* plot stats floating in the sky */}
        <div className="relative z-20 flex flex-wrap gap-x-8 gap-y-2 px-6 md:px-10 mt-6 text-[12px]">
          {[
            { k: "Planted in the garden", v: `${fmtTok(totalStaked as bigint)} SEED` },
            { k: "Emission", v: `${rate?.toString() ?? "—"} wei / token · sec` },
            { k: "Your plot", v: isPlanted ? `${days}d ${hrs}h growing` : "empty" },
          ].map((s) => (
            <div key={s.k}>
              <p className="text-white/35 uppercase tracking-wider text-[10px]">{s.k}</p>
              <p className="text-white/80 tabular mt-0.5">{s.v}</p>
            </div>
          ))}
        </div>

        {/* the plant */}
        <div className="relative z-10 flex items-end justify-center h-[min(46vh,380px)] mt-2">
          <div className="w-[240px] md:w-[300px] h-full">
            <Plant growth={growth} dew={dewCount} />
          </div>
        </div>

        {/* pending harvest readout */}
        {isConnected && isPlanted && (
          <div className="relative z-20 text-center pb-6">
            <p className="text-[10px] uppercase tracking-[0.25em] text-white/40">Ready to harvest</p>
            <p className="font-display text-4xl md:text-5xl font-black tabular mt-1" style={{ color: "var(--harvest)" }}>
              {reward.v} <span className="text-lg font-semibold">{reward.u}</span>
            </p>
          </div>
        )}
      </section>

      {/* ══════════ SOIL / CONTROLS ══════════ */}
      <div className="soil-crest" />
      <section className="soil px-6 md:px-10 pt-6 pb-8">
        <div className="max-w-3xl mx-auto">
          {!isConnected ? (
            <div className="text-center py-6">
              <h2 className="font-display text-2xl font-bold mb-2">The plot is yours to sow.</h2>
              <p className="text-white/45 max-w-md mx-auto">
                Connect a wallet to plant SEED. Every second it stays in the ground, the contract
                accrues ETH for you — claim it whenever, or uproot and take everything home.
              </p>
            </div>
          ) : isPlanted ? (
            <div className="grid md:grid-cols-[1.2fr_1fr] gap-5 items-end">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Your planting</p>
                <p className="font-display text-3xl font-bold tabular mt-1">
                  {fmtTok(staked)} <span className="text-base font-semibold text-white/50">SEED</span>
                </p>
                <p className="text-xs text-white/35 mt-2">
                  Growing for {days}d {hrs}h · rewards accrue every second, no lock-up
                </p>
              </div>
              <div className="flex gap-2.5">
                <button onClick={harvest} disabled={busy || !pending || pending === 0n}
                  className="flex-1 font-semibold py-3.5 rounded-full transition-all disabled:opacity-35 hover:brightness-110"
                  style={{ background: "var(--harvest)", color: "#231a05" }}>
                  {busy ? "…" : "Harvest ETH"}
                </button>
                <button onClick={uproot} disabled={busy}
                  className="flex-1 font-semibold py-3.5 rounded-full border transition-all disabled:opacity-35 hover:bg-white/5"
                  style={{ borderColor: "rgba(134,239,172,0.35)", color: "var(--leaf)" }}>
                  {busy ? "…" : "Uproot all"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-[1.2fr_1fr] gap-5 items-end">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Sow an amount</p>
                  <button onClick={faucet} disabled={busy}
                    className="text-[11px] text-white/40 hover:text-white underline underline-offset-2 transition-colors disabled:opacity-40">
                    need SEED? get 500
                  </button>
                </div>
                <div className="flex items-baseline gap-3 border-b pb-2" style={{ borderColor: "rgba(134,239,172,0.25)" }}>
                  <input type="number" min="0" step="1" value={amount}
                    onChange={(e) => setAmount(e.target.value)} placeholder="0"
                    className="flex-1 min-w-0 bg-transparent font-display text-4xl font-bold tabular focus:outline-none placeholder:text-white/15" />
                  <span className="text-sm font-semibold text-white/45">SEED</span>
                </div>
                <p className="text-xs text-white/35 mt-2">
                  In your wallet: {fmtTok(seedBal as bigint)} SEED
                </p>
              </div>
              <div>
                {needsApproval ? (
                  <button onClick={approve} disabled={busy || amtWei === 0n}
                    className="w-full font-semibold py-3.5 rounded-full transition-all disabled:opacity-35 hover:brightness-110"
                    style={{ background: "var(--harvest)", color: "#231a05" }}>
                    {busy ? "…" : "1 · Approve SEED"}
                  </button>
                ) : (
                  <button onClick={plant} disabled={busy || amtWei === 0n}
                    className="w-full font-semibold py-3.5 rounded-full transition-all disabled:opacity-35 hover:brightness-110"
                    style={{ background: "var(--leaf)", color: "#052e16" }}>
                    {busy ? "…" : "Plant it"}
                  </button>
                )}
                <p className="text-[11px] text-white/30 mt-2.5 text-center">One planting at a time per wallet</p>
              </div>
            </div>
          )}

          <div className="mt-7 pt-4 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
            <a href={`https://sepolia.etherscan.io/address/${YIELD_GARDEN_ADDRESS}`} target="_blank" rel="noreferrer"
              className="text-[11px] text-white/25 hover:text-white/50 transition-colors">
              Garden {YIELD_GARDEN_ADDRESS.slice(0, 8)}…{YIELD_GARDEN_ADDRESS.slice(-6)} · Sepolia
            </a>
            {txHash && !isSuccess && (
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"
                className="text-[11px] transition-colors" style={{ color: "var(--leaf)" }}>
                waiting for confirmation — view tx
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
