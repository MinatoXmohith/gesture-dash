export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export enum GestureType {
  NONE = 'NONE',
  OPEN_PALM = 'OPEN_PALM', // Jump
  CLOSED_FIST = 'CLOSED_FIST', // Duck
  THUMBS_UP = 'THUMBS_UP', // Restart
}

export interface VisionState {
  handCount: number;
  gesture: GestureType;
  isTurbo: boolean;
}

export interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Player extends Entity {
  vy: number;
  isJumping: boolean;
  isDucking: boolean;
}

export interface Obstacle extends Entity {
  type: 'CACTUS' | 'BIRD';
}
