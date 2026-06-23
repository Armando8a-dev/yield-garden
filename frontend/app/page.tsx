"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { useState, useEffect } from "react";
import {
  SEED_TOKEN_ADDRESS, SEED_TOKEN_ABI,
  YIELD_GARDEN_ADDRESS, YIELD_GARDEN_ABI,
} from "./abi";

export default function Home() {
  const { address, isConnected } = useAccount();
  const [mintAmount, setMintAmount] = useState("100");
  const [stakeAmount, setStakeAmount] = useState("10");
  const [newRate, setNewRate] = useState("1");
  const [txMsg, setTxMsg] = useState("");

  const { data: owner } = useReadContract({
    address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "owner",
  });
  const { data: rewardRate } = useReadContract({
    address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "rewardRatePerTokenPerSecond",
  });
  const { data: seedBalance, refetch: refetchSeedBalance } = useReadContract({
    address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "allowance",
    args: address ? [address, YIELD_GARDEN_ADDRESS] : undefined, query: { enabled: !!address },
  });
  const { data: stakeInfo, refetch: refetchStake } = useReadContract({
    address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "stakes",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: pendingRewards, refetch: refetchPending } = useReadContract({
    address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "pendingRewards",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  useEffect(() => {
    const t = setInterval(() => refetchPending(), 5000);
    return () => clearInterval(t);
  }, [refetchPending]);

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const isOwner = address && owner && address.toLowerCase() === (owner as string).toLowerCase();
  const [stakedAmount] = stakeInfo ?? [0n, 0n];
  const isStaking = stakedAmount > 0n;
  const needsApproval = allowance !== undefined && stakeAmount && allowance < parseEther(stakeAmount || "0");

  useEffect(() => {
    if (isSuccess) {
      refetchSeedBalance();
      refetchAllowance();
      refetchStake();
      refetchPending();
      setTxMsg("Transaction confirmed!");
      setTimeout(() => setTxMsg(""), 4000);
    }
  }, [isSuccess, refetchSeedBalance, refetchAllowance, refetchStake, refetchPending]);

  const handleMint = () => {
    if (!address || !mintAmount || Number(mintAmount) <= 0) return;
    writeContract({
      address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "mint",
      args: [address, parseEther(mintAmount)],
    });
  };

  const handleApprove = () => {
    if (!stakeAmount) return;
    writeContract({
      address: SEED_TOKEN_ADDRESS, abi: SEED_TOKEN_ABI, functionName: "approve",
      args: [YIELD_GARDEN_ADDRESS, parseEther(stakeAmount)],
    });
  };

  const handleStake = () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) return;
    writeContract({
      address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "stake",
      args: [parseEther(stakeAmount)],
    });
  };

  const handleClaim = () => {
    writeContract({
      address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "claimRewards",
    });
  };

  const handleUnstake = () => {
    writeContract({
      address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "unstake",
    });
  };

  const handleSetRate = () => {
    if (!newRate) return;
    writeContract({
      address: YIELD_GARDEN_ADDRESS, abi: YIELD_GARDEN_ABI, functionName: "setRewardRate",
      args: [BigInt(newRate)],
    });
  };

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-green-400">🌱 YieldGarden</h1>
          <p className="text-sm text-white/50">Stake SEED, earn ETH every second · Sepolia</p>
        </div>
        <ConnectButton />
      </div>

      {!isConnected ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-4xl mb-4">🌱</p>
          <p className="text-white/60">Connect your wallet to mint SEED and start staking.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Wallet stats */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-white/50 mb-1">SEED Balance</p>
                <p className="text-3xl font-bold text-green-400">
                  {seedBalance !== undefined ? Number(formatEther(seedBalance)).toFixed(2) : "0.00"}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/50 mb-1">Staked</p>
                <p className="text-3xl font-bold text-white">
                  {Number(formatEther(stakedAmount)).toFixed(2)}
                </p>
              </div>
            </div>
            <p className="text-xs text-white/40 mt-3">
              Reward rate: <span className="text-green-400">{rewardRate?.toString() ?? "—"} wei</span> per SEED per second
            </p>
          </div>

          {/* Mint SEED */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="font-semibold mb-4 text-green-400">🪙 Mint SEED (testnet faucet)</h2>
            <div className="flex gap-2">
              <input
                type="number" min="0" value={mintAmount}
                onChange={(e) => setMintAmount(e.target.value)}
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-green-400"
                placeholder="SEED amount"
              />
              <button
                onClick={handleMint}
                disabled={isPending || !mintAmount}
                className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold px-6 py-2 rounded-xl transition-colors"
              >
                {isPending ? "..." : "Mint"}
              </button>
            </div>
          </div>

          {/* Stake / pending rewards */}
          {!isStaking ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="font-semibold mb-4 text-green-400">🌾 Stake SEED</h2>
              <div className="flex gap-2">
                <input
                  type="number" min="0" value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-green-400"
                  placeholder="SEED amount"
                />
                {needsApproval ? (
                  <button
                    onClick={handleApprove}
                    disabled={isPending || !stakeAmount}
                    className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold px-6 py-2 rounded-xl transition-colors"
                  >
                    {isPending ? "..." : "Approve"}
                  </button>
                ) : (
                  <button
                    onClick={handleStake}
                    disabled={isPending || !stakeAmount}
                    className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold px-6 py-2 rounded-xl transition-colors"
                  >
                    {isPending ? "..." : "Stake"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-green-400/30 bg-green-400/5 p-6">
              <h2 className="font-semibold mb-2 text-green-400">⏳ Pending Rewards</h2>
              <p className="text-3xl font-bold text-white mb-4">
                {pendingRewards !== undefined ? formatEther(pendingRewards) : "0"} ETH
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClaim}
                  disabled={isPending}
                  className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  {isPending ? "..." : "Claim Rewards"}
                </button>
                <button
                  onClick={handleUnstake}
                  disabled={isPending}
                  className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  {isPending ? "..." : "Unstake All"}
                </button>
              </div>
            </div>
          )}

          {/* Owner panel */}
          {isOwner && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="font-semibold mb-4 text-green-400">⚡ Set Reward Rate (Owner)</h2>
              <div className="flex gap-2">
                <input
                  type="number" min="0" value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-green-400"
                  placeholder="wei per SEED per second"
                />
                <button
                  onClick={handleSetRate}
                  disabled={isPending || !newRate}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white font-semibold px-6 py-2 rounded-xl transition-colors"
                >
                  {isPending ? "..." : "Update"}
                </button>
              </div>
            </div>
          )}

          {/* Tx feedback */}
          {txMsg && (
            <div className="rounded-xl border border-green-400/30 bg-green-400/10 p-4 text-green-400 text-sm text-center">
              ✅ {txMsg}
            </div>
          )}

          {txHash && !isSuccess && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/50 text-center">
              Waiting for confirmation...{" "}
              <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" className="text-green-400 underline">
                View on Etherscan
              </a>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-white/20 mt-8">
        Garden:{" "}
        <a href={`https://sepolia.etherscan.io/address/${YIELD_GARDEN_ADDRESS}`} target="_blank" className="underline hover:text-white/40">
          {YIELD_GARDEN_ADDRESS.slice(0, 6)}...{YIELD_GARDEN_ADDRESS.slice(-4)}
        </a>
        {" · "}SEED:{" "}
        <a href={`https://sepolia.etherscan.io/address/${SEED_TOKEN_ADDRESS}`} target="_blank" className="underline hover:text-white/40">
          {SEED_TOKEN_ADDRESS.slice(0, 6)}...{SEED_TOKEN_ADDRESS.slice(-4)}
        </a>
      </p>
    </main>
  );
}
