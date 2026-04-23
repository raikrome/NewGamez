/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, RotateCcw, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Constants ---
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.45;
const FLAP_POWER = -7.5;
const PIPE_SPEED = 3;
const PIPE_SPAWN_INTERVAL = 120; // frames
const PIPE_WIDTH = 60;
const PIPE_GAP = 180;
const UNICORN_SIZE = 40;
const COLLISION_SLOP = 6; // Make collision a bit more forgiving

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
  id: number;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('unicorn_high_score');
    return saved ? parseInt(saved) : 0;
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>(null);
  const unicornRef = useRef({ y: CANVAS_HEIGHT / 2, vy: 0 });
  const pipesRef = useRef<Pipe[]>([]);
  const frameCountRef = useRef(0);
  const lastPipeIdRef = useRef(0);

  // --- Sound Effects ---
  const flapSound = useRef<HTMLAudioElement | null>(null);
  const scoreSound = useRef<HTMLAudioElement | null>(null);
  const hitSound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Using CDN for high reliability and correct content-headers
    flapSound.current = new Audio('https://cdn.jsdelivr.net/gh/samuelcust/flappy-bird-assets@master/audio/wing.wav');
    scoreSound.current = new Audio('https://cdn.jsdelivr.net/gh/samuelcust/flappy-bird-assets@master/audio/point.wav');
    hitSound.current = new Audio('https://cdn.jsdelivr.net/gh/samuelcust/flappy-bird-assets@master/audio/hit.wav');
    
    // Pre-load sounds
    [flapSound, scoreSound, hitSound].forEach(s => {
      if (s.current) {
        s.current.load();
        s.current.volume = 0.5;
      }
    });
  }, []);

  const playSound = (sound: React.RefObject<HTMLAudioElement | null>) => {
    if (sound.current) {
      sound.current.currentTime = 0;
      sound.current.play().catch(e => console.warn("Audio playback blocked", e));
    }
  };

  // --- Sound Effects (Simulated with visual feedback for now) ---
  const triggerConfetti = useCallback(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#8B00FF']
    });
  }, []);

  const startGame = () => {
    setGameState('PLAYING');
    setScore(0);
    unicornRef.current = { y: CANVAS_HEIGHT / 2, vy: 0 };
    pipesRef.current = [];
    frameCountRef.current = 0;
  };

  const gameOver = useCallback(() => {
    setGameState('GAME_OVER');
    playSound(hitSound);
    setHighScore(prev => {
      if (score > prev) {
        localStorage.setItem('unicorn_high_score', score.toString());
        triggerConfetti();
        return score;
      }
      return prev;
    });
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
  }, [score, triggerConfetti]);

  const flap = useCallback(() => {
    if (gameState === 'PLAYING') {
      unicornRef.current.vy = FLAP_POWER;
      playSound(flapSound);
    } else if (gameState !== 'PLAYING') {
      startGame();
    }
  }, [gameState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flap]);

  // --- Draw Helpers ---
  const drawUnicorn = (ctx: CanvasRenderingContext2D, y: number, vy: number) => {
    ctx.save();
    ctx.translate(50 + UNICORN_SIZE / 2, y + UNICORN_SIZE / 2);
    
    // Rotate based on velocity for dynamic feel
    const rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, vy * 0.05));
    ctx.rotate(rotation);

    const size = UNICORN_SIZE;
    const bodyColor = '#ffffff';
    const maneColor = '#ff69b4'; // Pink
    const hornColor = '#ffd700'; // Gold
    const shadowColor = 'rgba(0,0,0,0.1)';

    // --- Draw Body (With Shading) ---
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.45, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly shadow
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.1, size * 0.35, size * 0.15, 0, 0, Math.PI);
    ctx.fill();

    // --- Draw Legs (Simple silhouette) ---
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    // Back legs
    ctx.beginPath();
    ctx.moveTo(-size * 0.2, size * 0.1);
    ctx.lineTo(-size * 0.25, size * 0.4);
    ctx.moveTo(-size * 0.1, size * 0.15);
    ctx.lineTo(-size * 0.15, size * 0.35);
    // Front legs
    ctx.moveTo(size * 0.2, size * 0.1);
    ctx.lineTo(size * 0.25, size * 0.4);
    ctx.moveTo(size * 0.3, size * 0.15);
    ctx.lineTo(size * 0.35, size * 0.35);
    ctx.stroke();

    // --- Draw Tail (Animated) ---
    ctx.save();
    const tailWag = Math.sin(Date.now() / 200) * 0.2;
    ctx.rotate(tailWag);
    ctx.lineWidth = 5;
    ctx.strokeStyle = maneColor;
    ctx.beginPath();
    ctx.moveTo(-size * 0.35, 0);
    ctx.bezierCurveTo(-size * 0.8, -size * 0.3, -size * 0.8, size * 0.3, -size * 1.1, size * 0.2);
    ctx.stroke();
    ctx.restore();

    // --- Draw Head & Neck ---
    ctx.save();
    ctx.translate(size * 0.25, -size * 0.15);
    ctx.rotate(-Math.PI / 8);
    
    // Neck
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.1, -size * 0.4);
    ctx.lineTo(size * 0.3, -size * 0.4);
    ctx.lineTo(size * 0.15, size * 0.2);
    ctx.closePath();
    ctx.fill();

    // Mane (On neck)
    ctx.fillStyle = maneColor;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.2, -size * 0.3, -size * 0.1, -size * 0.5);
    ctx.lineTo(size * 0.1, -size * 0.4);
    ctx.fill();
    
    // Head shape
    ctx.translate(size * 0.15, -size * 0.45);
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(size * 0.1, 0, size * 0.25, size * 0.16, 0.2, 0, Math.PI * 2);
    ctx.fill();
    
    // Snout shadow
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.ellipse(size * 0.2, size * 0.05, size * 0.1, size * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(size * 0.15, -size * 0.05, 2, 0, Math.PI * 2);
    ctx.fill();

    // Horn (Golden & Layered)
    ctx.fillStyle = hornColor;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.lineTo(size * 0.05, -size * 0.5);
    ctx.lineTo(size * 0.15, -size * 0.1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // --- Draw Animated Wings ---
    const flapSpeed = Date.now() / 80;
    
    // Back Wing
    ctx.save();
    const wingAngleBack = Math.sin(flapSpeed) * 0.8;
    ctx.translate(-size * 0.1, -size * 0.1);
    ctx.rotate(wingAngleBack);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-size * 0.4, -size * 0.6, -size * 0.9, -size * 0.1);
    ctx.quadraticCurveTo(-size * 0.4, size * 0.3, 0, 0);
    ctx.fill();
    ctx.restore();

    // Front Wing
    ctx.save();
    const wingAngleFront = Math.sin(flapSpeed + 0.5) * 1.1;
    ctx.translate(-size * 0.05, -size * 0.05);
    ctx.rotate(wingAngleFront);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-size * 0.45, -size * 0.75, -size * 1.0, -size * 0.2);
    ctx.quadraticCurveTo(-size * 0.5, size * 0.4, 0, 0);
    ctx.fill();
    // Feather details
    ctx.strokeStyle = shadowColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.3, -size * 0.2);
    ctx.lineTo(-size * 0.6, -size * 0.4);
    ctx.moveTo(-size * 0.35, -size * 0.1);
    ctx.lineTo(-size * 0.65, -size * 0.3);
    ctx.stroke();
    ctx.restore();
    
    // Particles (Magic Dust)
    if (vy < 0) {
      const colors = ['#ffffff', '#ff69b4', '#ffd700', '#00ffff'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        const px = -size * 0.5 - Math.random() * 30;
        const py = Math.random() * 30 - 15;
        ctx.arc(px, py, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
        // Add a small glow to magic particles
        ctx.shadowBlur = 10;
        ctx.shadowColor = colors[i];
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    ctx.restore();
  };

  const drawPipe = (ctx: CanvasRenderingContext2D, pipe: Pipe) => {
    const drawRainbow3DPipe = (x: number, y: number, w: number, h: number, isTop: boolean) => {
      ctx.save();
      
      // Main pipe cylinder with rainbow gradient
      const grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#ef4444'); // Red
      grad.addColorStop(0.2, '#f97316'); // Orange
      grad.addColorStop(0.4, '#eab308'); // Yellow
      grad.addColorStop(0.6, '#22c55e'); // Green
      grad.addColorStop(0.8, '#3b82f6'); // Blue
      grad.addColorStop(1, '#a855f7'); // Purple
      
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      
      // 3D Rim/Edge highlight for cylinder
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);

      // 3D Lip/Cap
      const capHeight = 30;
      const capWidth = w + 12;
      const capX = x - 6;
      const capY = isTop ? y + h - capHeight : y;
      
      // Cap also rainbow
      const capGrad = ctx.createLinearGradient(capX, 0, capX + capWidth, 0);
      capGrad.addColorStop(0, '#ef4444');
      capGrad.addColorStop(0.5, '#ffffff'); // Center shine
      capGrad.addColorStop(1, '#a855f7');
      
      ctx.fillStyle = capGrad;
      ctx.fillRect(capX, capY, capWidth, capHeight);
      
      // Secondary highlight on the lip
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(capX, capY, capWidth, capHeight);

      ctx.restore();
    };

    // Top Pipe
    drawRainbow3DPipe(pipe.x, 0, PIPE_WIDTH, pipe.topHeight, true);
    
    // Bottom Pipe
    const bottomY = pipe.topHeight + PIPE_GAP;
    drawRainbow3DPipe(pipe.x, bottomY, PIPE_WIDTH, CANVAS_HEIGHT - bottomY, false);
  };

  const update = useCallback(() => {
    if (gameState !== 'PLAYING') return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    frameCountRef.current++;

    // 1. Update Unicorn
    unicornRef.current.vy += GRAVITY;
    unicornRef.current.y += unicornRef.current.vy;

    // 2. Spawn Pipes
    if (frameCountRef.current % PIPE_SPAWN_INTERVAL === 0) {
      const minHeight = 50;
      const maxHeight = CANVAS_HEIGHT - PIPE_GAP - minHeight;
      const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1) + minHeight);
      pipesRef.current.push({
        x: CANVAS_WIDTH,
        topHeight,
        passed: false,
        id: ++lastPipeIdRef.current
      });
    }

    // 3. Update Pipes & Collision
    pipesRef.current = pipesRef.current.filter(p => p.x + PIPE_WIDTH > -100);
    for (const pipe of pipesRef.current) {
      pipe.x -= PIPE_SPEED;

      // Score
      if (!pipe.passed && pipe.x < 50) {
        pipe.passed = true;
        setScore(s => s + 1);
        playSound(scoreSound);
      }

      // Collision Detection
      const unicornLeft = 50 + COLLISION_SLOP;
      const unicornRight = 50 + UNICORN_SIZE - COLLISION_SLOP;
      const unicornTop = unicornRef.current.y + COLLISION_SLOP;
      const unicornBottom = unicornRef.current.y + UNICORN_SIZE - COLLISION_SLOP;

      if (
        unicornRight > pipe.x &&
        unicornLeft < pipe.x + PIPE_WIDTH &&
        (unicornTop < pipe.topHeight || unicornBottom > pipe.topHeight + PIPE_GAP)
      ) {
        gameOver();
        return;
      }
    }

    // Ground/Ceiling collision
    if (unicornRef.current.y < 0 || unicornRef.current.y + UNICORN_SIZE > CANVAS_HEIGHT) {
      gameOver();
      return;
    }

    // 4. Render
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Background (Deep Space effect)
    const bgGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 0,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_HEIGHT
    );
    bgGrad.addColorStop(0, '#1e1b4b');
    bgGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Score Shadow (Background massive typography)
    ctx.font = 'black 300px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(score.toString(), CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    // Draw Stars
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    const seed = 123;
    for (let i = 0; i < 20; i++) {
        const sx = (Math.sin(seed + i) * 10000) % CANVAS_WIDTH;
        const sy = (Math.cos(seed + i) * 10000) % CANVAS_HEIGHT;
        ctx.beginPath();
        ctx.arc(sx < 0 ? sx + CANVAS_WIDTH : sx, sy < 0 ? sy + CANVAS_HEIGHT : sy, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Ground Rainbow
    const groundHeight = 10;
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
    const segmentWidth = CANVAS_WIDTH / colors.length;
    colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(i * segmentWidth, CANVAS_HEIGHT - groundHeight, segmentWidth, groundHeight);
    });

    pipesRef.current.forEach(p => drawPipe(ctx, p));
    drawUnicorn(ctx, unicornRef.current.y, unicornRef.current.vy);

    gameLoopRef.current = requestAnimationFrame(update);
  }, [gameState, gameOver, score]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      gameLoopRef.current = requestAnimationFrame(update);
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [gameState, update]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] p-4 font-sans text-white selection:bg-indigo-500/30 overflow-hidden">
      <div className="relative w-full max-w-[400px] aspect-[2/3] bg-slate-900 rounded-[2rem] shadow-[0_0_80px_rgba(30,27,75,0.5)] overflow-hidden border-8 border-white/10">
        
        {/* Game Canvas */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={flap}
          className="w-full h-full cursor-pointer touch-none"
        />

        {/* HUD Overlay */}
        {gameState === 'PLAYING' && (
          <div className="absolute top-12 left-0 w-full flex flex-col items-center pointer-events-none">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex flex-col items-center"
            >
              <span className="text-8xl font-black italic tracking-tighter leading-none mb-2">
                {score}
              </span>
              <div className="flex gap-4 text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">
                <span>BEST: {highScore}</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Screens Overlay */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#0f172a]/60 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <span className="text-[25rem] font-black opacity-5 tracking-tighter rotate-[-10deg]">U</span>
              </div>

              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="relative z-10 mb-12"
              >
                 <h1 className="text-6xl font-black italic tracking-tighter leading-[0.8] mb-4">
                  UNICORN <br/>
                  <span className="text-transparent text-stroke">DASH</span>
                </h1>
                
                <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-[0.4em] opacity-40 mb-8">
                  <span>SCORE: {score}</span>
                  <span>BEST: {highScore}</span>
                </div>
              </motion.div>

              <button
                onClick={startGame}
                className="group relative z-10 flex items-center gap-4 bg-white text-[#0f172a] px-10 py-5 rounded-full font-black text-xl shadow-[0_0_30px_rgba(255,255,255,0.2)] transition-all hover:scale-110 active:scale-95"
              >
                <Play className="fill-current w-6 h-6" />
                START DASH
              </button>

              <div className="absolute bottom-12 left-0 right-0 flex justify-center opacity-40">
                <p className="text-[10px] font-black uppercase tracking-[0.5em] italic">
                  Space or Tap to Flap
                </p>
              </div>
            </motion.div>
          )}

          {gameState === 'GAME_OVER' && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(12px)' }}
              className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-10 text-center"
            >
              <motion.h2 
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-7xl font-black italic tracking-tighter text-white mb-2"
              >
                CRASH <br/>
                <span className="text-transparent text-stroke opacity-30">LANDING</span>
              </motion.h2>
              
              <div className="w-full h-px bg-white/10 my-8" />

              <div className="grid grid-cols-1 gap-6 w-full mb-10">
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Final Score</span>
                  <span className="text-5xl font-black italic italic tracking-tighter">{score}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Personal Best</span>
                  <span className="text-5xl font-black italic italic tracking-tighter text-pink-400">{highScore}</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 w-full">
                <button
                  onClick={startGame}
                  className="flex items-center justify-center gap-3 bg-pink-500 hover:bg-pink-600 text-white px-8 py-5 rounded-2xl font-black text-xl shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  <RotateCcw size={24} />
                  RETRY
                </button>
                
                <button
                  onClick={() => setGameState('START')}
                  className="text-white/40 font-black uppercase tracking-[0.3em] text-xs hover:text-white transition-colors py-2"
                >
                  Return to Menu
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Meta */}
      <div className="mt-12 flex flex-col items-center gap-4">
        <div className="px-8 py-3 border-2 border-white/10 rounded-full bg-white/5 backdrop-blur-md">
          <p className="text-xs font-bold tracking-[0.3em] uppercase italic opacity-60">
            Rainbow <span className="text-white">Unicorn</span> Dash v1.0
          </p>
        </div>
        <div className="flex gap-8 opacity-20">
            <Zap size={16} />
            <Trophy size={16} />
        </div>
      </div>
    </div>
  );
}
