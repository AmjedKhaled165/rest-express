# MadXperience Tetris

Interactive Tetris game with touch-friendly controls designed for live events and multi-device control.

## Overview

This is a full-stack Tetris game built with React and Socket.io, featuring the MadXperience brand styling (dark theme with red accent). The brand name displays as "MAD[X logo]PERIENCE" with the distinctive X logo from the MadXperience brand. The game supports multi-device control, allowing one device to control the game while another displays it.

## Features

- Classic Tetris gameplay with 7 tetromino shapes
- Touch-friendly control panel (Start/Pause, Left/Right/Rotate, Hard Drop)
- Keyboard controls (Arrow keys, WASD, Space for hard drop, Enter to start, P/Escape to pause)
- Real-time multi-device synchronization via Socket.io
- Score tracking with level progression
- Next piece preview
- Ghost piece showing drop location
- Responsive design for mobile and desktop
- Sound effects for moves, rotations, drops, line clears, level ups, and game over

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Shadcn/UI
- **Backend**: Express.js, Socket.io
- **Styling**: Madmappers brand theme (dark with #ff2c2c red accent)

## Project Structure

```
client/src/
├── pages/
│   ├── tetris-game.tsx    # Main game component with canvas and controls
│   └── controller.tsx     # Control-only UI for second screen/tablet
├── lib/
│   └── sounds.ts          # Web Audio API sound effects
├── components/ui/         # Shadcn UI components
└── App.tsx               # Root app with routing

server/
├── index.ts              # Express server setup
└── routes.ts             # Socket.io server for multi-device sync
```

## Pages

- `/` - Home page with Display/Controller selection
- `/display` - Main game with canvas and controls (for LED wall, projector, TV)
- `/controller` - Control-only UI (for tablets/phones as remote controllers)

## Controls

| Action      | Keyboard        | Touch Button |
|-------------|-----------------|--------------|
| Start/Restart | Enter         | START        |
| Pause/Resume  | P / Escape    | PAUSE        |
| Move Left     | Left Arrow / A | Left Arrow   |
| Move Right    | Right Arrow / D| Right Arrow  |
| Rotate        | Up Arrow / W  | Rotate       |
| Soft Drop     | Down Arrow / S | Down Arrow   |
| Hard Drop     | Space         | HARD DROP    |

## Multi-Device Setup

1. Open the app URL on both devices
2. On the display device (LED wall, projector, TV): Select "Display"
3. On the controller device (tablet, phone): Select "Controller"
4. Both devices connect via Socket.io automatically
5. Controls from the controller are broadcast to the display device in real-time

## Controller Features

The controller (/controller) features a Game Boy-inspired 3D design:

- **Responsive Sizing**: Size slider to scale controls from 20" to 100" screens
- **D-Pad**: Cross-shaped 3D directional pad on the LEFT side
  - Left/Right arrows for horizontal movement
  - Up/Down arrows for piece movement
- **Action Buttons**: Round glowing buttons on the RIGHT side
  - ROTATE (pink/magenta) - rotates the piece
  - DROP (red) - hard drop
- **Menu Buttons**: Angled START/PAUSE buttons at top center
- **Settings**: Gear icon in top-right reveals the size slider
- **Size persistence**: Slider value saved to localStorage

## Display Features

The display (/display) features a 3D arcade cabinet aesthetic:

- **Unified 3D Box**: Purple/dark gradient walls with perspective transforms
- **Stats Panel**: High Score, Score, Level, Lines integrated into the LEFT wall
- **Red Dot Grid**: Decorative pattern inside the game pit
- **Next Piece**: Displayed above the hatch with 3D doors
- **Blue Neon Frame**: Surrounds the entire structure
- **Pink Corner Triangles**: Glowing decorations at all corners

## Recent Changes

- Controller redesigned with responsive size slider for 20"-100" screens
- Game Boy-style 3D D-pad and round action buttons
- Unified 3D box structure with stats embedded in left wall
- Red dot grid pattern in game pit
- Background music and sound effects
- Socket.io integration for multi-device control
- Madmappers branding and dark theme
