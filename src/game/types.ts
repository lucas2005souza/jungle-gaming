import type { GameConfig } from './config';

export type ShipKind = 'player' | 'chaser' | 'shooter';
export type EndReason = 'time_up' | 'player_destroyed';
export type MatchStatus = 'running' | 'paused' | 'ended';

export interface Ship {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  heading: number;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  /** Enemy island steering: -1 = pass island on the right, +1 = on the left, 0 = free. Keeps the detour stable. */
  avoidSide: number;
  /** seconds remaining until each weapon is ready */
  cooldowns: { front: number; left: number; right: number };
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  x: number; y: number;
  prevX: number; prevY: number;
  vx: number; vy: number;
  damage: number;
  radius: number;
  life: number;
  alive: boolean;
}

export interface InputState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const emptyInput = (): InputState => ({
  forward: false, turnLeft: false, turnRight: false, fireFront: false, fireLeft: false, fireRight: false,
});

export type GameEvent =
  | { type: 'shot'; weapon: 'front' | 'side'; shipId: number; x: number; y: number; heading: number }
  | { type: 'hit'; targetId: number; x: number; y: number; damage: number }
  | { type: 'blocked'; x: number; y: number }
  | { type: 'shipDestroyed'; shipId: number; kind: ShipKind; x: number; y: number; byPlayer: boolean }
  | { type: 'playerCollision'; x: number; y: number }
  | { type: 'enemySpawned'; shipId: number; kind: ShipKind }
  | { type: 'ended'; reason: EndReason };

export interface MatchResult {
  score: number;
  playedSec: number;
  reason: EndReason;
  config: Pick<GameConfig['match'], 'durationSec' | 'spawnIntervalSec'>;
}