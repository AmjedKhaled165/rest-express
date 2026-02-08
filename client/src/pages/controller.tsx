import { useRef, useEffect, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Settings, Maximize, Minimize } from "lucide-react";
import xLogo from "@assets/Artboard_1-100_1769955694194.JPG";
import {
  playMoveSound,
  playRotateSound,
  playDropSound,
  playStartSound,
} from "@/lib/sounds";

type DeviceType = 'phone' | 'tablet' | 'large-touch';

function detectDeviceType(): DeviceType {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const maxDimension = Math.max(width, height);
  const physicalMax = Math.max(screenWidth, screenHeight);
  
  // Check if touch capable
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Calculate approximate screen diagonal in inches (assuming ~96 DPI for most devices)
  // Phones: < 7", Tablets: 7-13", Large touch screens: > 13"
  const dpi = window.devicePixelRatio * 96;
  const diagonalPixels = Math.sqrt(physicalMax * physicalMax + Math.min(screenWidth, screenHeight) * Math.min(screenWidth, screenHeight));
  const diagonalInches = diagonalPixels / dpi;
  
  // More reliable: use viewport size and pixel ratio
  // Phones typically have viewport width < 768px
  // Tablets: 768px - 1024px
  // Large touch screens: > 1024px (especially if low pixel ratio suggesting external display)
  
  if (width < 768) {
    return 'phone';
  } else if (width < 1200 && window.devicePixelRatio >= 1.5) {
    return 'tablet';
  } else {
    // Large screen - likely a large touch display or desktop
    return 'large-touch';
  }
}

function getDefaultScale(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'phone':
      return 1.0;  // Current size for phones
    case 'tablet':
      return 1.4;  // 40% bigger for tablets
    case 'large-touch':
      return 2.2;  // Much bigger for large touch screens (20"+)
  }
}

