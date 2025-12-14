import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { GameState, GestureType, VisionState, Player, Obstacle } from '../types';
import { initializeVision, processVideoFrame } from '../services/vision';
import { generateGameOverMessage } from '../services/gemini';
import { Play, RotateCcw, Hand, Zap, Skull, Trophy } from 'lucide-react';

// Game Constants
const GRAVITY = 0.6;
const JUMP_FORCE = -12; // Negative Y is up
const GROUND_Y = 350;
const DUCK_HEIGHT = 30;
const NORMAL_HEIGHT = 60;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const BASE_SPEED = 6;
const TURBO_SPEED_MULTIPLIER = 1.8;

const RunnerGame: React.FC = () => {
  // Refs for game state (mutable for performance in loop)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const webcamRef = useRef<Webcam>(null);
  
  // React state for UI
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [score, setScore] = useState(0);
  const [visionState, setVisionState] = useState<VisionState>({
    handCount: 0,
    gesture: GestureType.NONE,
    isTurbo: false,
  });
  const [aiMessage, setAiMessage] = useState<string>("");
  const [isLoadingVision, setIsLoadingVision] = useState(true);

  // Game Logic State (Non-React)
  const gameRef = useRef({
    player: {
      x: 50,
      y: GROUND_Y - NORMAL_HEIGHT,
      width: 40,
      height: NORMAL_HEIGHT,
      color: '#00ffcc',
      vy: 0,
      isJumping: false,
      isDucking: false,
    } as Player,
    obstacles: [] as Obstacle[],
    frameCount: 0,
    currentSpeed: BASE_SPEED,
    score: 0,
  });

  // Initialize Vision
  useEffect(() => {
    const setup = async () => {
      try {
        await initializeVision();
        setIsLoadingVision(false);
      } catch (e) {
        console.error("Vision setup failed:", e);
      }
    };
    setup();
  }, []);

  // Spawn Obstacles
  const spawnObstacle = (currentSpeed: number) => {
    const { obstacles } = gameRef.current;
    // Min distance between obstacles based on speed
    const minGap = 250 + (currentSpeed * 10); 
    const lastObstacle = obstacles[obstacles.length - 1];

    if (!lastObstacle || (CANVAS_WIDTH - lastObstacle.x > minGap)) {
      if (Math.random() < 0.02) {
        const type = Math.random() > 0.6 ? 'BIRD' : 'CACTUS';
        obstacles.push({
          x: CANVAS_WIDTH,
          y: type === 'BIRD' ? GROUND_Y - 90 : GROUND_Y - 40, // Birds fly high, Cactus on ground
          width: type === 'BIRD' ? 40 : 30,
          height: type === 'BIRD' ? 30 : 40,
          color: type === 'BIRD' ? '#ff4444' : '#ffaa00',
          type,
        });
      }
    }
  };

  const handleGameOver = async (finalScore: number) => {
    setGameState(GameState.GAME_OVER);
    const msg = await generateGameOverMessage(finalScore);
    setAiMessage(msg);
  };

  const resetGame = () => {
    gameRef.current = {
      player: {
        x: 50,
        y: GROUND_Y - NORMAL_HEIGHT,
        width: 40,
        height: NORMAL_HEIGHT,
        color: '#00ffcc',
        vy: 0,
        isJumping: false,
        isDucking: false,
      },
      obstacles: [],
      frameCount: 0,
      currentSpeed: BASE_SPEED,
      score: 0,
    };
    setScore(0);
    setAiMessage("");
    setGameState(GameState.PLAYING);
  };

  // Main Game Loop
  const tick = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // 1. Process Vision
    if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4) {
      const vState = processVideoFrame(webcamRef.current.video);
      setVisionState(vState); // Sync to React for UI indicators

      // Handle Inputs based on Game State
      if (gameState === GameState.START) {
          if (vState.gesture === GestureType.OPEN_PALM) {
              setGameState(GameState.PLAYING);
          }
      } else if (gameState === GameState.GAME_OVER) {
          if (vState.gesture === GestureType.THUMBS_UP) {
              resetGame();
          }
      } else if (gameState === GameState.PLAYING) {
        // Player Control
        const p = gameRef.current.player;

        // Jump
        if (vState.gesture === GestureType.OPEN_PALM && !p.isJumping) {
          p.vy = JUMP_FORCE;
          p.isJumping = true;
          p.isDucking = false;
        }

        // Duck
        if (vState.gesture === GestureType.CLOSED_FIST) {
          p.isDucking = true;
          p.height = DUCK_HEIGHT;
          p.y = GROUND_Y - DUCK_HEIGHT;
          // Fast fall if in air
          if (p.isJumping) {
            p.vy += 2;
          }
        } else {
            // Stand up if not ducking
            // Removed redundant check for gesture !== CLOSED_FIST as we are in the else block of gesture === CLOSED_FIST
           if (p.isDucking) {
               p.isDucking = false;
               p.height = NORMAL_HEIGHT;
               p.y = GROUND_Y - NORMAL_HEIGHT;
           }
        }

        // Turbo Speed
        gameRef.current.currentSpeed = vState.isTurbo 
            ? BASE_SPEED * TURBO_SPEED_MULTIPLIER 
            : BASE_SPEED;
      }
    }

    if (gameState !== GameState.PLAYING) {
      // Just draw the static scene or start screen logic if needed
      // But we still want to clear/draw background
      drawScene(ctx, true);
      requestRef.current = requestAnimationFrame(tick);
      return;
    }

    // 2. Update Physics
    const game = gameRef.current;
    const p = game.player;

    // Gravity
    if (p.y < GROUND_Y - p.height || p.vy < 0) {
       p.y += p.vy;
       p.vy += GRAVITY;
       p.isJumping = true;
    } else {
       p.vy = 0;
       p.isJumping = false;
       p.y = GROUND_Y - p.height;
    }

    // Obstacles
    spawnObstacle(game.currentSpeed);
    
    // Move & Collision
    for (let i = game.obstacles.length - 1; i >= 0; i--) {
      const obs = game.obstacles[i];
      obs.x -= game.currentSpeed;

      // Remove off-screen
      if (obs.x + obs.width < 0) {
        game.obstacles.splice(i, 1);
        game.score += 10;
        setScore(game.score); // Sync score
      }

      // Collision AABB
      if (
        p.x < obs.x + obs.width &&
        p.x + p.width > obs.x &&
        p.y < obs.y + obs.height &&
        p.y + p.height > obs.y
      ) {
        handleGameOver(game.score);
      }
    }

    // Progression
    game.frameCount++;
    if (game.frameCount % 600 === 0) {
       // Increase base speed slightly every ~10 seconds
       // Note: this is added to current logic next frame
    }

    drawScene(ctx, false);
    
    requestRef.current = requestAnimationFrame(tick);
  }, [gameState]);

  // Drawing Logic
  const drawScene = (ctx: CanvasRenderingContext2D, isPaused: boolean) => {
    const game = gameRef.current;
    
    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Turbo Effect Background
    if (visionState.isTurbo && !isPaused) {
        ctx.fillStyle = 'rgba(0, 255, 204, 0.05)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // Speed lines
        ctx.strokeStyle = 'rgba(0, 255, 204, 0.2)';
        ctx.lineWidth = 2;
        for(let i=0; i<5; i++) {
            const y = Math.random() * CANVAS_HEIGHT;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CANVAS_WIDTH, y);
            ctx.stroke();
        }
    }

    // Ground
    ctx.fillStyle = '#444';
    ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

    // Obstacles
    game.obstacles.forEach(obs => {
      ctx.fillStyle = obs.color;
      ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    });

    // Player (Human Figure)
    const p = game.player;
    const frame = game.frameCount;
    
    ctx.strokeStyle = p.color;
    ctx.fillStyle = p.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Add glow for hero
    ctx.shadowBlur = 15;
    ctx.shadowColor = p.color;

    const cx = p.x + p.width / 2;
    const isRunning = !p.isJumping && !p.isDucking && !isPaused;
    const animSpeed = 0.3;

    if (p.isDucking) {
        // Ducking Pose (Slide) - Streamlined horizontal pose
        // Head (Lower and forward)
        ctx.beginPath();
        ctx.arc(p.x + p.width - 12, p.y + 12, 7, 0, Math.PI * 2);
        ctx.fill();
        
        // Body (Horizontal)
        ctx.beginPath();
        ctx.moveTo(p.x + p.width - 12, p.y + 15); // Neck
        ctx.lineTo(p.x + 10, p.y + 20); // Hips
        ctx.stroke();

        // Legs (Trailing behind)
        ctx.beginPath();
        ctx.moveTo(p.x + 10, p.y + 20);
        ctx.lineTo(p.x, p.y + 15);
        ctx.stroke();

         // Arms (Forward for balance)
        ctx.beginPath();
        ctx.moveTo(p.x + 20, p.y + 18);
        ctx.lineTo(p.x + 32, p.y + 25);
        ctx.stroke();

    } else {
        // Upright Pose (Run/Jump)
        
        // Head
        ctx.beginPath();
        ctx.arc(cx, p.y + 9, 8, 0, Math.PI * 2);
        ctx.fill();

        // Torso
        ctx.beginPath();
        ctx.moveTo(cx, p.y + 16);
        ctx.lineTo(cx, p.y + 36);
        ctx.stroke();

        // Limbs Animation
        // Use Sin/Cos for rhythmic running
        const limbSwing = isRunning ? Math.sin(frame * animSpeed) * 12 : 0; 
        
        // Legs
        const hipY = p.y + 36;
        const footBaseY = p.y + 58; // Near bottom of bounding box
        
        if (p.isJumping) {
            // Jump Pose: Legs tucked up slightly
            ctx.beginPath();
            ctx.moveTo(cx, hipY);
            ctx.lineTo(cx - 8, hipY + 10);
            ctx.lineTo(cx - 2, hipY + 18);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx, hipY);
            ctx.lineTo(cx + 12, hipY + 8);
            ctx.lineTo(cx + 8, hipY + 20);
            ctx.stroke();
        } else {
            // Run Pose
            // Left Leg
            ctx.beginPath();
            ctx.moveTo(cx, hipY);
            ctx.lineTo(cx - limbSwing, footBaseY);
            ctx.stroke();
            
            // Right Leg
            ctx.beginPath();
            ctx.moveTo(cx, hipY);
            ctx.lineTo(cx + limbSwing, footBaseY);
            ctx.stroke();
        }

        // Arms (Shoulder at y+18)
        const shoulderY = p.y + 18;
        if (p.isJumping) {
            // Arms flung back/up
            ctx.beginPath();
            ctx.moveTo(cx, shoulderY);
            ctx.lineTo(cx - 14, shoulderY - 8);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx, shoulderY);
            ctx.lineTo(cx + 14, shoulderY - 8);
            ctx.stroke();
        } else {
             // Run Pose (Arms swing opposite to legs)
            ctx.beginPath();
            ctx.moveTo(cx, shoulderY);
            ctx.lineTo(cx + limbSwing, shoulderY + 14); 
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(cx, shoulderY);
            ctx.lineTo(cx - limbSwing, shoulderY + 14);
            ctx.stroke();
        }
    }
    
    // Reset Glow
    ctx.shadowBlur = 0;
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(tick);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [tick]);

  return (
    <div className="relative w-full max-w-4xl mx-auto p-4 flex flex-col items-center justify-center min-h-screen">
      
      {/* HUD Header */}
      <div className="w-full flex justify-between items-center mb-4 bg-gray-900/80 p-4 rounded-xl border border-gray-700 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
            GESTURE DASH
          </h1>
          <div className="flex gap-2">
            <span className={`px-2 py-1 rounded text-xs font-bold ${visionState.handCount > 0 ? 'bg-green-500 text-black' : 'bg-red-500/20 text-red-400'}`}>
              {visionState.handCount} HANDS
            </span>
            {visionState.isTurbo && (
               <span className="px-2 py-1 rounded text-xs font-bold bg-yellow-400 text-black animate-pulse flex items-center gap-1">
                 <Zap size={12} /> TURBO
               </span>
            )}
          </div>
        </div>
        <div className="text-3xl font-mono font-bold text-white">
          {score.toString().padStart(5, '0')}
        </div>
      </div>

      {/* Game Container */}
      <div className="relative border-4 border-gray-700 rounded-lg overflow-hidden shadow-2xl bg-black">
        
        {/* The Game Canvas */}
        <canvas 
          ref={canvasRef} 
          width={CANVAS_WIDTH} 
          height={CANVAS_HEIGHT} 
          className="block w-full h-auto"
        />

        {/* Start Screen Overlay */}
        {gameState === GameState.START && (
           <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white backdrop-blur-sm">
              <div className="mb-6 animate-bounce">
                  <Hand size={64} className="text-blue-400" />
              </div>
              <h2 className="text-4xl font-bold mb-4">Ready to Run?</h2>
              <div className="flex flex-col gap-2 text-center text-gray-300">
                <p><span className="text-yellow-400 font-bold">Open Palm 🖐️</span> to Start & Jump</p>
                <p><span className="text-red-400 font-bold">Closed Fist ✊</span> to Duck</p>
                <p><span className="text-green-400 font-bold">2 Hands 👐</span> for Turbo Boost</p>
              </div>
              {isLoadingVision && <p className="mt-8 text-blue-400 animate-pulse">Initializing Vision AI...</p>}
           </div>
        )}

        {/* Game Over Overlay */}
        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 text-white backdrop-blur-md p-8 text-center">
             <Skull size={64} className="text-red-300 mb-4" />
             <h2 className="text-5xl font-black mb-2">GAME OVER</h2>
             <p className="text-3xl font-mono mb-6 text-yellow-300">Score: {score}</p>
             
             {/* Gemini AI Commentary */}
             <div className="mb-8 p-4 bg-black/40 rounded-lg max-w-lg border border-white/10">
                <p className="text-lg italic text-gray-200">
                  {aiMessage || <span className="animate-pulse">Asking AI what it thinks of your run...</span>}
                </p>
             </div>

             <div className="flex items-center gap-2 text-xl font-bold animate-pulse">
                <span className="text-green-400">Thumbs Up 👍</span> to Restart
             </div>
          </div>
        )}

        {/* Webcam Preview (Small PiP) */}
        <div className="absolute bottom-4 right-4 w-32 h-24 border-2 border-gray-600 rounded overflow-hidden bg-black shadow-lg opacity-80 hover:opacity-100 transition-opacity">
           <Webcam
             ref={webcamRef}
             width={128}
             height={96}
             mirrored
             screenshotFormat="image/jpeg"
             videoConstraints={{ width: 320, height: 240, facingMode: "user" }}
             className="w-full h-full object-cover"
           />
           {/* Gesture Debug Text */}
           <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white text-center py-1 truncate">
              {visionState.gesture}
           </div>
        </div>
      </div>

      {/* Controls Legend */}
      <div className="mt-6 grid grid-cols-3 gap-4 w-full text-white/60 text-sm">
         <div className="flex items-center justify-center gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">🖐️</div>
            <span>Jump</span>
         </div>
         <div className="flex items-center justify-center gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">✊</div>
            <span>Duck</span>
         </div>
         <div className="flex items-center justify-center gap-2 p-3 bg-white/5 rounded-lg border border-white/5">
            <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">👐</div>
            <span>Turbo</span>
         </div>
      </div>
    </div>
  );
};

export default RunnerGame;