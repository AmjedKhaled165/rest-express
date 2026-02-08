import { useRef, useEffect, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  playMoveSound,
  playRotateSound,
  playDropSound,
  playLandSound,
  playLineClearSound,
  playLevelUpSound,
  playGameOverSound,
  playStartSound,
  startBackgroundMusic,
  stopBackgroundMusic,
} from "@/lib/sounds";

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 48;

const SHAPES = [
  { shape: [[1, 1, 1, 1]], color: "#00f5ff" },
  { shape: [[1, 1], [1, 1]], color: "#ffd700" },
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#a855f7" },
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#ff6b2c" },
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#3b82f6" },
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#22c55e" },
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#ef4444" },
];

interface Piece {
  shape: number[][];
  color: string;
  x: number;
  y: number;
}

interface GameState {
  board: number[][];
  boardColors: (string | null)[][];
  piece: Piece;
  nextPiece: Piece;
  score: number;
  lines: number;
  level: number;
  isRunning: boolean;
  isPaused: boolean;
  isGameOver: boolean;
}

function createEmptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createEmptyColorBoard(): (string | null)[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomPiece(): Piece {
  const { shape, color } = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return {
    shape: shape.map((row) => [...row]),
    color,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0,
  };
}

export default function TetrisGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const dropIntervalRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameState>({
    board: createEmptyBoard(),
    boardColors: createEmptyColorBoard(),
    piece: randomPiece(),
    nextPiece: randomPiece(),
    score: 0,
    lines: 0,
    level: 1,
    isRunning: false,
    isPaused: false,
    isGameOver: false,
  });

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [nextPiece, setNextPiece] = useState<Piece>(gameStateRef.current.nextPiece);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('tetris-highscore');
    return saved ? parseInt(saved) : 0;
  });
  const [hatchOpen, setHatchOpen] = useState(false);
  const hatchTimeoutRef = useRef<number | null>(null);

  const collide = useCallback((piece: Piece, board: number[][]): boolean => {
    return piece.shape.some((row, dy) =>
      row.some((value, dx) => {
        if (!value) return false;
        const newX = piece.x + dx;
        const newY = piece.y + dy;
        return (
          newX < 0 ||
          newX >= COLS ||
          newY >= ROWS ||
          (newY >= 0 && board[newY]?.[newX] !== 0)
        );
      })
    );
  }, []);

  const merge = useCallback((piece: Piece, board: number[][], boardColors: (string | null)[][]) => {
    piece.shape.forEach((row, dy) => {
      row.forEach((value, dx) => {
        if (value && piece.y + dy >= 0) {
          board[piece.y + dy][piece.x + dx] = 1;
          boardColors[piece.y + dy][piece.x + dx] = piece.color;
        }
      });
    });
  }, []);

  const clearLines = useCallback((board: number[][], boardColors: (string | null)[][]) => {
    let linesCleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every((cell) => cell !== 0)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        boardColors.splice(y, 1);
        boardColors.unshift(Array(COLS).fill(null));
        linesCleared++;
        y++;
      }
    }
    return linesCleared;
  }, []);

  const draw3DBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, blockSize: number = BLOCK_SIZE) => {
    const px = x * blockSize;
    const py = y * blockSize;
    const depth = 4;
    const innerPad = 2;

    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    
    ctx.fillStyle = color;
    ctx.fillRect(px + innerPad, py + innerPad, blockSize - innerPad * 2, blockSize - innerPad * 2);
    
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(px + innerPad, py + innerPad, blockSize - innerPad * 2, depth);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(px + innerPad, py + innerPad, depth, blockSize - innerPad * 2);
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(px + innerPad, py + blockSize - innerPad - depth, blockSize - innerPad * 2, depth);
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(px + blockSize - innerPad - depth, py + innerPad, depth, blockSize - innerPad * 2);
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(px + innerPad + depth, py + innerPad + depth, blockSize - innerPad * 2 - depth * 2, blockSize - innerPad * 2 - depth * 2);
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + innerPad, py + innerPad, blockSize - innerPad * 2, blockSize - innerPad * 2);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const state = gameStateRef.current;
    const { board, boardColors, piece } = state;

    // Dark background
    ctx.fillStyle = "#050508";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw red dot grid pattern
    const dotSpacing = 14;
    const dotRadius = 1.5;
    ctx.fillStyle = "#ff2c2c";
    for (let x = dotSpacing / 2; x < canvas.width; x += dotSpacing) {
      for (let y = dotSpacing / 2; y < canvas.height; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw board pieces with 3D effect
    board.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const color = boardColors[y][x] || "#ff2c2c";
          draw3DBlock(ctx, x, y, color);
        }
      });
    });

    if (!state.isGameOver) {
      // Ghost piece
      let ghostY = piece.y;
      while (!collide({ ...piece, y: ghostY + 1 }, board)) {
        ghostY++;
      }
      piece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
          if (value && ghostY + dy >= 0) {
            const px = (piece.x + dx) * BLOCK_SIZE;
            const py = (ghostY + dy) * BLOCK_SIZE;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 3, py + 3, BLOCK_SIZE - 6, BLOCK_SIZE - 6);
          }
        });
      });

      // Current piece
      piece.shape.forEach((row, dy) => {
        row.forEach((value, dx) => {
          if (value && piece.y + dy >= 0) {
            draw3DBlock(ctx, piece.x + dx, piece.y + dy, piece.color);
          }
        });
      });
    }

    if (state.isGameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.shadowColor = "#ff2c2c";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#ff2c2c";
      ctx.font = "bold 32px 'Space Grotesk', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 20);
      
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "18px 'Space Grotesk', sans-serif";
      ctx.fillText(`Score: ${state.score}`, canvas.width / 2, canvas.height / 2 + 20);
      ctx.font = "14px 'Space Grotesk', sans-serif";
      ctx.fillStyle = "#888";
      ctx.fillText("Press START to play again", canvas.width / 2, canvas.height / 2 + 50);
    }
  }, [collide]);

  const drop = useCallback(() => {
    const state = gameStateRef.current;
    if (state.isPaused || state.isGameOver) return;

    const newPiece = { ...state.piece, y: state.piece.y + 1 };
    if (collide(newPiece, state.board)) {
      if (state.piece.y <= 0) {
        state.isGameOver = true;
        setIsGameOver(true);
        playGameOverSound();
        stopBackgroundMusic();
        
        if (state.score > highScore) {
          setHighScore(state.score);
          localStorage.setItem('tetris-highscore', state.score.toString());
        }
        
        if (dropIntervalRef.current) {
          clearInterval(dropIntervalRef.current);
          dropIntervalRef.current = null;
        }
        draw();
        return;
      }
      playLandSound();
      merge(state.piece, state.board, state.boardColors);
      const linesCleared = clearLines(state.board, state.boardColors);
      const prevLevel = state.level;
      if (linesCleared > 0) {
        const linePoints = [0, 100, 300, 500, 800];
        state.score += linePoints[linesCleared] * state.level;
        state.lines += linesCleared;
        state.level = Math.floor(state.lines / 10) + 1;
        setScore(state.score);
        setLines(state.lines);
        setLevel(state.level);
        playLineClearSound(linesCleared);
        
        if (state.level > prevLevel) {
          setTimeout(() => playLevelUpSound(), 400);
        }

        if (dropIntervalRef.current) {
          clearInterval(dropIntervalRef.current);
          const speed = Math.max(100, 700 - (state.level - 1) * 50);
          dropIntervalRef.current = window.setInterval(drop, speed);
        }
      }
      state.piece = state.nextPiece;
      state.nextPiece = randomPiece();
      setNextPiece(state.nextPiece);
      
      // Trigger hatch animation
      if (hatchTimeoutRef.current) clearTimeout(hatchTimeoutRef.current);
      setHatchOpen(true);
      hatchTimeoutRef.current = window.setTimeout(() => setHatchOpen(false), 400);
    } else {
      state.piece = newPiece;
    }
    draw();
  }, [collide, merge, clearLines, draw, highScore]);

  const move = useCallback(
    (dir: number) => {
      const state = gameStateRef.current;
      if (!state.isRunning || state.isPaused || state.isGameOver) return;
      const newPiece = { ...state.piece, x: state.piece.x + dir };
      if (!collide(newPiece, state.board)) {
        state.piece = newPiece;
        playMoveSound();
        draw();
      }
    },
    [collide, draw]
  );

  const rotate = useCallback(() => {
    const state = gameStateRef.current;
    if (!state.isRunning || state.isPaused || state.isGameOver) return;
    const rotated = state.piece.shape[0].map((_, i) =>
      state.piece.shape.map((row) => row[i]).reverse()
    );
    const newPiece = { ...state.piece, shape: rotated };

    let rotated_successfully = false;
    if (!collide(newPiece, state.board)) {
      state.piece = newPiece;
      rotated_successfully = true;
    } else {
      for (const offset of [-1, 1, -2, 2]) {
        const kicked = { ...newPiece, x: newPiece.x + offset };
        if (!collide(kicked, state.board)) {
          state.piece = kicked;
          rotated_successfully = true;
          break;
        }
      }
    }
    if (rotated_successfully) {
      playRotateSound();
    }
    draw();
  }, [collide, draw]);

  const hardDrop = useCallback(() => {
    const state = gameStateRef.current;
    if (!state.isRunning || state.isPaused || state.isGameOver) return;
    playDropSound();
    while (!collide({ ...state.piece, y: state.piece.y + 1 }, state.board)) {
      state.piece.y++;
      state.score += 2;
    }
    setScore(state.score);
    drop();
  }, [collide, drop]);

  const startGame = useCallback(() => {
    const state = gameStateRef.current;
    if (state.isGameOver || !state.isRunning) {
      state.board = createEmptyBoard();
      state.boardColors = createEmptyColorBoard();
      state.piece = randomPiece();
      state.nextPiece = randomPiece();
      state.score = 0;
      state.lines = 0;
      state.level = 1;
      state.isGameOver = false;
      state.isPaused = false;
      setScore(0);
      setLines(0);
      setLevel(1);
      setIsGameOver(false);
      setIsPaused(false);
      setNextPiece(state.nextPiece);
      
      // Trigger hatch animation on game start
      if (hatchTimeoutRef.current) clearTimeout(hatchTimeoutRef.current);
      setHatchOpen(true);
      hatchTimeoutRef.current = window.setTimeout(() => setHatchOpen(false), 400);
    }

    state.isRunning = true;
    state.isPaused = false;
    setIsRunning(true);
    setIsPaused(false);
    playStartSound();
    startBackgroundMusic();

    if (dropIntervalRef.current) {
      clearInterval(dropIntervalRef.current);
    }
    const speed = Math.max(100, 700 - (state.level - 1) * 50);
    dropIntervalRef.current = window.setInterval(drop, speed);
    draw();
  }, [drop, draw]);

  const pauseGame = useCallback(() => {
    const state = gameStateRef.current;
    if (!state.isRunning || state.isGameOver) return;

    state.isPaused = !state.isPaused;
    setIsPaused(state.isPaused);

    if (state.isPaused) {
      stopBackgroundMusic();
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current);
        dropIntervalRef.current = null;
      }
    } else {
      startBackgroundMusic();
      const speed = Math.max(100, 700 - (state.level - 1) * 50);
      dropIntervalRef.current = window.setInterval(drop, speed);
    }
  }, [drop]);

  const restartGame = useCallback(() => {
    const state = gameStateRef.current;
    state.board = createEmptyBoard();
    state.boardColors = createEmptyColorBoard();
    state.piece = randomPiece();
    state.nextPiece = randomPiece();
    state.score = 0;
    state.lines = 0;
    state.level = 1;
    state.isGameOver = false;
    state.isPaused = false;
    state.isRunning = true;
    setScore(0);
    setLines(0);
    setLevel(1);
    setIsGameOver(false);
    setIsPaused(false);
    setIsRunning(true);
    setNextPiece(state.nextPiece);
    
    // Trigger hatch animation on restart
    if (hatchTimeoutRef.current) clearTimeout(hatchTimeoutRef.current);
    setHatchOpen(true);
    hatchTimeoutRef.current = window.setTimeout(() => setHatchOpen(false), 400);
  }, []);

  const handleAction = useCallback(
    (action: string) => {
      switch (action) {
        case "start":
          startGame();
          break;
        case "pause":
          pauseGame();
          break;
        case "restart":
          restartGame();
          break;
        case "left":
          move(-1);
          break;
        case "right":
          move(1);
          break;
        case "rotate":
          rotate();
          break;
        case "drop":
          hardDrop();
          break;
        case "softdrop":
          drop();
          break;
      }
    },
    [startGame, pauseGame, restartGame, move, rotate, hardDrop, drop]
  );

  const sendAction = useCallback(
    (action: string) => {
      socketRef.current?.emit("control", action);
      handleAction(action);
    },
    [handleAction]
  );

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.on("control", handleAction);

    // BroadcastChannel for offline controller support (same device, different tabs)
    const channel = new BroadcastChannel('madx-tetris-controls');
    channel.onmessage = (event) => {
      if (event.data?.action) {
        handleAction(event.data.action);
      }
    };

    // Broadcast game state for controller to sync
    const broadcastState = () => {
      const state = gameStateRef.current;
      channel.postMessage({
        type: 'gameState',
        isRunning: state.isRunning,
        isPaused: state.isPaused,
        isGameOver: state.isGameOver
      });
    };

    // Broadcast state periodically for offline sync
    const stateInterval = setInterval(broadcastState, 500);

    return () => {
      socket.disconnect();
      channel.close();
      clearInterval(stateInterval);
      if (dropIntervalRef.current) {
        clearInterval(dropIntervalRef.current);
      }
    };
  }, [handleAction]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.key) {
        case "ArrowLeft":
        case "a":
          sendAction("left");
          break;
        case "ArrowRight":
        case "d":
          sendAction("right");
          break;
        case "ArrowUp":
        case "w":
          sendAction("rotate");
          break;
        case "ArrowDown":
        case "s":
          sendAction("softdrop");
          break;
        case " ":
          sendAction("drop");
          break;
        case "Enter":
          sendAction("start");
          break;
        case "Escape":
        case "p":
          sendAction("pause");
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sendAction]);

  useEffect(() => {
    draw();
  }, [draw]);

  const canvasWidth = COLS * BLOCK_SIZE;
  const canvasHeight = ROWS * BLOCK_SIZE;
  const wallDepth = 60;
  const statsWidth = 160;
  
  // Fixed output resolution
  const outputWidth = 1008;
  const outputHeight = 1344;

  // Auto-fullscreen on mount
  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        }
      } catch (err) {
        console.log('Fullscreen request failed or was blocked:', err);
      }
    };
    
    // Small delay to ensure DOM is ready
    const timer = setTimeout(enterFullscreen, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div 
      className="bg-[#050510] flex items-center justify-center overflow-hidden"
      style={{
        width: outputWidth + 'px',
        height: outputHeight + 'px',
        margin: '0 auto',
      }}
    >
      <div className="relative">
        {/* Next piece display ABOVE the hatch */}
        <div 
          className="absolute -top-32 left-1/2 transform -translate-x-1/2 z-20"
          style={{
            background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)',
            border: '4px solid #0066ff',
            borderRadius: '60px',
            padding: '12px 28px',
            boxShadow: '0 0 35px rgba(0, 102, 255, 0.6), inset 0 0 20px rgba(0, 0, 0, 0.5)',
            marginLeft: statsWidth / 2 + 'px',
          }}
        >
          <p 
            className="text-center text-lg font-bold tracking-widest mb-2"
            style={{ color: '#ff00ff', textShadow: '0 0 15px #ff00ff, 0 0 25px #ff00ff' }}
          >
            Next
          </p>
          <div className="flex justify-center">
            <NextPiecePreview piece={nextPiece} size={32} />
          </div>
        </div>

        {/* Main 3D Box Container */}
        <div
          className="relative"
          style={{
            background: 'linear-gradient(135deg, #1a1025 0%, #0a0a15 50%, #0a1020 100%)',
            border: '4px solid #0066ff',
            borderRadius: '12px',
            boxShadow: '0 0 60px rgba(0, 102, 255, 0.5), 0 0 120px rgba(0, 102, 255, 0.3), inset 0 0 40px rgba(0, 0, 0, 0.8)',
            padding: wallDepth + 'px',
          }}
        >
          {/* Corner decorations */}
          <div className="absolute top-3 left-3">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-b-[15px] border-b-[#ff00ff]" style={{filter: 'drop-shadow(0 0 8px #ff00ff)'}} />
          </div>
          <div className="absolute top-3 right-3">
            <div className="w-0 h-0 border-r-[15px] border-r-transparent border-b-[15px] border-b-[#ff00ff]" style={{filter: 'drop-shadow(0 0 8px #ff00ff)'}} />
          </div>
          <div className="absolute bottom-3 left-3">
            <div className="w-0 h-0 border-l-[15px] border-l-transparent border-t-[15px] border-t-[#ff00ff]" style={{filter: 'drop-shadow(0 0 8px #ff00ff)'}} />
          </div>
          <div className="absolute bottom-3 right-3">
            <div className="w-0 h-0 border-r-[15px] border-r-transparent border-t-[15px] border-t-[#ff00ff]" style={{filter: 'drop-shadow(0 0 8px #ff00ff)'}} />
          </div>

          {/* 3D Piece Housing Unit - shows depth from front view */}
          <div 
            className="absolute z-20"
            style={{
              left: wallDepth + statsWidth + (canvasWidth / 2) - 130 + 'px',
              top: -80 + 'px',
              width: '260px',
              height: wallDepth + 90 + 'px',
            }}
          >
            {/* Housing unit outer frame */}
            <div 
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 50%, #15152a 100%)',
                borderRadius: '8px 8px 0 0',
                border: '3px solid #3a3a4a',
                borderBottom: 'none',
                boxShadow: '0 10px 30px rgba(0,0,0,0.8), inset 0 5px 20px rgba(255,255,255,0.05)',
              }}
            />
            
            {/* 3D depth chamber - back wall (dark recessed area) */}
            <div 
              className="absolute"
              style={{
                left: '30px',
                right: '30px',
                top: '18px',
                bottom: '0',
                background: hatchOpen
                  ? 'linear-gradient(180deg, #000005 0%, #000815 50%, #001530 100%)'
                  : 'linear-gradient(180deg, #050510 0%, #0a0a18 50%, #0a0a15 100%)',
                boxShadow: hatchOpen
                  ? 'inset 0 0 60px rgba(0, 180, 255, 0.5), inset 0 30px 50px rgba(0, 100, 200, 0.3)'
                  : 'inset 0 0 40px rgba(0, 0, 0, 0.9), inset 0 20px 30px rgba(0, 80, 150, 0.1)',
                transition: 'all 0.25s ease-out',
              }}
            />
            
            {/* Left inner wall - shows depth */}
            <div 
              className="absolute"
              style={{
                left: '12px',
                top: '12px',
                bottom: '0',
                width: '25px',
                background: 'linear-gradient(90deg, #2a2a3a 0%, #1a1a28 60%, #0a0a15 100%)',
                transform: 'perspective(100px) rotateY(-25deg)',
                transformOrigin: 'right center',
                boxShadow: 'inset -5px 0 15px rgba(0,0,0,0.6)',
              }}
            />
            
            {/* Right inner wall - shows depth */}
            <div 
              className="absolute"
              style={{
                right: '12px',
                top: '12px',
                bottom: '0',
                width: '25px',
                background: 'linear-gradient(270deg, #2a2a3a 0%, #1a1a28 60%, #0a0a15 100%)',
                transform: 'perspective(100px) rotateY(25deg)',
                transformOrigin: 'left center',
                boxShadow: 'inset 5px 0 15px rgba(0,0,0,0.6)',
              }}
            />
            
            {/* Top inner ceiling - shows depth */}
            <div 
              className="absolute"
              style={{
                left: '30px',
                right: '30px',
                top: '6px',
                height: '18px',
                background: 'linear-gradient(180deg, #35354a 0%, #1a1a28 100%)',
                transform: 'perspective(100px) rotateX(35deg)',
                transformOrigin: 'bottom center',
                boxShadow: 'inset 0 5px 10px rgba(0,0,0,0.5)',
              }}
            />
            
            {/* Piece preview inside chamber - shows the piece about to drop */}
            <div 
              className="absolute flex items-center justify-center"
              style={{
                left: '35px',
                right: '35px',
                top: '25px',
                bottom: '8px',
                transition: 'all 0.2s ease-out',
              }}
            >
              {/* The piece in the chamber */}
              <div 
                className="relative"
                style={{
                  transform: hatchOpen ? 'translateY(30px) scale(0.9)' : 'translateY(0) scale(1)',
                  opacity: hatchOpen ? 0 : 1,
                  transition: 'all 0.2s ease-out',
                }}
              >
                {nextPiece.shape.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex justify-center">
                    {row.map((cell, cellIndex) => (
                      <div
                        key={cellIndex}
                        style={{
                          width: '20px',
                          height: '20px',
                          background: cell 
                            ? `linear-gradient(135deg, ${nextPiece.color} 0%, ${nextPiece.color}88 50%, ${nextPiece.color}44 100%)`
                            : 'transparent',
                          border: cell ? `1px solid ${nextPiece.color}` : 'none',
                          borderRadius: '2px',
                          boxShadow: cell 
                            ? `0 0 8px ${nextPiece.color}88, inset 0 1px 2px rgba(255,255,255,0.3)`
                            : 'none',
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
              
              {/* Drop trail effect when piece releases */}
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  opacity: hatchOpen ? 1 : 0,
                  transition: 'opacity 0.15s ease-out',
                }}
              >
                {/* Vertical light streaks */}
                <div 
                  style={{
                    width: '60px',
                    height: '100%',
                    background: `linear-gradient(180deg, 
                      transparent 0%, 
                      ${nextPiece.color}22 20%,
                      ${nextPiece.color}66 50%,
                      ${nextPiece.color}aa 80%,
                      ${nextPiece.color} 100%)`,
                    filter: 'blur(4px)',
                  }}
                />
              </div>
            </div>
            
            {/* Status lights on housing */}
            <div className="absolute flex gap-2" style={{ left: '15px', top: '8px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%',
                background: hatchOpen ? '#00ff88' : '#00aa55',
                boxShadow: hatchOpen ? '0 0 10px #00ff88, 0 0 20px #00ff88' : '0 0 5px #00aa55',
                transition: 'all 0.2s',
              }} />
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%',
                background: '#ff2c2c',
                boxShadow: '0 0 8px #ff2c2c',
              }} />
            </div>
            
            {/* Right side status lights */}
            <div className="absolute flex gap-2" style={{ right: '15px', top: '8px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%',
                background: '#ff2c2c',
                boxShadow: '0 0 8px #ff2c2c',
              }} />
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%',
                background: hatchOpen ? '#00ff88' : '#00aa55',
                boxShadow: hatchOpen ? '0 0 10px #00ff88, 0 0 20px #00ff88' : '0 0 5px #00aa55',
                transition: 'all 0.2s',
              }} />
            </div>
          </div>
          
          {/* Animated Sliding Hatch - underneath the housing */}
          <div 
            className="absolute z-10 overflow-hidden"
            style={{
              left: wallDepth + statsWidth + (canvasWidth / 2) - 100 + 'px',
              top: wallDepth - 8 + 'px',
              width: '200px',
              height: '28px',
            }}
          >
            {/* Hatch opening/void */}
            <div 
              className="absolute inset-0"
              style={{
                background: hatchOpen 
                  ? 'linear-gradient(180deg, #001530 0%, #000815 100%)'
                  : '#0a0a15',
                boxShadow: hatchOpen
                  ? 'inset 0 -15px 30px rgba(0, 200, 255, 0.6)'
                  : 'inset 0 -8px 15px rgba(0, 100, 180, 0.2)',
                transition: 'all 0.2s ease-out',
              }}
            />
            
            {/* Left sliding panel */}
            <div 
              className="absolute top-0 left-0 h-full"
              style={{
                width: '50%',
                background: 'linear-gradient(180deg, #3a3a4a 0%, #252535 50%, #1a1a2a 100%)',
                borderBottom: '3px solid #0a0a15',
                transform: hatchOpen ? 'translateX(-100%)' : 'translateX(0)',
                boxShadow: 'inset -10px 0 20px rgba(0,0,0,0.5)',
                transition: 'transform 0.2s ease-out',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
              </div>
            </div>
            
            {/* Right sliding panel */}
            <div 
              className="absolute top-0 right-0 h-full"
              style={{
                width: '50%',
                background: 'linear-gradient(180deg, #3a3a4a 0%, #252535 50%, #1a1a2a 100%)',
                borderBottom: '3px solid #0a0a15',
                transform: hatchOpen ? 'translateX(100%)' : 'translateX(0)',
                boxShadow: 'inset 10px 0 20px rgba(0,0,0,0.5)',
                transition: 'transform 0.2s ease-out',
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center gap-1">
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
                <div style={{ width: '2px', height: '50%', background: '#555', borderRadius: '2px' }} />
              </div>
            </div>
            
            {/* Glow beam when hatch opens - uses piece color */}
            <div 
              className="absolute -bottom-16 left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                width: hatchOpen ? '140px' : '40px',
                height: hatchOpen ? '100px' : '25px',
                background: hatchOpen 
                  ? `radial-gradient(ellipse at top, ${nextPiece.color}cc 0%, ${nextPiece.color}66 50%, transparent 80%)`
                  : `radial-gradient(ellipse at top, ${nextPiece.color}22 0%, transparent 70%)`,
                filter: 'blur(8px)',
                transition: 'all 0.2s ease-out',
              }}
            />
            
            {/* Drop trail - vertical light streak going down */}
            <div 
              className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none"
              style={{
                top: '28px',
                width: hatchOpen ? '100px' : '25px',
                height: hatchOpen ? '200px' : '0px',
                background: hatchOpen 
                  ? `linear-gradient(180deg, 
                      ${nextPiece.color} 0%, 
                      ${nextPiece.color}aa 10%,
                      ${nextPiece.color}66 30%,
                      ${nextPiece.color}33 60%,
                      transparent 100%)`
                  : 'transparent',
                filter: 'blur(6px)',
                opacity: hatchOpen ? 0.9 : 0,
                transition: 'all 0.15s ease-out',
              }}
            />
          </div>

          {/* 3D Walls with color */}
          {/* Top wall */}
          <div 
            className="absolute left-0 right-0 top-0"
            style={{
              height: wallDepth + 'px',
              background: 'linear-gradient(180deg, #2a1a35 0%, #1a1025 40%, #0a0a15 100%)',
              transform: 'perspective(300px) rotateX(-15deg)',
              transformOrigin: 'bottom center',
              boxShadow: 'inset 0 15px 30px rgba(100, 50, 150, 0.2), inset 0 -5px 15px rgba(0,0,0,0.5)',
            }}
          />
          
          {/* Bottom wall */}
          <div 
            className="absolute left-0 right-0 bottom-0"
            style={{
              height: wallDepth + 'px',
              background: 'linear-gradient(180deg, #1a1025 0%, #251535 60%, #301040 100%)',
              transform: 'perspective(300px) rotateX(12deg)',
              transformOrigin: 'top center',
              boxShadow: 'inset 0 -10px 25px rgba(100, 50, 150, 0.15), inset 0 5px 15px rgba(0,0,0,0.4)',
            }}
          />

          {/* Left wall with stats integrated */}
          <div 
            className="absolute left-0 top-0 bottom-0 flex"
            style={{
              width: wallDepth + statsWidth + 'px',
              background: 'linear-gradient(90deg, #251535 0%, #1a1025 30%, #0a0a15 100%)',
              transform: 'perspective(400px) rotateY(8deg)',
              transformOrigin: 'right center',
              boxShadow: 'inset 20px 0 40px rgba(100, 50, 150, 0.2), inset -10px 0 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* Stats panel inside the left wall - spread from top to middle */}
            <div 
              className="flex flex-col justify-start gap-6 p-4 w-full"
              style={{ height: '55%', paddingTop: '20px' }}
            >
              {/* High Score */}
              <div 
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '3px solid rgba(0, 102, 255, 0.7)',
                  boxShadow: '0 0 20px rgba(0, 102, 255, 0.4), inset 0 0 15px rgba(0, 0, 0, 0.6)',
                }}
              >
                <p 
                  className="text-center text-sm font-bold tracking-widest mb-1"
                  style={{ color: '#ff00ff', textShadow: '0 0 10px #ff00ff' }}
                >
                  HIGH SCORE
                </p>
                <p 
                  className="text-center text-2xl font-bold font-mono"
                  style={{ color: '#00ffff', textShadow: '0 0 15px #00ffff, 0 0 30px #00ffff' }}
                  data-testid="text-highscore"
                >
                  {highScore.toLocaleString()}
                </p>
              </div>

              {/* Score */}
              <div 
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '3px solid rgba(0, 102, 255, 0.7)',
                  boxShadow: '0 0 20px rgba(0, 102, 255, 0.4), inset 0 0 15px rgba(0, 0, 0, 0.6)',
                }}
              >
                <p 
                  className="text-center text-sm font-bold tracking-widest mb-1"
                  style={{ color: '#ff00ff', textShadow: '0 0 10px #ff00ff' }}
                >
                  SCORE
                </p>
                <p 
                  className="text-center text-2xl font-bold font-mono"
                  style={{ color: '#00ffff', textShadow: '0 0 15px #00ffff, 0 0 30px #00ffff' }}
                  data-testid="text-score"
                >
                  {score.toLocaleString()}
                </p>
              </div>

              {/* Level */}
              <div 
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '3px solid rgba(0, 102, 255, 0.5)',
                  boxShadow: '0 0 15px rgba(0, 102, 255, 0.3), inset 0 0 10px rgba(0, 0, 0, 0.5)',
                }}
              >
                <p 
                  className="text-center text-sm font-bold tracking-widest mb-1"
                  style={{ color: '#aaa', textShadow: '0 0 5px rgba(255,255,255,0.3)' }}
                >
                  LEVEL
                </p>
                <p 
                  className="text-center text-2xl font-bold font-mono"
                  style={{ color: '#22c55e', textShadow: '0 0 15px #22c55e, 0 0 25px #22c55e' }}
                  data-testid="text-level"
                >
                  {level}
                </p>
              </div>

              {/* Lines */}
              <div 
                className="rounded-lg p-3"
                style={{
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '3px solid rgba(0, 102, 255, 0.5)',
                  boxShadow: '0 0 15px rgba(0, 102, 255, 0.3), inset 0 0 10px rgba(0, 0, 0, 0.5)',
                }}
              >
                <p 
                  className="text-center text-sm font-bold tracking-widest mb-1"
                  style={{ color: '#aaa', textShadow: '0 0 5px rgba(255,255,255,0.3)' }}
                >
                  LINES
                </p>
                <p 
                  className="text-center text-2xl font-bold font-mono"
                  style={{ color: '#ffd700', textShadow: '0 0 15px #ffd700, 0 0 25px #ffd700' }}
                  data-testid="text-lines"
                >
                  {lines}
                </p>
              </div>
            </div>
          </div>

          {/* Right wall */}
          <div 
            className="absolute right-0 top-0 bottom-0"
            style={{
              width: wallDepth + 'px',
              background: 'linear-gradient(90deg, #0a0a15 0%, #1a1025 70%, #251535 100%)',
              transform: 'perspective(400px) rotateY(-8deg)',
              transformOrigin: 'left center',
              boxShadow: 'inset -20px 0 40px rgba(100, 50, 150, 0.2), inset 10px 0 20px rgba(0,0,0,0.5)',
            }}
          />

          {/* Game canvas container */}
          <div 
            className="relative"
            style={{ marginLeft: statsWidth + 'px' }}
          >
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="relative z-5"
              style={{
                boxShadow: 'inset 0 0 60px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 102, 255, 0.3)',
                borderRadius: '4px',
              }}
              data-testid="canvas-game"
            />

            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/70 rounded">
                <span 
                  className="text-3xl font-bold"
                  style={{ color: '#ff00ff', textShadow: '0 0 20px #ff00ff, 0 0 40px #ff00ff' }}
                >
                  PAUSED
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom branding - MadXperience logo */}
        <div className="flex items-center justify-center mt-6 gap-0">
          <span 
            className="text-3xl font-bold tracking-widest"
            style={{ color: '#fff', textShadow: '0 0 15px rgba(255,255,255,0.5)' }}
          >
            MAD
          </span>
          <img 
            src="/assets/Artboard_1-100_1769955694194.JPG" 
            alt="X" 
            className="h-10 w-10 mx-1"
            style={{ 
              filter: 'drop-shadow(0 0 15px #ff2c2c)',
            }}
          />
          <span 
            className="text-3xl font-bold tracking-widest"
            style={{ color: '#fff', textShadow: '0 0 15px rgba(255,255,255,0.5)' }}
          >
            PERIENCE
          </span>
        </div>
      </div>
    </div>
  );
}

function NextPiecePreview({ piece, size = 22 }: { piece: Piece; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = size * 4;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a15";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const offsetX = (4 - piece.shape[0].length) / 2;
    const offsetY = (4 - piece.shape.length) / 2;

    piece.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell) {
          const px = (x + offsetX) * size;
          const py = (y + offsetY) * size;
          const depth = 3;
          
          ctx.shadowColor = piece.color;
          ctx.shadowBlur = 10;
          ctx.fillStyle = piece.color;
          ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
          ctx.shadowBlur = 0;
          
          ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
          ctx.fillRect(px + 2, py + 2, size - 4, depth);
          ctx.fillRect(px + 2, py + 2, depth, size - 4);
          
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(px + 2, py + size - 2 - depth, size - 4, depth);
          ctx.fillRect(px + size - 2 - depth, py + 2, depth, size - 4);
        }
      });
    });
  }, [piece, size]);

  return <canvas ref={canvasRef} width={canvasSize} height={canvasSize} className="rounded" />;
}