export default function Controller() {
  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceType, setDeviceType] = useState<DeviceType>('phone');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(true);
  
  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem('controllerScale');
    if (saved) {
      return parseFloat(saved);
    }
    // Auto-detect device and set default scale
    return getDefaultScale(detectDeviceType());
  });

  // Fullscreen functions
  const enterFullscreen = useCallback(async () => {
    try {
      const elem = containerRef.current || document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
      setShowFullscreenPrompt(false);
    } catch (err) {
      console.log('Fullscreen not supported or denied');
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
    } catch (err) {
      console.log('Exit fullscreen failed');
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);
      if (isNowFullscreen) {
        setShowFullscreenPrompt(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Detect device type on mount and resize
  useEffect(() => {
    const updateDeviceType = () => {
      const detected = detectDeviceType();
      setDeviceType(detected);
      
      // Only auto-update scale if user hasn't manually set it
      const saved = localStorage.getItem('controllerScale');
      if (!saved) {
        setScale(getDefaultScale(detected));
      }
    };
    
    updateDeviceType();
    window.addEventListener('resize', updateDeviceType);
    return () => window.removeEventListener('resize', updateDeviceType);
  }, []);

  useEffect(() => {
    localStorage.setItem('controllerScale', scale.toString());
  }, [scale]);

  // BroadcastChannel ref for offline mode
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    // BroadcastChannel for offline controller support (same device, different tabs)
    const channel = new BroadcastChannel('madx-tetris-controls');
    channelRef.current = channel;

    // Listen for game state from display (offline mode)
    channel.onmessage = (event) => {
      if (event.data?.type === 'gameState') {
        setIsRunning(event.data.isRunning);
        setIsPaused(event.data.isPaused);
        setIsGameOver(event.data.isGameOver);
        // Mark as connected in offline mode
        if (!isConnected) {
          setIsConnected(true);
        }
      }
    };

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      // Don't set disconnected if we have BroadcastChannel working
      // The channel state sync will keep us "connected"
    });

    socket.on("gameState", (state: { isRunning: boolean; isPaused: boolean; isGameOver: boolean }) => {
      setIsRunning(state.isRunning);
      setIsPaused(state.isPaused);
      setIsGameOver(state.isGameOver);
    });

    return () => {
      socket.disconnect();
      channel.close();
    };
  }, []);

  const sendAction = useCallback((action: string) => {
    // Send via Socket.io if connected
    socketRef.current?.emit("control", action);
    
    // Also send via BroadcastChannel for offline mode
    channelRef.current?.postMessage({ action });
    
    switch (action) {
      case "start":
        playStartSound();
        setIsRunning(true);
        setIsPaused(false);
        setIsGameOver(false);
        break;
      case "pause":
        setIsPaused(!isPaused);
        break;
      case "left":
      case "right":
      case "up":
      case "down":
      case "softdrop":
        playMoveSound();
        break;
      case "rotate":
        playRotateSound();
        break;
      case "drop":
        playDropSound();
        break;
    }
  }, [isPaused]);

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

  const s = (value: number) => value * scale;

  return (
    <div 
      ref={containerRef}
      className="min-h-screen h-screen flex flex-col items-center justify-center overflow-hidden p-4"
      style={{
        background: 'linear-gradient(180deg, #2a2a35 0%, #1a1a25 50%, #0a0a15 100%)',
      }}
    >
      {/* Fullscreen Prompt Overlay */}
      {showFullscreenPrompt && !isFullscreen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(0,0,0,0.95)',
          }}
        >
          <div className="text-center space-y-6">
            <Maximize 
              className="mx-auto"
              style={{ 
                width: 80, 
                height: 80, 
                color: '#ff2c2c',
                filter: 'drop-shadow(0 0 20px #ff2c2c)',
              }} 
            />
            <h2 
              className="text-2xl font-bold text-white"
              style={{ textShadow: '0 0 10px rgba(255,255,255,0.3)' }}
            >
              Tap to Enter Fullscreen
            </h2>
            <p className="text-gray-400 text-sm max-w-xs mx-auto">
              For the best experience, the controller works in fullscreen mode
            </p>
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={enterFullscreen}
                className="px-8 py-4 rounded-xl font-bold text-lg transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(180deg, #ff4444 0%, #cc2222 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(255,44,44,0.4)',
                  border: '2px solid #ff6666',
                }}
                data-testid="button-fullscreen-enter"
              >
                GO FULLSCREEN
              </button>
              <button
                onClick={() => setShowFullscreenPrompt(false)}
                className="text-gray-500 text-sm underline"
                data-testid="button-skip-fullscreen"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Toggle */}
      <div className="absolute top-4 right-4 flex items-center gap-3 z-40">
        <div 
          className="px-3 py-1 rounded-full text-xs font-bold"
          style={{
            background: isConnected ? '#22c55e' : '#ef4444',
            color: '#fff',
            boxShadow: isConnected ? '0 0 10px #22c55e55' : '0 0 10px #ef444455',
          }}
          data-testid="badge-connection"
        >
          {isConnected ? "Connected" : "Disconnected"}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded-full flex items-center justify-center transition-all"
          style={{
            width: 40,
            height: 40,
            background: showSettings ? '#ff2c2c' : '#3a3a4a',
            border: `2px solid ${showSettings ? '#ff5555' : '#555'}`,
          }}
          data-testid="button-settings"
        >
          <Settings style={{ width: 20, height: 20, color: showSettings ? '#fff' : '#999' }} />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div 
          className="absolute top-16 right-4 rounded-xl flex flex-col gap-3 px-4 py-3"
          style={{
            background: 'rgba(50, 50, 60, 0.95)',
            border: '2px solid #555',
            minWidth: 200,
          }}
        >
          {/* Device Type Indicator */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: '#888' }}>Device:</span>
            <span 
              className="px-2 py-1 rounded text-xs font-bold uppercase"
              style={{
                background: deviceType === 'phone' ? '#3b82f6' : deviceType === 'tablet' ? '#8b5cf6' : '#f59e0b',
                color: '#fff',
              }}
              data-testid="badge-device-type"
            >
              {deviceType === 'large-touch' ? 'Large Touch' : deviceType}
            </span>
          </div>
          
          {/* Size Slider */}
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 11, color: '#888' }}>Small</span>
            <input
              type="range"
              min="0.4"
              max="3.5"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
              style={{
                background: 'linear-gradient(to right, #666 0%, #ff2c2c 100%)',
              }}
              data-testid="slider-size"
            />
            <span style={{ fontSize: 11, color: '#888' }}>Large</span>
          </div>
          
          {/* Scale Value & Reset */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, color: '#aaa' }}>
              Scale: {scale.toFixed(1)}x
            </span>
            <button
              onClick={() => {
                localStorage.removeItem('controllerScale');
                setScale(getDefaultScale(deviceType));
              }}
              className="px-2 py-1 rounded text-xs transition-all active:scale-95"
              style={{
                background: '#ff2c2c',
                color: '#fff',
              }}
              data-testid="button-reset-scale"
            >
              Auto
            </button>
          </div>
          
          {/* Fullscreen Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-600">
            <span style={{ fontSize: 11, color: '#888' }}>Fullscreen:</span>
            <button
              onClick={toggleFullscreen}
              className="px-3 py-1 rounded text-xs font-bold transition-all active:scale-95 flex items-center gap-1"
              style={{
                background: isFullscreen ? '#22c55e' : '#3a3a4a',
                color: '#fff',
                border: `1px solid ${isFullscreen ? '#22c55e' : '#555'}`,
              }}
              data-testid="button-toggle-fullscreen"
            >
              {isFullscreen ? (
                <>
                  <Minimize style={{ width: 12, height: 12 }} />
                  EXIT
                </>
              ) : (
                <>
                  <Maximize style={{ width: 12, height: 12 }} />
                  ENTER
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* NES Controller Body */}
      <div
        className="relative"
        style={{
          width: s(900),
          height: s(380),
          background: 'linear-gradient(180deg, #d8d8dc 0%, #c8c8cc 50%, #b8b8bc 100%)',
          borderRadius: s(20),
          boxShadow: `
            0 ${s(8)}px ${s(20)}px rgba(0,0,0,0.4),
            inset 0 ${s(2)}px ${s(4)}px rgba(255,255,255,0.8),
            inset 0 -${s(4)}px ${s(8)}px rgba(0,0,0,0.2)
          `,
          border: `${s(3)}px solid #a0a0a4`,
        }}
      >
        {/* Inner Dark Panel */}
        <div
          className="absolute"
          style={{
            top: s(25),
            left: s(25),
            right: s(25),
            bottom: s(25),
            background: 'linear-gradient(180deg, #3a3a42 0%, #2a2a32 50%, #1a1a22 100%)',
            borderRadius: s(8),
            boxShadow: `
              inset 0 ${s(4)}px ${s(10)}px rgba(0,0,0,0.5),
              0 ${s(2)}px ${s(4)}px rgba(255,255,255,0.1)
            `,
          }}
        >
          {/* Gray Stripes */}
          <div
            className="absolute"
            style={{
              top: s(20),
              left: '50%',
              transform: 'translateX(-50%)',
              width: s(200),
              height: s(16),
              background: 'linear-gradient(180deg, #888 0%, #666 100%)',
              borderRadius: s(3),
              boxShadow: `inset 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.3), inset 0 -${s(2)}px ${s(3)}px rgba(0,0,0,0.3)`,
            }}
          />
          <div
            className="absolute"
            style={{
              top: s(44),
              left: '50%',
              transform: 'translateX(-50%)',
              width: s(200),
              height: s(16),
              background: 'linear-gradient(180deg, #888 0%, #666 100%)',
              borderRadius: s(3),
              boxShadow: `inset 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.3), inset 0 -${s(2)}px ${s(3)}px rgba(0,0,0,0.3)`,
            }}
          />

          {/* MadXperience Label (like Nintendo) */}
          <div
            className="absolute font-bold tracking-wider flex items-center"
            style={{
              top: s(30),
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: s(14),
              color: '#ff2c2c',
              textShadow: `0 0 ${s(10)}px rgba(255,44,44,0.5)`,
            }}
            data-testid="text-title"
          >
            <span>MAD</span>
            <img 
              src={xLogo} 
              alt="X" 
              style={{ 
                height: s(18), 
                width: 'auto', 
                margin: `0 ${s(2)}px`,
                borderRadius: s(2),
              }}
            />
            <span>PERIENCE</span>
          </div>

          {/* D-Pad Section - 90% larger with realistic feel */}
          <div
            className="absolute"
            style={{
              left: s(20),
              top: '50%',
              transform: 'translateY(-50%)',
              width: s(247),
              height: s(247),
            }}
          >
            {/* D-Pad Background Pit */}
            <div
              className="absolute rounded-full"
              style={{
                inset: s(12),
                background: 'radial-gradient(circle at 30% 30%, #1a1a22 0%, #0a0a12 60%, #050508 100%)',
                boxShadow: `
                  inset 0 ${s(10)}px ${s(20)}px rgba(0,0,0,0.9),
                  inset 0 -${s(4)}px ${s(8)}px rgba(60,60,70,0.2)
                `,
              }}
            />
            
            {/* D-Pad Cross - More 3D realistic */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Vertical bar */}
              <div
                className="absolute"
                style={{
                  width: s(72),
                  height: s(210),
                  background: 'linear-gradient(90deg, #1e1e26 0%, #2a2a34 20%, #3a3a44 50%, #2a2a34 80%, #1e1e26 100%)',
                  borderRadius: s(6),
                  boxShadow: `
                    inset ${s(3)}px 0 ${s(6)}px rgba(80,80,90,0.3),
                    inset -${s(3)}px 0 ${s(8)}px rgba(0,0,0,0.5),
                    0 ${s(6)}px ${s(12)}px rgba(0,0,0,0.6)
                  `,
                  border: `${s(1)}px solid rgba(60,60,70,0.3)`,
                }}
              />
              {/* Horizontal bar */}
              <div
                className="absolute"
                style={{
                  width: s(210),
                  height: s(72),
                  background: 'linear-gradient(180deg, #1e1e26 0%, #2a2a34 20%, #3a3a44 50%, #2a2a34 80%, #1e1e26 100%)',
                  borderRadius: s(6),
                  boxShadow: `
                    inset 0 ${s(3)}px ${s(6)}px rgba(80,80,90,0.3),
                    inset 0 -${s(3)}px ${s(8)}px rgba(0,0,0,0.5),
                    0 ${s(6)}px ${s(12)}px rgba(0,0,0,0.6)
                  `,
                  border: `${s(1)}px solid rgba(60,60,70,0.3)`,
                }}
              />
              {/* Center disc - textured */}
              <div
                className="absolute rounded-full"
                style={{
                  width: s(50),
                  height: s(50),
                  background: 'radial-gradient(circle at 40% 40%, #35353f 0%, #25252f 50%, #1a1a24 100%)',
                  boxShadow: `
                    inset 0 ${s(2)}px ${s(4)}px rgba(80,80,90,0.4),
                    inset 0 -${s(2)}px ${s(4)}px rgba(0,0,0,0.4),
                    0 ${s(2)}px ${s(6)}px rgba(0,0,0,0.5)
                  `,
                  border: `${s(1)}px solid rgba(50,50,60,0.5)`,
                }}
              />
            </div>

            {/* D-Pad Buttons with nudge effect */}
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                sendAction("up");
              }}
              disabled={!isRunning || isPaused || isGameOver}
              className="absolute flex items-center justify-center transition-transform duration-75"
              style={{
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: s(72),
                height: s(88),
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%) translateY(2px) scale(0.97)';
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%) translateY(2px) scale(0.97)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              data-testid="button-up"
            >
              <ArrowUp style={{ width: s(38), height: s(38), color: '#555', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }} />
            </button>
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                sendAction("down");
              }}
              disabled={!isRunning || isPaused || isGameOver}
              className="absolute flex items-center justify-center transition-transform duration-75"
              style={{
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: s(72),
                height: s(88),
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%) translateY(-2px) scale(0.97)';
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%) translateY(-2px) scale(0.97)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(-50%)';
              }}
              data-testid="button-down"
            >
              <ArrowDown style={{ width: s(38), height: s(38), color: '#555', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }} />
            </button>
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                sendAction("left");
              }}
              disabled={!isRunning || isPaused || isGameOver}
              className="absolute flex items-center justify-center transition-transform duration-75"
              style={{
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: s(88),
                height: s(72),
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) translateX(2px) scale(0.97)';
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) translateX(2px) scale(0.97)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              data-testid="button-left"
            >
              <ArrowLeft style={{ width: s(38), height: s(38), color: '#555', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }} />
            </button>
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(15);
                sendAction("right");
              }}
              disabled={!isRunning || isPaused || isGameOver}
              className="absolute flex items-center justify-center transition-transform duration-75"
              style={{
                right: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: s(88),
                height: s(72),
              }}
              onTouchStart={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) translateX(-2px) scale(0.97)';
              }}
              onTouchEnd={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%) translateX(-2px) scale(0.97)';
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-50%)';
              }}
              data-testid="button-right"
            >
              <ArrowRight style={{ width: s(38), height: s(38), color: '#555', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }} />
            </button>
          </div>

          {/* Center Section - PAUSE/START/RESTART Labels and Buttons */}
          <div
            className="absolute flex flex-col items-center"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: s(30),
              gap: s(10),
            }}
          >
            {/* Labels */}
            <div className="flex" style={{ gap: s(28) }}>
              <span
                className="font-bold tracking-wider"
                style={{
                  fontSize: s(12),
                  color: '#cc3333',
                }}
              >
                PAUSE
              </span>
              <span
                className="font-bold tracking-wider"
                style={{
                  fontSize: s(12),
                  color: '#cc3333',
                }}
              >
                START
              </span>
              <span
                className="font-bold tracking-wider"
                style={{
                  fontSize: s(12),
                  color: '#cc3333',
                }}
              >
                RESTART
              </span>
            </div>
            
            {/* Buttons */}
            <div className="flex" style={{ gap: s(20) }}>
              <button
                onClick={() => sendAction("pause")}
                className="transition-all active:scale-95"
                style={{
                  width: s(70),
                  height: s(28),
                  background: isPaused 
                    ? 'linear-gradient(180deg, #4a4a52 0%, #3a3a42 100%)'
                    : 'linear-gradient(180deg, #2a2a32 0%, #1a1a22 100%)',
                  borderRadius: s(16),
                  boxShadow: isPaused
                    ? `0 0 ${s(14)}px rgba(255,44,44,0.3), inset 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.2)`
                    : `inset 0 ${s(3)}px ${s(6)}px rgba(0,0,0,0.5), 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.1)`,
                  border: isPaused ? `${s(2)}px solid #ff4444` : `${s(2)}px solid #444`,
                }}
                data-testid="button-pause"
              />
              <button
                onClick={() => sendAction("start")}
                className="transition-all active:scale-95"
                style={{
                  width: s(70),
                  height: s(28),
                  background: (isRunning && !isPaused)
                    ? 'linear-gradient(180deg, #4a4a52 0%, #3a3a42 100%)'
                    : 'linear-gradient(180deg, #2a2a32 0%, #1a1a22 100%)',
                  borderRadius: s(16),
                  boxShadow: (isRunning && !isPaused)
                    ? `0 0 ${s(14)}px rgba(255,44,44,0.3), inset 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.2)`
                    : `inset 0 ${s(3)}px ${s(6)}px rgba(0,0,0,0.5), 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.1)`,
                  border: (isRunning && !isPaused) ? `${s(2)}px solid #ff4444` : `${s(2)}px solid #444`,
                }}
                data-testid="button-start"
              />
              <button
                onClick={() => sendAction("restart")}
                className="transition-all active:scale-95"
                style={{
                  width: s(70),
                  height: s(28),
                  background: 'linear-gradient(180deg, #2a2a32 0%, #1a1a22 100%)',
                  borderRadius: s(16),
                  boxShadow: `inset 0 ${s(3)}px ${s(6)}px rgba(0,0,0,0.5), 0 ${s(2)}px ${s(3)}px rgba(255,255,255,0.1)`,
                  border: `${s(2)}px solid #444`,
                }}
                data-testid="button-restart"
              />
            </div>
          </div>

          {/* Right Section - A and B Buttons - 40% larger */}
          <div
            className="absolute flex items-center"
            style={{
              right: s(50),
              top: '50%',
              transform: 'translateY(-50%)',
              gap: s(28),
            }}
          >
            {/* B Button - ROTATE - 50% larger with 3D realistic styling */}
            <div className="flex flex-col items-center" style={{ gap: s(10) }}>
              <button
                onClick={() => sendAction("rotate")}
                onTouchStart={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                onMouseDown={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                disabled={!isRunning || isPaused || isGameOver}
                className="rounded-full transition-all duration-75 active:scale-[0.92] active:translate-y-[3px]"
                style={{
                  width: s(147),
                  height: s(147),
                  background: `
                    radial-gradient(ellipse 60% 40% at 35% 25%, rgba(255,200,200,0.6) 0%, transparent 50%),
                    radial-gradient(ellipse 80% 60% at 50% 50%, #ff3333 0%, #cc1111 60%, #990000 100%)
                  `,
                  boxShadow: `
                    inset ${s(3)}px ${s(3)}px ${s(8)}px rgba(255,255,255,0.3),
                    inset -${s(3)}px -${s(3)}px ${s(10)}px rgba(0,0,0,0.4),
                    inset 0 ${s(2)}px ${s(4)}px rgba(255,200,200,0.3),
                    0 ${s(10)}px ${s(15)}px rgba(0,0,0,0.5),
                    0 ${s(4)}px ${s(6)}px rgba(0,0,0,0.3),
                    0 0 ${s(50)}px rgba(255,44,44,0.25)
                  `,
                  border: `${s(4)}px solid #881111`,
                  borderTopColor: '#bb3333',
                  borderBottomColor: '#660000',
                }}
                data-testid="button-rotate"
              />
              <span
                className="font-bold"
                style={{
                  fontSize: s(24),
                  color: '#cc3333',
                  textShadow: `0 0 ${s(8)}px rgba(255,44,44,0.5)`,
                }}
              >
                B
              </span>
            </div>

            {/* A Button - DROP - 50% larger with 3D realistic styling */}
            <div className="flex flex-col items-center" style={{ gap: s(10) }}>
              <button
                onClick={() => sendAction("drop")}
                onTouchStart={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                onMouseDown={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                }}
                disabled={!isRunning || isPaused || isGameOver}
                className="rounded-full transition-all duration-75 active:scale-[0.92] active:translate-y-[3px]"
                style={{
                  width: s(147),
                  height: s(147),
                  background: `
                    radial-gradient(ellipse 60% 40% at 35% 25%, rgba(255,200,200,0.6) 0%, transparent 50%),
                    radial-gradient(ellipse 80% 60% at 50% 50%, #ff3333 0%, #cc1111 60%, #990000 100%)
                  `,
                  boxShadow: `
                    inset ${s(3)}px ${s(3)}px ${s(8)}px rgba(255,255,255,0.3),
                    inset -${s(3)}px -${s(3)}px ${s(10)}px rgba(0,0,0,0.4),
                    inset 0 ${s(2)}px ${s(4)}px rgba(255,200,200,0.3),
                    0 ${s(10)}px ${s(15)}px rgba(0,0,0,0.5),
                    0 ${s(4)}px ${s(6)}px rgba(0,0,0,0.3),
                    0 0 ${s(50)}px rgba(255,44,44,0.25)
                  `,
                  border: `${s(4)}px solid #881111`,
                  borderTopColor: '#bb3333',
                  borderBottomColor: '#660000',
                }}
                data-testid="button-drop"
              />
              <span
                className="font-bold"
                style={{
                  fontSize: s(24),
                  color: '#cc3333',
                  textShadow: `0 0 ${s(8)}px rgba(255,44,44,0.5)`,
                }}
              >
                A
              </span>
            </div>
          </div>

          {/* Pause Overlay */}
          {isPaused && (
            <div
              className="absolute inset-0 flex items-center justify-center rounded-lg"
              style={{
                background: 'rgba(0,0,0,0.5)',
              }}
            >
              <span
                className="font-bold tracking-widest"
                style={{
                  fontSize: s(32),
                  color: '#ff2c2c',
                  textShadow: `0 0 ${s(20)}px #ff2c2c`,
                }}
              >
                PAUSED
              </span>
            </div>
          )}
        </div>

        {/* Cable exit (decorative) */}
        <div
          className="absolute"
          style={{
            top: s(-15),
            left: '50%',
            transform: 'translateX(-50%)',
            width: s(40),
            height: s(20),
            background: 'linear-gradient(180deg, #c8c8cc 0%, #d8d8dc 100%)',
            borderRadius: `${s(8)}px ${s(8)}px 0 0`,
            boxShadow: `inset 0 ${s(2)}px ${s(4)}px rgba(255,255,255,0.5)`,
          }}
        />
        <div
          className="absolute"
          style={{
            top: s(-40),
            left: '50%',
            transform: 'translateX(-50%)',
            width: s(20),
            height: s(30),
            background: 'linear-gradient(90deg, #222 0%, #333 50%, #222 100%)',
            borderRadius: s(10),
          }}
        />
      </div>

      {/* Bottom text */}
      <div
        className="absolute bottom-4 text-center"
        style={{ color: '#555', fontSize: 12 }}
      >
        B = ROTATE | A = DROP | D-Pad = MOVE
      </div>
    </div>
  );
}
