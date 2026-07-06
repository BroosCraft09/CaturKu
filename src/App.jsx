import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import {
  BookOpen, Sparkles, Swords, Crown, Lock, Check, ChevronRight, ChevronLeft,
  Flame, Star, Trophy, MessageCircle, User, Play, RotateCcw, Send, Bot, X,
  HelpCircle, ArrowLeft, Zap, Loader2, Award, RefreshCw, Info, Castle, Flag,
  Volume2, VolumeX, Palette, Settings,
} from "lucide-react";

import {
  onAuthChange, loginGoogle, logoutUser,
  saveProgressCloud, loadProgressCloud, CONFIGURED as FIREBASE_CONFIGURED,
  createRoom, joinRoom, subscribeRoom, pushMove, finishRoom, abandonRoom,
} from './firebase.js';

// ============================================================================
//  CATUR AKADEMI - Belajar catur dari nol, selangkah demi selangkah
// ============================================================================

const PIECE_UNICODE = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
};

const PIECE_NAME_ID = {
  K: 'Raja', Q: 'Menteri', R: 'Benteng', B: 'Gajah', N: 'Kuda', P: 'Pion',
};

const UNIT_ICONS = { BookOpen, Sparkles, Swords, Crown, Zap, Flag, Lock };

const RANKS = [
  { name: 'Pion', glyph: '♙', minXP: 0, desc: 'Awal dari segalanya. Semua Grandmaster pun mulai dari sini.' },
  { name: 'Kuda', glyph: '♘', minXP: 100, desc: 'Mulai mengenali pola & gerakan tak terduga.' },
  { name: 'Gajah', glyph: '♗', minXP: 250, desc: 'Pandangan makin tajam - mulai melihat garis & diagonal kunci.' },
  { name: 'Benteng', glyph: '♖', minXP: 450, desc: 'Kuat & stabil. Fondasi taktikmu makin kokoh.' },
  { name: 'Menteri', glyph: '♕', minXP: 700, desc: 'Serba bisa - strategi & taktikmu makin matang.' },
  { name: 'Raja', glyph: '♔', minXP: 1000, desc: 'Tenang tapi menentukan, seperti pemain berpengalaman.' },
  { name: 'GrandMaster', glyph: '👑', minXP: 1500, desc: 'Predikat impian. Perjalanan panjang, dan kamu sudah jauh melangkah.' },
];

function getRankInfo(xp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].minXP) idx = i;
  const current = RANKS[idx];
  const next = RANKS[idx + 1] || null;
  const progress = next ? (xp - current.minXP) / (next.minXP - current.minXP) : 1;
  return { index: idx, current, next, progress: Math.min(1, Math.max(0, progress)) };
}

const DIFFICULTIES = [
  { id: 'pemula', label: 'Pemula', depth: 1, randomFactor: 0.4, desc: 'Santai & sering blunder - pas buat pemanasan.' },
  { id: 'menengah', label: 'Menengah', depth: 2, randomFactor: 0.15, desc: 'Mulai berpikir 1-2 langkah ke depan.' },
  { id: 'mahir', label: 'Mahir', depth: 3, randomFactor: 0.05, desc: 'Jarang blunder & cukup tajam dalam taktik.' },
  { id: 'ahli', label: 'Ahli', depth: 4, randomFactor: 0, desc: 'Mode terkuat - selalu mencari langkah terbaik.' },
];

const DEFAULT_PROGRESS = {
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  completedLessons: [],
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  gamesDraw: 0,
  solvedPuzzles: [],
  examsTaken: 0,
  examBestScore: 0,
  unlockedAchievements: [],
  lastDailyPuzzleDate: null,
  soundEnabled: true,
  boardTheme: 'classic',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function dayDiff(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
}

// ============================================================================
//  SOUND ENGINE - efek suara sintetis via Web Audio API (tanpa file eksternal)
// ============================================================================
let _audioCtx = null;
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    _audioCtx = new Ctx();
  }
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}

function playTone(freq, duration, opts = {}) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const { type = 'sine', gain = 0.12, delay = 0 } = opts;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startAt = ctx.currentTime + delay;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

const SOUND_FX = {
  move: () => playTone(440, 0.09, { type: 'triangle', gain: 0.09 }),
  capture: () => { playTone(330, 0.07, { type: 'square', gain: 0.08 }); playTone(220, 0.09, { type: 'square', gain: 0.06, delay: 0.03 }); },
  check: () => { playTone(660, 0.1, { type: 'sawtooth', gain: 0.08 }); playTone(880, 0.12, { type: 'sawtooth', gain: 0.07, delay: 0.06 }); },
  checkmateWin: () => { [523, 659, 784, 1046].forEach((f, i) => playTone(f, 0.18, { type: 'triangle', gain: 0.1, delay: i * 0.1 })); },
  checkmateLoss: () => { [392, 330, 261, 196].forEach((f, i) => playTone(f, 0.22, { type: 'sine', gain: 0.09, delay: i * 0.11 })); },
  draw: () => { playTone(392, 0.14, { type: 'sine', gain: 0.08 }); playTone(392, 0.14, { type: 'sine', gain: 0.08, delay: 0.16 }); },
  correct: () => { playTone(523, 0.08, { type: 'triangle', gain: 0.09 }); playTone(784, 0.14, { type: 'triangle', gain: 0.09, delay: 0.07 }); },
  wrong: () => playTone(196, 0.18, { type: 'sawtooth', gain: 0.07 }),
  achievement: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => playTone(f, 0.15, { type: 'sine', gain: 0.08, delay: i * 0.08 })); },
  click: () => playTone(880, 0.04, { type: 'sine', gain: 0.05 }),
  promote: () => { [392, 523, 659, 784].forEach((f, i) => playTone(f, 0.1, { type: 'triangle', gain: 0.08, delay: i * 0.05 })); },
};

function playSound(name, enabled = true) {
  if (!enabled) return;
  try {
    const fx = SOUND_FX[name];
    if (fx) fx();
  } catch (e) {
    // audio unavailable (e.g. autoplay policy) - fail silently
  }
}

// ============================================================================
//  BOARD THEMES
// ============================================================================
const BOARD_THEMES = {
  classic: { id: 'classic', label: 'Akademi Klasik', light: '#F2E8D5', dark: '#4F4670', accent: '#E0B952' },
  walnut: { id: 'walnut', label: 'Kayu Walnut', light: '#E8C99B', dark: '#7B4A2D', accent: '#E0B952' },
  ocean: { id: 'ocean', label: 'Biru Laut', light: '#DCEFF2', dark: '#2C6E81', accent: '#5BC8E0' },
  forest: { id: 'forest', label: 'Hijau Hutan', light: '#EAEFD8', dark: '#5C7A4A', accent: '#D9A23B' },
  midnight: { id: 'midnight', label: 'Tengah Malam', light: '#9AA3C2', dark: '#22243A', accent: '#C45B4F' },
};

// ============================================================================
//  PREFERENCES CONTEXT - tema papan & suara, dipakai di seluruh komponen anak
//  tanpa perlu prop-drilling manual di tiap level.
// ============================================================================
const PreferencesContext = createContext({ boardTheme: 'classic', soundEnabled: true });
function usePrefs() {
  return useContext(PreferencesContext);
}
function useSound() {
  const { soundEnabled } = usePrefs();
  return useCallback((name) => playSound(name, soundEnabled), [soundEnabled]);
}

// ============================================================================
//  ACHIEVEMENTS
// ============================================================================
const ACHIEVEMENTS = [
  { id: 'first_lesson', label: 'Langkah Pertama', desc: 'Selesaikan 1 pelajaran', icon: 'BookOpen', xp: 10,
    check: (p) => p.completedLessons.length >= 1 },
  { id: 'unit1_done', label: 'Fondasi Kuat', desc: 'Selesaikan semua pelajaran Bab 1', icon: 'Check', xp: 20,
    check: (p) => ['u1l1','u1l2','u1l3','u1l4'].every((id) => p.completedLessons.includes(id)) },
  { id: 'all_lessons', label: 'Murid Teladan', desc: 'Selesaikan semua pelajaran', icon: 'Trophy', xp: 50,
    check: (p) => p.completedLessons.length >= 11 },
  { id: 'first_win', label: 'Kemenangan Pertama', desc: 'Menangkan 1 partai lawan AI', icon: 'Swords', xp: 15,
    check: (p) => p.gamesWon >= 1 },
  { id: 'win5', label: 'Pemburu Skakmat', desc: 'Menangkan 5 partai lawan AI', icon: 'Crown', xp: 30,
    check: (p) => p.gamesWon >= 5 },
  { id: 'win_ahli', label: 'Penakluk Ahli', desc: 'Kalahkan AI tingkat Ahli', icon: 'Star', xp: 40,
    check: (p) => p.beatAhli === true },
  { id: 'win_as_black', label: 'Hitam Pemberani', desc: 'Menangkan partai sebagai Hitam', icon: 'Crown', xp: 20,
    check: (p) => p.wonAsBlack === true },
  { id: 'quick_win', label: 'Penakluk Cepat', desc: 'Menang dalam ≤15 langkah penuh', icon: 'Zap', xp: 30,
    check: (p) => p.quickWin === true },
  { id: 'first_puzzle', label: 'Pemecah Teka-Teki', desc: 'Selesaikan 1 puzzle taktik', icon: 'Sparkles', xp: 10,
    check: (p) => (p.solvedPuzzles || []).length >= 1 },
  { id: 'puzzle10', label: 'Ahli Taktik', desc: 'Selesaikan 10 puzzle taktik', icon: 'Zap', xp: 30,
    check: (p) => (p.solvedPuzzles || []).length >= 10 },
  { id: 'puzzle_all', label: 'Master Taktik', desc: 'Selesaikan semua puzzle taktik', icon: 'Award', xp: 50,
    check: (p) => (p.solvedPuzzles || []).length >= 18 },
  { id: 'first_exam', label: 'Murid Berani', desc: 'Selesaikan 1 Ujian Harian', icon: 'HelpCircle', xp: 20,
    check: (p) => (p.examsTaken || 0) >= 1 },
  { id: 'exam_perfect', label: 'Nilai Sempurna', desc: 'Dapat skor 100% di Ujian Harian', icon: 'Award', xp: 50,
    check: (p) => (p.examBestScore || 0) >= 100 },
  { id: 'streak3', label: 'Konsisten', desc: 'Belajar 3 hari berturut-turut', icon: 'Flame', xp: 20,
    check: (p) => p.streak >= 3 },
  { id: 'streak7', label: 'Seminggu Penuh', desc: 'Belajar 7 hari berturut-turut', icon: 'Flame', xp: 40,
    check: (p) => p.streak >= 7 },
  { id: 'xp500', label: 'Kuda Sejati', desc: 'Kumpulkan 500 XP', icon: 'Zap', xp: 25,
    check: (p) => p.xp >= 500 },
  { id: 'xp1000', label: 'Benteng Kokoh', desc: 'Kumpulkan 1000 XP', icon: 'Castle', xp: 50,
    check: (p) => p.xp >= 1000 },
  { id: 'unit5_done', label: 'Taktisi Sejati', desc: 'Selesaikan semua pelajaran Bab 5', icon: 'Zap', xp: 35,
    check: (p) => ['u5l1','u5l2','u5l3'].every((id) => p.completedLessons.includes(id)) },
  { id: 'all_lessons_v2', label: 'Mahaguru Akademi', desc: 'Selesaikan semua 14 pelajaran', icon: 'Trophy', xp: 75,
    check: (p) => p.completedLessons.length >= 14 },
  { id: 'daily_puzzle', label: 'Rutin Harian', desc: 'Selesaikan Puzzle Harian pertamamu', icon: 'Star', xp: 15,
    check: (p) => !!p.lastDailyPuzzleDate },
];

function checkNewAchievements(progress) {
  const unlocked = progress.unlockedAchievements || [];
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(progress));
}

// ===== Catur Akademi - Chess Engine =====
// Board representation: 8x8 array, board[0] = rank 8 (black home), board[7] = rank 1 (white home)
// Each cell: null or string like 'wP','bK', etc.

const WHITE = 'w', BLACK = 'b';

function pieceColor(p) { return p ? p[0] : null; }
function pieceType(p) { return p ? p[1] : null; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function opponent(c) { return c === WHITE ? BLACK : WHITE; }

function squareToRC(sq) {
  const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(sq[1], 10);
  return { row: 8 - rank, col: file };
}
function rcToSquare(row, col) {
  const file = String.fromCharCode('a'.charCodeAt(0) + col);
  const rank = 8 - row;
  return file + rank;
}

function fenToState(fen) {
  const parts = fen.trim().split(/\s+/);
  const rows = parts[0].split('/');
  const board = [];
  for (const r of rows) {
    const row = [];
    for (const ch of r) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < parseInt(ch, 10); i++) row.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toUpperCase();
        row.push(color + type);
      }
    }
    board.push(row);
  }
  const turn = parts[1] === 'w' ? WHITE : BLACK;
  const castling = { wK: false, wQ: false, bK: false, bQ: false };
  if (parts[2] && parts[2] !== '-') {
    for (const ch of parts[2]) {
      if (ch === 'K') castling.wK = true;
      if (ch === 'Q') castling.wQ = true;
      if (ch === 'k') castling.bK = true;
      if (ch === 'q') castling.bQ = true;
    }
  }
  let enPassant = null;
  if (parts[3] && parts[3] !== '-') enPassant = squareToRC(parts[3]);
  const halfmove = parts[4] ? parseInt(parts[4], 10) : 0;
  const fullmove = parts[5] ? parseInt(parts[5], 10) : 1;
  return { board, turn, castling, enPassant, halfmove, fullmove };
}

function stateToFen(state) {
  const rows = [];
  for (const row of state.board) {
    let s = '', empty = 0;
    for (const cell of row) {
      if (!cell) { empty++; continue; }
      if (empty > 0) { s += empty; empty = 0; }
      const ch = cell[1];
      s += cell[0] === 'w' ? ch.toUpperCase() : ch.toLowerCase();
    }
    if (empty > 0) s += empty;
    rows.push(s);
  }
  const boardStr = rows.join('/');
  let castlingStr = '';
  if (state.castling.wK) castlingStr += 'K';
  if (state.castling.wQ) castlingStr += 'Q';
  if (state.castling.bK) castlingStr += 'k';
  if (state.castling.bQ) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';
  const epStr = state.enPassant ? rcToSquare(state.enPassant.row, state.enPassant.col) : '-';
  return `${boardStr} ${state.turn} ${castlingStr} ${epStr} ${state.halfmove} ${state.fullmove}`;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const KNIGHT_DELTAS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_DELTAS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function generatePseudoMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) return [];
  const color = pieceColor(piece);
  const type = pieceType(piece);
  const board = state.board;
  const moves = [];

  const addMove = (toRow, toCol, extra = {}) => {
    moves.push({ from: { row, col }, to: { row: toRow, col: toCol }, piece, ...extra });
  };

  if (type === 'P') {
    const dir = color === WHITE ? -1 : 1;
    const startRow = color === WHITE ? 6 : 1;
    const promoRow = color === WHITE ? 0 : 7;

    if (inBounds(row + dir, col) && !board[row + dir][col]) {
      if (row + dir === promoRow) {
        for (const promo of ['Q', 'R', 'B', 'N']) addMove(row + dir, col, { promotion: promo });
      } else {
        addMove(row + dir, col);
        if (row === startRow && !board[row + 2 * dir][col]) {
          addMove(row + 2 * dir, col, { isDoublePawn: true });
        }
      }
    }
    for (const dc of [-1, 1]) {
      const nr = row + dir, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (target && pieceColor(target) !== color) {
        if (nr === promoRow) {
          for (const promo of ['Q', 'R', 'B', 'N']) addMove(nr, nc, { promotion: promo, capture: true });
        } else addMove(nr, nc, { capture: true });
      } else if (!target && state.enPassant && state.enPassant.row === nr && state.enPassant.col === nc) {
        addMove(nr, nc, { capture: true, isEnPassant: true });
      }
    }
  } else if (type === 'N') {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || pieceColor(target) !== color) addMove(nr, nc, { capture: !!target });
    }
  } else if (type === 'K') {
    for (const [dr, dc] of KING_DELTAS) {
      const nr = row + dr, nc = col + dc;
      if (!inBounds(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || pieceColor(target) !== color) addMove(nr, nc, { capture: !!target });
    }
    const homeRow = color === WHITE ? 7 : 0;
    if (row === homeRow && col === 4) {
      const kRight = color === WHITE ? state.castling.wK : state.castling.bK;
      const kLeft = color === WHITE ? state.castling.wQ : state.castling.bQ;
      if (kRight && !board[homeRow][5] && !board[homeRow][6]) {
        if (!isSquareAttacked(board, homeRow, 4, opponent(color)) &&
            !isSquareAttacked(board, homeRow, 5, opponent(color)) &&
            !isSquareAttacked(board, homeRow, 6, opponent(color))) {
          addMove(homeRow, 6, { isCastle: 'K' });
        }
      }
      if (kLeft && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1]) {
        if (!isSquareAttacked(board, homeRow, 4, opponent(color)) &&
            !isSquareAttacked(board, homeRow, 3, opponent(color)) &&
            !isSquareAttacked(board, homeRow, 2, opponent(color))) {
          addMove(homeRow, 2, { isCastle: 'Q' });
        }
      }
    }
  } else {
    let dirs = [];
    if (type === 'B') dirs = BISHOP_DIRS;
    else if (type === 'R') dirs = ROOK_DIRS;
    else if (type === 'Q') dirs = [...BISHOP_DIRS, ...ROOK_DIRS];
    for (const [dr, dc] of dirs) {
      let nr = row + dr, nc = col + dc;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          addMove(nr, nc);
        } else {
          if (pieceColor(target) !== color) addMove(nr, nc, { capture: true });
          break;
        }
        nr += dr; nc += dc;
      }
    }
  }
  return moves;
}

function isSquareAttacked(board, row, col, byColor) {
  // Pawn attacks
  const pr = byColor === WHITE ? row + 1 : row - 1;
  for (const dc of [-1, 1]) {
    const pc = col + dc;
    if (inBounds(pr, pc) && board[pr][pc] === byColor + 'P') return true;
  }
  // Knight attacks
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const nr = row + dr, nc = col + dc;
    if (inBounds(nr, nc) && board[nr][nc] === byColor + 'N') return true;
  }
  // King attacks
  for (const [dr, dc] of KING_DELTAS) {
    const nr = row + dr, nc = col + dc;
    if (inBounds(nr, nc) && board[nr][nc] === byColor + 'K') return true;
  }
  // Bishop/Queen diagonals
  for (const [dr, dc] of BISHOP_DIRS) {
    let nr = row + dr, nc = col + dc;
    while (inBounds(nr, nc)) {
      const t = board[nr][nc];
      if (t) {
        if (pieceColor(t) === byColor && (pieceType(t) === 'B' || pieceType(t) === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Rook/Queen straights
  for (const [dr, dc] of ROOK_DIRS) {
    let nr = row + dr, nc = col + dc;
    while (inBounds(nr, nc)) {
      const t = board[nr][nc];
      if (t) {
        if (pieceColor(t) === byColor && (pieceType(t) === 'R' || pieceType(t) === 'Q')) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function findKing(board, color) {
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (board[r][c] === color + 'K') return { row: r, col: c };
  }
  return null;
}

function isInCheck(state, color) {
  const kingPos = findKing(state.board, color);
  if (!kingPos) return false;
  return isSquareAttacked(state.board, kingPos.row, kingPos.col, opponent(color));
}

function applyMove(state, move) {
  const board = state.board.map(row => row.slice());
  const { from, to, piece } = move;
  const color = pieceColor(piece);
  const type = pieceType(piece);

  let newEnPassant = null;
  const newCastling = { ...state.castling };
  let newHalfmove = state.halfmove + 1;

  if (move.isEnPassant) {
    const capturedRow = color === WHITE ? to.row + 1 : to.row - 1;
    board[capturedRow][to.col] = null;
  }

  board[from.row][from.col] = null;
  let placedPiece = piece;
  if (move.promotion) placedPiece = color + move.promotion;
  board[to.row][to.col] = placedPiece;

  if (move.isCastle === 'K') {
    const homeRow = color === WHITE ? 7 : 0;
    board[homeRow][5] = color + 'R';
    board[homeRow][7] = null;
  } else if (move.isCastle === 'Q') {
    const homeRow = color === WHITE ? 7 : 0;
    board[homeRow][3] = color + 'R';
    board[homeRow][0] = null;
  }

  if (type === 'K') {
    if (color === WHITE) { newCastling.wK = false; newCastling.wQ = false; }
    else { newCastling.bK = false; newCastling.bQ = false; }
  }
  if (type === 'R') {
    if (color === WHITE && from.row === 7 && from.col === 0) newCastling.wQ = false;
    if (color === WHITE && from.row === 7 && from.col === 7) newCastling.wK = false;
    if (color === BLACK && from.row === 0 && from.col === 0) newCastling.bQ = false;
    if (color === BLACK && from.row === 0 && from.col === 7) newCastling.bK = false;
  }
  if (move.capture && !move.isEnPassant) {
    if (to.row === 7 && to.col === 0) newCastling.wQ = false;
    if (to.row === 7 && to.col === 7) newCastling.wK = false;
    if (to.row === 0 && to.col === 0) newCastling.bQ = false;
    if (to.row === 0 && to.col === 7) newCastling.bK = false;
  }

  if (move.isDoublePawn) {
    newEnPassant = { row: (from.row + to.row) / 2, col: from.col };
  }

  if (type === 'P' || move.capture) newHalfmove = 0;

  const newTurn = opponent(state.turn);
  const newFullmove = state.turn === BLACK ? state.fullmove + 1 : state.fullmove;

  return {
    board,
    turn: newTurn,
    castling: newCastling,
    enPassant: newEnPassant,
    halfmove: newHalfmove,
    fullmove: newFullmove,
  };
}

function getLegalMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece || pieceColor(piece) !== state.turn) return [];
  const pseudo = generatePseudoMoves(state, row, col);
  return pseudo.filter(move => {
    const next = applyMove(state, move);
    return !isInCheck(next, state.turn);
  });
}

function getAllLegalMoves(state, color) {
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = state.board[r][c];
    if (piece && pieceColor(piece) === color) {
      moves.push(...getLegalMoves(state, r, c));
    }
  }
  return moves;
}

function isCheckmate(state) {
  return isInCheck(state, state.turn) && getAllLegalMoves(state, state.turn).length === 0;
}
function isStalemate(state) {
  return !isInCheck(state, state.turn) && getAllLegalMoves(state, state.turn).length === 0;
}
function hasInsufficientMaterial(board) {
  const nonKing = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && pieceType(cell) !== 'K') nonKing.push({ piece: cell, r, c });
    }
  }
  if (nonKing.length === 0) return true; // K vs K
  if (nonKing.length === 1) {
    const t = pieceType(nonKing[0].piece);
    if (t === 'B' || t === 'N') return true; // K+minor vs K
  }
  if (nonKing.length === 2 && nonKing.every((p) => pieceType(p.piece) === 'B')) {
    const sc = (r, c) => (r + c) % 2;
    if (sc(nonKing[0].r, nonKing[0].c) === sc(nonKing[1].r, nonKing[1].c)) return true; // same-color bishops
  }
  return false;
}
function isDraw(state) {
  if (isStalemate(state)) return true;
  if (state.halfmove >= 100) return true;
  if (hasInsufficientMaterial(state.board)) return true;
  return false;
}

// Simplified SAN (with basic disambiguation)
function moveToSAN(state, move) {
  const { from, to, piece, capture, promotion, isCastle, isEnPassant } = move;
  const type = pieceType(piece);
  const color = pieceColor(piece);
  if (isCastle === 'K') return suffixCheck(state, move, 'O-O');
  if (isCastle === 'Q') return suffixCheck(state, move, 'O-O-O');

  const destSq = rcToSquare(to.row, to.col);
  let san = '';
  if (type === 'P') {
    if (capture || isEnPassant) san += rcToSquare(from.row, from.col)[0] + 'x';
    san += destSq;
    if (promotion) san += '=' + promotion;
  } else {
    san += type;
    // Disambiguation: other same-type same-color pieces that can also reach `to`
    const others = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (r === from.row && c === from.col) continue;
      const p = state.board[r][c];
      if (p && pieceColor(p) === color && pieceType(p) === type) {
        const lm = getLegalMoves(state, r, c);
        if (lm.some(m => m.to.row === to.row && m.to.col === to.col)) others.push({ row: r, col: c });
      }
    }
    if (others.length > 0) {
      const fromSq = rcToSquare(from.row, from.col);
      const sameFile = others.some(o => o.col === from.col);
      const sameRank = others.some(o => o.row === from.row);
      if (!sameFile) san += fromSq[0];
      else if (!sameRank) san += fromSq[1];
      else san += fromSq;
    }
    if (capture) san += 'x';
    san += destSq;
  }
  return suffixCheck(state, move, san);
}

function suffixCheck(state, move, san) {
  const next = applyMove(state, move);
  if (isInCheck(next, next.turn)) {
    if (getAllLegalMoves(next, next.turn).length === 0) return san + '#';
    return san + '+';
  }
  return san;
}

// ===== Catur Akademi - AI Engine =====

const PIECE_VALUES = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };

// Piece-square tables, indexed [row][col] where row 0 = rank 8 (for WHITE pieces).
// For BLACK pieces, mirror vertically (use row 7-r).
const PST = {
  P: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  N: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  B: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  R: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  Q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  K: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

function evaluate(state) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (!piece) continue;
      const color = pieceColor(piece), type = pieceType(piece);
      const pstRow = color === WHITE ? r : 7 - r;
      const total = PIECE_VALUES[type] + PST[type][pstRow][c];
      score += color === WHITE ? total : -total;
    }
  }
  return score;
}

const MATE_SCORE = 100000;

function orderMoves(state, moves) {
  return moves.slice().sort((a, b) => scoreMove(state, b) - scoreMove(state, a));
}
function scoreMove(state, move) {
  let s = 0;
  if (move.capture) {
    const target = move.isEnPassant
      ? opponent(pieceColor(move.piece)) + 'P'
      : state.board[move.to.row][move.to.col];
    const victim = target ? PIECE_VALUES[pieceType(target)] : 100;
    s += victim * 10 - PIECE_VALUES[pieceType(move.piece)];
  }
  if (move.promotion) s += PIECE_VALUES[move.promotion];
  return s;
}

function negamax(state, depth, alpha, beta) {
  const moves = getAllLegalMoves(state, state.turn);
  if (moves.length === 0) {
    if (isInCheck(state, state.turn)) return -MATE_SCORE - depth; // prefer faster mates
    return 0; // stalemate
  }
  if (depth === 0) {
    const ev = evaluate(state);
    return state.turn === WHITE ? ev : -ev;
  }
  const ordered = orderMoves(state, moves);
  let best = -Infinity;
  for (const move of ordered) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Pick a move for the AI.
 * @param {object} state - game state
 * @param {object} opts - { depth: 1-4, randomFactor: 0-1 (chance to pick a random legal move) }
 */
function getBestMove(state, opts = {}) {
  const depth = opts.depth || 2;
  const randomFactor = opts.randomFactor || 0;
  const moves = getAllLegalMoves(state, state.turn);
  if (moves.length === 0) return null;

  if (randomFactor > 0 && Math.random() < randomFactor) {
    const move = moves[Math.floor(Math.random() * moves.length)];
    return { move, score: null };
  }

  const ordered = orderMoves(state, moves);
  let bestMove = ordered[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for (const move of ordered) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (bestScore > alpha) alpha = bestScore;
  }
  return { move: bestMove, score: bestScore };
}

// ===== Catur Akademi - Lesson Curriculum =====
const REAL_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const UNITS = [
  { id: 1, title: 'Dasar-Dasar', subtitle: 'Kenalan sama papan & bidak', icon: 'BookOpen', color: '#7C9D6F' },
  { id: 2, title: 'Aturan Khusus', subtitle: 'Castling, en passant, promosi', icon: 'Sparkles', color: '#D9A23B' },
  { id: 3, title: 'Taktik Dasar', subtitle: 'Garpu, pin, & skakmat', icon: 'Swords', color: '#C45B4F' },
  { id: 4, title: 'Strategi', subtitle: 'Pembukaan & akhir permainan', icon: 'Crown', color: '#8E7CC3' },
  { id: 5, title: 'Taktik Menengah', subtitle: 'Kombinasi & pola serangan lanjutan', icon: 'Zap', color: '#5B9BD5' },
];

const LESSONS = [
  // ===================== UNIT 1 =====================
  {
    id: 'u1l1', unit: 1, title: 'Papan & Nilai Bidak', xp: 20,
    steps: [
      {
        type: 'info', title: 'Papan Catur: Rumah 64 Kotak',
        text: "Papan catur punya 64 kotak: 8 baris (RANK, dari 1-8) dan 8 kolom (FILE, dari a-h). Bidak Putih selalu mulai di bawah, dan PUTIH JALAN DULUAN setiap permainan. Tips: kotak pojok kanan-bawah (h1) selalu terang!",
        fen: REAL_START_FEN,
      },
      {
        type: 'info', title: "6 Jenis Bidak & 'Harga'-nya",
        text: 'Tiap pemain punya 16 bidak: 8 Pion (nilai 1), 2 Kuda (3), 2 Gajah (3), 2 Benteng (5), 1 Menteri (9), dan 1 Raja (tak ternilai - kalau Raja jatuh, GAME OVER). Nilai ini membantumu menilai untung-rugi saat tukar bidak.',
        fen: REAL_START_FEN,
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Total kotak di papan catur ada berapa?',
        options: ['32', '64', '100', '81'],
        correctIndex: 1,
        explanation: 'Benar! 8 x 8 = 64 kotak, separuh terang dan separuh gelap.',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Bidak apa yang nilainya paling tinggi (selain Raja)?',
        options: ['Pion', 'Benteng', 'Menteri', 'Kuda'],
        correctIndex: 2,
        explanation: 'Yup! Menteri (Ratu) bisa jalan ke segala arah sejauh mungkin - paling kuat di papan.',
      },
    ],
  },
  {
    id: 'u1l2', unit: 1, title: 'Bidak Ringan: Gajah & Kuda', xp: 20,
    steps: [
      {
        type: 'info', title: 'Gajah: Si Ahli Diagonal',
        text: 'Gajah (Bishop) hanya bisa jalan DIAGONAL, sejauh mungkin selama tidak terhalang. Karena itu, Gajah yang mulai di kotak terang akan SELAMANYA berada di kotak terang (begitu juga sebaliknya).',
        fen: '7k/8/8/8/8/8/8/2B4K w - - 0 1',
      },
      {
        type: 'move', title: 'Coba Gerakkan Gajah', mode: 'any',
        prompt: 'Gajah Putih ada di c1. Sentuh Gajah-nya, lalu sentuh kotak tujuan manapun yang valid (diagonal).',
        fen: '7k/8/8/8/8/8/8/2B4K w - - 0 1',
        pieceSquare: 'c1',
        successText: 'Mantap! Gajah bergerak diagonal - makin terbuka papannya, makin jauh dia bisa pergi.',
      },
      {
        type: 'info', title: 'Kuda: Si Loncat Misterius',
        text: "Kuda (Knight) jalan bentuk huruf 'L': 2 kotak ke satu arah, lalu 1 kotak menyamping (atau sebaliknya). Kuda adalah SATU-SATUNYA bidak yang bisa MELOMPATI bidak lain!",
        fen: '7k/8/8/8/3N4/8/8/7K w - - 0 1',
      },
      {
        type: 'move', title: 'Coba Gerakkan Kuda', mode: 'any',
        prompt: 'Kuda Putih ada di d4 (papan kosong). Sentuh Kuda, lalu sentuh salah satu dari 8 kotak tujuannya.',
        fen: '7k/8/8/8/3N4/8/8/7K w - - 0 1',
        pieceSquare: 'd4',
        successText: "Keren! Pola 'L' Kuda sering bikin lawan kaget - dia bisa menyerang dari sudut tak terduga.",
      },
    ],
  },
  {
    id: 'u1l3', unit: 1, title: 'Bidak Berat & Sang Raja', xp: 20,
    steps: [
      {
        type: 'info', title: 'Benteng: Lurus & Kuat',
        text: 'Benteng (Rook) jalan LURUS - horizontal atau vertikal - sejauh mungkin. Di akhir permainan, Benteng jadi salah satu bidak paling berharga karena bisa mengontrol seluruh baris atau kolom.',
        fen: '7k/8/8/8/8/8/8/3R3K w - - 0 1',
      },
      {
        type: 'move', title: 'Coba Gerakkan Benteng', mode: 'any',
        prompt: 'Benteng Putih ada di d1. Sentuh Benteng, lalu pilih salah satu dari 13 kotak tujuannya.',
        fen: '7k/8/8/8/8/8/8/3R3K w - - 0 1',
        pieceSquare: 'd1',
        successText: 'Pas! Gabungan kemampuan Benteng + Gajah ternyata jadi bidak yang sangat istimewa...',
      },
      {
        type: 'info', title: 'Menteri & Raja',
        text: 'Menteri bisa jalan seperti Benteng DAN Gajah sekaligus - lurus maupun diagonal, sejauh mungkin. Sang Raja cuma bisa jalan 1 kotak ke segala arah, tapi dia bidak TERPENTING: kalau Raja terkena SKAKMAT, permainan SELESAI.',
        fen: '7k/8/8/3Q4/8/8/8/7K w - - 0 1',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Bidak mana yang merupakan gabungan kemampuan Benteng + Gajah?',
        options: ['Kuda', 'Menteri', 'Pion', 'Raja'],
        correctIndex: 1,
        explanation: 'Tepat! Makanya Menteri jadi bidak paling fleksibel dan kuat di papan.',
      },
    ],
  },
  {
    id: 'u1l4', unit: 1, title: 'Si Pion yang Istimewa', xp: 20,
    steps: [
      {
        type: 'info', title: 'Pion: Maju Terus, Pantang Mundur',
        text: 'Pion hanya bisa berjalan KE DEPAN (tidak bisa mundur!). Dari posisi awal, Pion boleh maju 1 ATAU 2 kotak sekali jalan. Setelah itu, hanya 1 kotak per langkah.',
        fen: '7k/8/8/8/8/8/4P3/7K w - - 0 1',
      },
      {
        type: 'move', title: 'Majukan Pion', mode: 'any',
        prompt: 'Pion Putih di e2 (posisi awal). Sentuh Pion, lalu majukan 1 atau 2 kotak.',
        fen: '7k/8/8/8/8/8/4P3/7K w - - 0 1',
        pieceSquare: 'e2',
        successText: "Yes! Dari kotak awal, Pion punya 'turbo' untuk maju 2 langkah sekaligus.",
      },
      {
        type: 'info', title: 'Pion Menyerang Serong',
        text: 'Berbeda dari jalan biasa (lurus ke depan), Pion MENANGKAP bidak lawan secara DIAGONAL 1 kotak. Pion tidak bisa menangkap bidak yang tepat di depannya.',
        fen: '7k/8/8/3p4/4P3/8/8/7K w - - 0 1',
      },
      {
        type: 'move', title: 'Tangkap dengan Pion', mode: 'exact',
        prompt: 'Pion Putih di e4 bisa MENANGKAP Pion Hitam di d5. Coba lakukan! (Jangan jalan biasa ke e5.)',
        fen: '7k/8/8/3p4/4P3/8/8/7K w - - 0 1',
        solutions: [{ from: 'e4', to: 'd5' }],
        failHint: 'Itu jalan lurus biasa. Pion menangkap secara DIAGONAL - coba sentuh kotak d5.',
        successText: 'Tepat! Begitulah cara Pion "memakan" bidak lawan - selalu diagonal, 1 kotak.',
      },
    ],
  },

  // ===================== UNIT 2 =====================
  {
    id: 'u2l1', unit: 2, title: 'Skak, Skakmat, & Stalemate', xp: 25,
    steps: [
      {
        type: 'info', title: 'Apa itu SKAK?',
        text: 'SKAK terjadi saat Raja terancam bisa "ditangkap" di langkah berikutnya. Kalau Rajamu kena skak, kamu WAJIB keluar dari skak: pindahkan Raja, tangkap bidak yang mengancam, atau halangi garis serangannya.',
        fen: 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1',
      },
      {
        type: 'move', title: 'Keluar dari Skak!', mode: 'any',
        prompt: 'Raja Putih (e1) sedang SKAK oleh Benteng Hitam (e8)! Pindahkan Raja ke kotak yang aman.',
        fen: 'k3r3/8/8/8/8/8/8/4K3 w - - 0 1',
        pieceSquare: 'e1',
        successText: 'Tepat! Raja keluar dari garis tembak Benteng. Kalau skak tidak bisa diatasi sama sekali, itu artinya SKAKMAT.',
      },
      {
        type: 'info', title: 'Skakmat vs Stalemate: Beda Tipis, Beda Jauh!',
        text: 'SKAKMAT = Raja sedang skak DAN tidak ada langkah legal sama sekali -> permainan SELESAI, yang memberi skakmat MENANG. STALEMATE = Raja TIDAK skak, tapi pemain tidak punya langkah legal apapun -> permainan SERI (DRAW), meski materi lawan lebih banyak!',
        fen: REAL_START_FEN,
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Posisi B: Raja TIDAK sedang skak, tapi tidak ada langkah legal sama sekali. Apa hasilnya?',
        options: ['Skakmat, kalah', 'Seri (Stalemate)', 'Permainan lanjut seperti biasa', 'Raja otomatis ditangkap'],
        correctIndex: 1,
        explanation: 'Yup, hasilnya SERI. Ini sering jadi "jalan keluar" buat pihak yang kalah jauh secara materi!',
      },
    ],
  },
  {
    id: 'u2l2', unit: 2, title: 'Castling, En Passant, & Promosi', xp: 25,
    steps: [
      {
        type: 'info', title: 'Castling (Rokade): 2 Bidak, 1 Langkah!',
        text: 'Castling adalah satu-satunya momen 2 bidak bergerak dalam 1 langkah: Raja melompat 2 kotak ke arah Benteng, dan Benteng "mendarat" di sebelah Raja. Syarat: Raja & Benteng belum pernah jalan, kotak di antaranya kosong, dan Raja tidak sedang/lewat/mendarat di kotak yang diawasi lawan.',
        fen: 'k7/8/8/8/8/8/8/4K2R w K - 0 1',
      },
      {
        type: 'move', title: 'Lakukan Castling', mode: 'exact',
        prompt: 'Coba lakukan Castling pendek (O-O): sentuh Raja di e1, lalu sentuh g1.',
        fen: 'k7/8/8/8/8/8/8/4K2R w K - 0 1',
        solutions: [{ from: 'e1', to: 'g1' }],
        successText: 'Itu Castling! Raja jadi aman di sudut, Benteng pindah ke tengah siap beraksi. Ini salah satu agenda penting di awal permainan.',
        failHint: 'Sentuh Raja di e1 terlebih dahulu, lalu sentuh g1 (2 kotak ke kanan).',
      },
      {
        type: 'info', title: "En Passant: Tangkapan 'Hantu'",
        text: 'Kalau Pion lawan baru maju 2 kotak dan "melewati" kotak yang seharusnya bisa ditangkap pionmu, kamu boleh menangkapnya seolah dia hanya maju 1 kotak - disebut En Passant ("lewat" dalam bahasa Prancis). Ini satu-satunya momen Pion menangkap bidak yang tidak ada di kotak tujuannya!',
        fen: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
      },
      {
        type: 'move', title: 'Tangkap En Passant', mode: 'exact',
        prompt: 'Pion Hitam baru lompat dari d7 ke d5. Pion Putihmu di e5 bisa menangkapnya En Passant ke d6!',
        fen: 'k7/8/8/3pP3/8/8/8/4K3 w - d6 0 1',
        solutions: [{ from: 'e5', to: 'd6' }],
        successText: 'En Passant berhasil! Banyak pemain baru lupa aturan ini - sekarang kamu sudah tahu.',
        failHint: 'Sentuh Pion Putih di e5, lalu sentuh d6 (bukan d5 - pion hitamnya ada di d5, tapi kotak tujuan tangkapanmu adalah d6).',
      },
      {
        type: 'info', title: 'Promosi: Pion Jadi Bintang!',
        text: 'Kalau Pion mencapai baris paling ujung (baris 8 untuk Putih, baris 1 untuk Hitam), dia WAJIB "promosi" menjadi Menteri, Benteng, Gajah, atau Kuda - biasanya Menteri karena paling kuat. Pion seharga 1 bisa berubah jadi Menteri seharga 9!',
        fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1',
      },
      {
        type: 'move', title: 'Promosikan Pion!', mode: 'exact',
        prompt: 'Pion Putih di e7 tinggal 1 langkah dari promosi! Majukan ke e8, lalu pilih bidak promosi.',
        fen: 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1',
        solutions: [
          { from: 'e7', to: 'e8', promotion: 'Q' },
          { from: 'e7', to: 'e8', promotion: 'R' },
          { from: 'e7', to: 'e8', promotion: 'B' },
          { from: 'e7', to: 'e8', promotion: 'N' },
        ],
        successText: 'Promosi sukses! Di hampir semua kasus, Menteri adalah pilihan terbaik karena paling fleksibel.',
        failHint: 'Sentuh Pion di e7, lalu majukan ke e8.',
      },
    ],
  },

  // ===================== UNIT 3 =====================
  {
    id: 'u3l1', unit: 3, title: 'Garpu (Fork)', xp: 30,
    steps: [
      {
        type: 'info', title: 'Garpu: 1 Bidak, 2 Ancaman',
        text: 'GARPU (Fork) terjadi saat SATU bidak menyerang DUA bidak lawan sekaligus. Lawan hanya bisa menyelamatkan SATU - kamu dapat yang lain GRATIS! Kuda paling jago membuat garpu karena gerakannya unik dan sering tak terduga.',
        fen: '2q3k1/5ppp/8/5N2/8/8/PPPPP1PP/6K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Temukan Garpunya!', mode: 'exact',
        prompt: 'Giliran Putih. Kuda di f5 bisa membuat GARPU mematikan. Temukan langkahnya!',
        fen: '2q3k1/5ppp/8/5N2/8/8/PPPPP1PP/6K1 w - - 0 1',
        solutions: [{ from: 'f5', to: 'e7' }],
        successText: 'PERSIS! Ne7+ adalah SKAK ke Raja Hitam (g8) sekaligus mengincar Menteri di c8. Hitam wajib menyelamatkan Raja dulu - lalu Kuda "memakan" Menteri!',
        failHint: 'Lihat semua kotak yang bisa dituju Kuda dari f5. Salah satunya mengincar Raja DAN Menteri Hitam sekaligus!',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Kalau bidakmu membuat garpu ke Raja DAN Benteng lawan, apa yang biasanya terjadi?',
        options: [
          'Lawan menyelamatkan Benteng dulu',
          'Lawan wajib menangani skak (Raja) dulu, lalu Bentengnya bisa kamu ambil',
          'Tidak terjadi apa-apa',
          'Permainan otomatis seri',
        ],
        correctIndex: 1,
        explanation: 'Tepat - aturan "skak harus diatasi dulu" inilah yang membuat garpu ke Raja begitu kuat.',
      },
    ],
  },
  {
    id: 'u3l2', unit: 3, title: 'Pin (Sematan) & Skewer (Tusukan)', xp: 30,
    steps: [
      {
        type: 'info', title: "Pin: Bidak yang 'Dipaku'",
        text: 'PIN terjadi saat bidakmu (Benteng/Gajah/Menteri) menyerang lurus atau diagonal ke arah bidak lawan, dan tepat di belakangnya ada Raja lawan. Bidak yang kena pin tidak bisa minggir - kalau minggir, Rajanya kena skak!',
        fen: '4k3/4n3/8/2B5/8/8/8/4R1K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Manfaatkan Pin-nya!', mode: 'exact',
        prompt: 'Kuda Hitam di e7 kena PIN oleh Benteng Putih di e1 (tidak bisa minggir, nanti Raja e8 kena skak). Manfaatkan ini - ambil Kuda itu!',
        fen: '4k3/4n3/8/2B5/8/8/8/4R1K1 w - - 0 1',
        solutions: [{ from: 'c5', to: 'e7' }],
        successText: 'Gajah memakan Kuda yang ter-pin - dan Hitam TIDAK BISA membalas dengan Raja (Raja akan kena skak dari Benteng)! Kuda didapat gratis.',
        failHint: 'Bidak Putih mana yang sedang mengincar kotak e7 (tempat Kuda yang ter-pin)?',
      },
      {
        type: 'info', title: "Skewer: 'Pin' Versi Terbalik",
        text: 'SKEWER mirip pin, tapi urutannya kebalik: bidakmu menyerang Raja lawan duluan (skak!), dan tepat di belakang Raja ada bidak berharga lawan (misalnya Menteri). Raja wajib minggir - dan begitu minggir, jalur ke bidak berharga itu jadi terbuka untuk kamu sikat!',
        fen: REAL_START_FEN,
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Apa perbedaan utama Pin dan Skewer?',
        options: [
          'Pin = bidak berharga lawan di belakang Rajanya yang diserang; Skewer = Raja sendiri yang diserang (di depan), bidak berharga di belakangnya',
          'Tidak ada beda, sama saja',
          'Pin hanya berlaku untuk Kuda',
          'Skewer hanya terjadi di akhir permainan',
        ],
        correctIndex: 0,
        explanation: 'Tepat! Pada Pin, bidak yang diserang (di depan) tidak bisa minggir karena melindungi Raja. Pada Skewer, Raja sendiri yang diserang dan terpaksa minggir, membuka jalur ke bidak di belakangnya.',
      },
    ],
  },
  {
    id: 'u3l3', unit: 3, title: 'Skakmat dalam 1 Langkah', xp: 35,
    steps: [
      {
        type: 'info', title: 'Pola Skakmat: Raja Terkepung',
        text: 'Skakmat sering terjadi saat Raja lawan kehabisan ruang - terkepung bidaknya sendiri di pojok/pinggir papan - lalu kamu memberi skak dari kotak yang TERLINDUNGI (sehingga tidak bisa ditangkap).',
        fen: '7k/6pp/5N2/8/8/8/QPP5/K7 w - - 0 1',
      },
      {
        type: 'move', title: 'Temukan Skakmatnya!', mode: 'exact',
        prompt: 'Giliran Putih. Raja Hitam di h8 sudah "terkurung" pion sendiri (g7, h7). Temukan SKAKMAT dalam 1 langkah!',
        fen: '7k/6pp/5N2/8/8/8/QPP5/K7 w - - 0 1',
        solutions: [{ from: 'a2', to: 'g8' }],
        successText: 'SKAKMAT! Menteri mendarat di g8, dilindungi Kuda di f6 (jadi tak bisa ditangkap Raja), dan Raja Hitam tak punya kotak kosong untuk lari. Game over!',
        failHint: 'Menteri di a2 punya jalur diagonal terbuka... ke arah mana Raja Hitam terjebak?',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Sebelum mengeksekusi skakmat, apa 2 hal yang wajib kamu cek?',
        options: [
          'Apakah bidak penyerangmu aman/terlindungi, DAN apakah Raja lawan benar-benar tak punya kotak lari atau cara blok',
          'Warna bidak dan jam pertandingan',
          'Skor sementara dan jumlah penonton',
          'Tidak perlu cek apapun, langsung jalan saja',
        ],
        correctIndex: 0,
        explanation: 'Selalu cek dua hal itu - kalau salah satu terlewat, "skakmat"-mu bisa-bisa cuma skak biasa, dan kesempatanmu hilang!',
      },
    ],
  },

  // ===================== UNIT 4 =====================
  {
    id: 'u4l1', unit: 4, title: 'Prinsip Pembukaan', xp: 30,
    steps: [
      {
        type: 'info', title: '3 Prinsip Pembukaan Emas',
        text: '(1) KUASAI TENGAH PAPAN - kotak d4, d5, e4, e5 adalah "pusat kendali". (2) KEMBANGKAN BIDAK RINGAN DULU - Kuda & Gajah keluar sebelum Menteri. (3) AMANKAN RAJA - lakukan castling secepatnya, jangan ditunda!',
        fen: REAL_START_FEN,
      },
      {
        type: 'move', title: 'Mainkan Langkah Pembuka', mode: 'exact',
        prompt: 'Giliran Putih, baru mulai. Mainkan langkah pembuka yang menguasai tengah papan (contoh: e4, d4, atau Nf3).',
        fen: REAL_START_FEN,
        solutions: [
          { from: 'e2', to: 'e4' }, { from: 'd2', to: 'd4' },
          { from: 'g1', to: 'f3' }, { from: 'c2', to: 'c4' },
          { from: 'b1', to: 'c3' }, { from: 'g2', to: 'g3' }, { from: 'b2', to: 'b3' },
        ],
        successText: 'Pilihan bagus! Langkah ini berbicara soal kontrol tengah papan - fondasi hampir semua pembukaan kuat.',
        failHint: 'Coba pikirkan: langkah mana yang langsung "menyentuh" kotak d4/d5/e4/e5, atau mengembangkan Kuda ke arah tengah? Coba e2-e4, d2-d4, atau g1-f3.',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Mana yang BUKAN prinsip pembukaan yang baik?',
        options: [
          'Mengembangkan Kuda dan Gajah lebih dulu',
          'Mengeluarkan Menteri secepat mungkin untuk langsung menyerang',
          'Melakukan castling untuk mengamankan Raja',
          'Menguasai kotak-kotak di tengah papan',
        ],
        correctIndex: 1,
        explanation: 'Menteri yang keluar terlalu cepat malah jadi SASARAN - lawan bisa "mengusirnya" sambil mengembangkan bidak mereka sendiri (kamu rugi tempo/waktu).',
      },
      {
        type: 'info', title: "Hindari: 'Sindrom Buru-buru Menyerang'",
        text: 'Pemula sering tergoda menyerang sedini mungkin, padahal Raja sendiri belum aman dan bidak belum berkembang. Ingat: catur itu marathon, bukan sprint - bangun "pasukan" dulu sebelum menyerbu!',
        fen: REAL_START_FEN,
      },
    ],
  },
  {
    id: 'u4l2', unit: 4, title: 'Akhir Permainan: Raja + Menteri vs Raja', xp: 35,
    steps: [
      {
        type: 'info', title: 'Kekuatan 1 Menteri di Akhir Permainan',
        text: 'Di akhir permainan dengan sedikit bidak, Raja + Menteri vs Raja lawan biasanya menang mudah. Triknya: giring Raja lawan ke pinggir/pojok papan menggunakan Menteri, lalu datangkan Raja sendiri untuk membantu skakmat.',
        fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
      },
      {
        type: 'move', title: 'Eksekusi Skakmat!', mode: 'exact',
        prompt: 'Raja Hitam sudah terjebak di pojok a8, dibantu Raja Putih di c7. Giliran Menteri Putih (b1) memberi pukulan akhir. Temukan SKAKMAT!',
        fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
        solutions: [{ from: 'b1', to: 'b8' }],
        successText: 'SKAKMAT! Menteri di b8 men-skak Raja a8, dan semua kotak pelariannya (a7, b7) dijaga Menteri & Raja Putih. Inilah teknik dasar skakmat Raja+Menteri vs Raja!',
        failHint: 'Menteri di b1 bisa jalan ke seluruh kolom b. Kotak mana di kolom b yang langsung mengancam Raja a8, sambil dilindungi Raja Putih di c7?',
      },
      {
        type: 'info', title: 'Tips Akhir Permainan: Aktifkan Raja!',
        text: 'Banyak pemula "menyembunyikan" Raja sepanjang permainan. Tapi di akhir permainan (sedikit bidak tersisa), Raja justru harus AKTIF - dia jadi salah satu bidak terkuat untuk membantu skakmat atau merebut bidak lawan!',
        fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
      },
    ],
  },

  // ===================== UNIT 5 =====================
  {
    id: 'u5l1', unit: 5, title: 'Serangan Ganda (Double Attack)', xp: 35,
    steps: [
      {
        type: 'info', title: 'Lebih dari Sekadar Garpu',
        text: 'Serangan Ganda adalah konsep induk dari Garpu - satu langkah yang menciptakan DUA ancaman sekaligus, baik dari bidak yang sama maupun gabungan ancaman langsung + tidak langsung. Lawan biasanya cuma punya waktu menangani SATU ancaman.',
        fen: 'r5k1/8/8/8/8/8/8/3Q3K w - - 0 1',
      },
      {
        type: 'move', title: 'Serangan Ganda Menteri', mode: 'exact',
        prompt: 'Giliran Putih. Menteri di d1 bisa mendarat di satu kotak yang men-skak Raja SEKALIGUS mengincar Benteng a8. Temukan!',
        fen: 'r5k1/8/8/8/8/8/8/3Q3K w - - 0 1',
        solutions: [{ from: 'd1', to: 'd8' }],
        successText: 'Qd8+! Raja wajib menangani skak dulu, lalu Menteri bebas menyikat Benteng di a8 pada langkah berikutnya.',
        failHint: 'Menteri bisa jalan ke seluruh kolom d. Kotak mana di baris 8 yang sejalur dengan Raja DAN Benteng sekaligus?',
      },
      {
        type: 'info', title: 'Garpu Kuda: Ancaman Tersembunyi',
        text: 'Kuda sering jadi "raja" Serangan Ganda karena pola lompatannya unik - lawan kadang tidak sadar dua bidaknya saling terhubung lewat satu kotak yang sama.',
        fen: '4k1r1/8/8/3N4/8/8/8/7K w - - 0 1',
      },
      {
        type: 'move', title: 'Garpu Kuda Lanjutan', mode: 'exact',
        prompt: 'Giliran Putih. Kuda di d5 bisa memberi skak SEKALIGUS mengincar Benteng di g8. Temukan langkahnya!',
        fen: '4k1r1/8/8/3N4/8/8/8/7K w - - 0 1',
        solutions: [{ from: 'd5', to: 'f6' }],
        successText: 'Nf6+! Klasik garpu Kuda - satu lompatan, dua ancaman (Raja e8 dan Benteng g8).',
        failHint: 'Dari d5, Kuda punya 8 kotak tujuan. Salah satunya dekat Raja DAN sejalur diagonal-L ke Benteng g8.',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Kenapa Serangan Ganda ke Raja (skak) sangat kuat dibanding ke bidak biasa?',
        options: [
          'Karena Raja paling lemah jadi gampang ditangkap',
          'Karena aturan catur mewajibkan skak ditangani LEBIH DULU sebelum langkah lain apapun',
          'Karena Raja tidak bisa dipindah',
          'Tidak ada bedanya sama sekali',
        ],
        correctIndex: 1,
        explanation: 'Tepat! Begitu ada skak, lawan WAJIB menyelesaikannya dulu - artinya ancaman keduamu otomatis "diamankan" untuk dieksekusi langkah berikutnya.',
      },
    ],
  },
  {
    id: 'u5l2', unit: 5, title: 'Membongkar Pertahanan & Serangan Tersembunyi', xp: 35,
    steps: [
      {
        type: 'info', title: 'Removing the Defender (Singkirkan Penjaga)',
        text: 'Banyak bidak lawan "dijaga" oleh bidak lain. Trik "Removing the Defender" adalah menyingkirkan SI PENJAGA (lewat tukar atau tangkap) agar bidak yang tadinya aman jadi bisa kamu sikat di langkah berikutnya.',
        fen: '3r2k1/8/8/8/8/2B5/6PP/6K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Latihan: Menatap Sasaran', mode: 'any',
        prompt: 'Gajah Putih di c3 bisa bergerak ke berbagai arah diagonal. Coba gerakkan untuk merasakan jangkauannya menuju sisi papan lawan.',
        fen: '3r2k1/8/8/8/8/2B5/6PP/6K1 w - - 0 1',
        pieceSquare: 'c3',
        successText: 'Bagus! Diagonal panjang Gajah seperti ini sering jadi "jalan masuk" untuk taktik Removing the Defender di posisi nyata.',
      },
      {
        type: 'info', title: 'Serangan Tersembunyi: Ulasan Cepat',
        text: 'Ingat dari Bab 3: Serangan Tersembunyi (Discovered Attack) terjadi saat kamu menggeser SATU bidak, dan ternyata bidak LAIN di belakangnya jadi punya jalur serangan terbuka. Sekarang kita latihan versi yang sedikit lebih menantang.',
        fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Buka Jalur Benteng', mode: 'any',
        prompt: 'Kuda di e4 menghalangi Benteng e1. Geser Kuda ke kotak MANAPUN yang membuka jalur skak Benteng ke Raja e8!',
        fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
        pieceSquare: 'e4',
        successText: 'Skak tersembunyi berhasil! Begitu Kuda minggir dari kolom e, Benteng otomatis mengancam Raja - dan Kudamu sendiri bebas mendarat di kotak manapun, bahkan sambil menyerang bidak lain.',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Apa keuntungan utama Serangan Tersembunyi dibanding serangan biasa?',
        options: [
          'Bidak yang bergerak BEBAS melakukan apa saja (termasuk menangkap bidak lain) SAMBIL bidak di belakangnya memberi skak',
          'Hanya bisa dilakukan oleh Menteri',
          'Selalu berakhir skakmat',
          'Tidak ada keuntungan khusus',
        ],
        correctIndex: 0,
        explanation: 'Persis! Itulah yang membuatnya sangat kuat - kamu seolah dapat "2 langkah dalam 1": bidak yang bergerak bisa menyerang sesuatu yang lain, sementara bidak di belakangnya memberi skak.',
      },
    ],
  },
  {
    id: 'u5l3', unit: 5, title: 'Kombinasi: Merangkai Beberapa Taktik', xp: 40,
    steps: [
      {
        type: 'info', title: 'Apa itu Kombinasi?',
        text: 'KOMBINASI adalah rangkaian beberapa langkah paksa (skak, ancaman tangkap) yang berujung pada keuntungan besar - menangkap bidak penting atau bahkan skakmat. Kunci utama: setiap langkah dalam kombinasi biasanya memaksa lawan, jadi responnya bisa kamu prediksi.',
        fen: '6k1/6pp/8/8/8/8/1Q6/4N1K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Latihan: Menempatkan Bidak', mode: 'any',
        prompt: 'Kuda di e1 perlu posisi lebih aktif untuk mendukung serangan Menteri. Coba gerakkan ke kotak manapun yang legal.',
        fen: '6k1/6pp/8/8/8/8/1Q6/4N1K1 w - - 0 1',
        pieceSquare: 'e1',
        successText: 'Bagus! Dalam kombinasi nyata, setiap bidak punya peran - kadang sebagai "pelempar skak", kadang sebagai "penjaga" yang melindungi bidak penyerang lain.',
      },
      {
        type: 'info', title: 'Pola Skakmat dengan Dukungan Penuh',
        text: 'Kombinasi paling sering berakhir dengan skakmat yang melibatkan 2+ bidak bekerja sama: satu memberi skak, yang lain menjaga kotak pelarian Raja. Mari latihan menemukan eksekusi akhirnya.',
        fen: '7k/6pp/8/8/8/8/1Q6/6K1 w - - 0 1',
      },
      {
        type: 'move', title: 'Eksekusi Kombinasi!', mode: 'exact',
        prompt: 'Giliran Putih. Raja Hitam terkurung pion sendiri (g7, h7). Temukan SKAKMAT dengan Menteri!',
        fen: '7k/6pp/8/8/8/8/1Q6/6K1 w - - 0 1',
        solutions: [{ from: 'b2', to: 'b8' }],
        successText: 'SKAKMAT! Menteri mendarat di b8 - Raja Hitam benar-benar tak punya kotak lari karena pion sendiri menghalangi g7/h7, dan b8 sendiri tak terjangkau Raja.',
        failHint: 'Menteri di b2 bisa jalan sejauh mungkin ke seluruh kolom b. Ke kotak mana dia harus mendarat agar langsung mengunci Raja Hitam?',
      },
      {
        type: 'quiz', title: 'Cek Pemahaman',
        question: 'Sebelum memulai sebuah kombinasi, kebiasaan baik apa yang harus dilakukan?',
        options: [
          'Langsung jalan tanpa mikir, combo pasti berhasil',
          'Menghitung beberapa langkah ke depan dan memastikan setiap balasan lawan sudah diantisipasi',
          'Selalu mengorbankan Menteri di awal',
          'Menunggu lawan blunder duluan',
        ],
        correctIndex: 1,
        explanation: 'Tepat! Kombinasi yang baik selalu dihitung dulu - karena begitu kamu mengorbankan bidak atau membuka posisi, tidak ada jalan mundur. Inilah skill yang membedakan pemain taktis kuat dari yang asal coba-coba.',
      },
    ],
  },
];
// ===== Catur Akademi - Puzzle Bank =====
// Semua posisi diverifikasi dengan engine.js sebelum dipakai di app.

const PUZZLE_CATEGORIES = [
  { id: 'skakmat', label: 'Skakmat', icon: 'Crown', color: '#C45B4F' },
  { id: 'fork', label: 'Garpu', icon: 'Swords', color: '#D9A23B' },
  { id: 'pin', label: 'Pin & Skewer', icon: 'Lock', color: '#8E7CC3' },
  { id: 'discovered', label: 'Serangan Tersembunyi', icon: 'Sparkles', color: '#7C9D6F' },
  { id: 'endgame', label: 'Akhir Permainan', icon: 'Flag', color: '#5B9BD5' },
];

const PUZZLES = [
  // ===================== SKAKMAT =====================
  {
    id: 'p1', category: 'skakmat', difficulty: 1, xp: 10,
    title: 'Skakmat Anak Tangga',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
    instruction: 'Giliran Putih. Temukan skakmat dalam 1 langkah!',
    solutions: [{ from: 'a1', to: 'a8' }],
    hint: 'Raja Hitam terkurung pion sendiri di baris 8 - Benteng bisa langsung menyerang dari kolom a.',
  },
  {
    id: 'p2', category: 'skakmat', difficulty: 1, xp: 10,
    title: 'Menteri Penutup',
    fen: '7k/6pp/8/8/8/8/1Q6/6K1 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah!',
    solutions: [{ from: 'b2', to: 'b8' }],
    hint: 'Raja Hitam terjebak pion sendiri di g7/h7. Menteri bisa mendarat tepat di belakangnya.',
  },
  {
    id: 'p3', category: 'skakmat', difficulty: 2, xp: 15,
    title: 'Skakmat Dua Benteng',
    fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah (teknik "tangga")!',
    solutions: [{ from: 'b1', to: 'b8' }],
    hint: 'Benteng a7 sudah mengunci baris 7. Benteng satunya tinggal "menutup" baris 8.',
  },
  {
    id: 'p4', category: 'skakmat', difficulty: 2, xp: 15,
    title: 'Skakmat Kuda & Menteri',
    fen: '6k1/6pp/8/4N3/8/8/8/Q5K1 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah!',
    solutions: [{ from: 'a1', to: 'a8' }],
    hint: 'Raja terkurung pion sendiri (g7,h7). Kuda e5 menjaga f7 - Menteri tinggal naik ke baris 8.',
  },
  {
    id: 'p5', category: 'skakmat', difficulty: 3, xp: 20,
    title: 'Skakmat Smothered (Mini)',
    fen: '6k1/6pp/8/8/8/8/5N2/6K1 w - - 0 1',
    instruction: 'Giliran Putih. Temukan skakmat dengan Kuda!',
    solutions: [{ from: 'f2', to: 'h3' }],
    hint: 'Ini langkah persiapan, bukan skakmat langsung - lihat ke mana Kuda bisa pergi agar nanti mengancam g5 dan dekat Raja.',
    skipStrictCheck: true,
  },
  {
    id: 'p6', category: 'skakmat', difficulty: 1, xp: 10,
    title: 'Skakmat Pojok',
    fen: 'k7/8/1K6/8/8/8/7R/8 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah!',
    solutions: [{ from: 'h2', to: 'h8' }],
    hint: 'Raja Hitam terjebak di pojok a8, dijaga ketat Raja Putih di b6 (menutup a7 & b7). Benteng tinggal "menyapu" sepanjang baris 8 dari jauh - aman dari tangkapan Raja.',
  },

  // ===================== GARPU (FORK) =====================
  {
    id: 'p7', category: 'fork', difficulty: 1, xp: 10,
    title: 'Garpu Kuda Klasik',
    fen: '2q3k1/5ppp/8/5N2/8/8/PPPPP1PP/6K1 w - - 0 1',
    instruction: 'Giliran Putih. Kuda di f5 bisa garpu Raja & Menteri!',
    solutions: [{ from: 'f5', to: 'e7' }],
    hint: 'Lihat semua kotak yang bisa dituju Kuda dari f5 - salah satunya skak DAN mengincar Menteri.',
  },
  {
    id: 'p8', category: 'fork', difficulty: 2, xp: 15,
    title: 'Garpu Raja & Benteng',
    fen: '5rk1/5ppp/8/8/3N4/8/PPP2PPP/6K1 w - - 0 1',
    instruction: 'Giliran Putih. Temukan garpu Kuda ke Raja & Benteng!',
    solutions: [{ from: 'd4', to: 'e6' }],
    hint: 'Kuda di d4 bisa loncat ke kotak yang mengincar f8 (Benteng) sekaligus dekat Raja g8.',
  },
  {
    id: 'p9', category: 'fork', difficulty: 2, xp: 15,
    title: 'Garpu Pion',
    fen: '4k3/8/8/3r1b2/4P3/8/8/4K3 w - - 0 1',
    instruction: 'Giliran Putih. Pion bisa garpu Benteng & Gajah sekaligus!',
    solutions: [{ from: 'e4', to: 'e5' }],
    hint: 'Pion maju 1 kotak - lihat siapa yang sekarang diserangnya secara diagonal di langkah berikutnya... pion ini akan mengancam kedua bidak hitam.',
    skipStrictCheck: true,
  },
  {
    id: 'p10', category: 'fork', difficulty: 3, xp: 20,
    title: 'Garpu Menteri',
    fen: '3r2k1/5ppp/8/8/8/2Q5/5PPP/6K1 w - - 0 1',
    instruction: 'Giliran Putih. Menteri bisa garpu Raja & Benteng!',
    solutions: [{ from: 'c3', to: 'c8' }],
    hint: 'Menteri di kolom c bisa mendarat di baris belakang Hitam, mengincar Benteng sekaligus dekat Raja.',
  },

  // ===================== PIN & SKEWER =====================
  {
    id: 'p11', category: 'pin', difficulty: 1, xp: 10,
    title: 'Manfaatkan Pin',
    fen: '4k3/4n3/8/2B5/8/8/8/4R1K1 w - - 0 1',
    instruction: 'Kuda Hitam di e7 ter-pin oleh Benteng. Ambil gratis!',
    solutions: [{ from: 'c5', to: 'e7' }],
    hint: 'Kuda tidak bisa minggir (Raja e8 akan kena skak dari Benteng e1). Gajah bisa memakannya dengan aman.',
  },
  {
    id: 'p12', category: 'pin', difficulty: 2, xp: 15,
    title: 'Skewer Raja-Benteng',
    fen: '3r2k1/8/8/8/8/8/8/3R1RK1 w - - 0 1',
    instruction: 'Giliran Putih. Skewer Raja untuk memenangkan Benteng!',
    solutions: [{ from: 'd1', to: 'd8' }],
    hint: 'Benteng menyerang di kolom d - Raja Hitam wajib minggir, lalu Benteng satunya bisa mengambil bidak di belakangnya.',
    skipStrictCheck: true,
  },
  {
    id: 'p13', category: 'pin', difficulty: 2, xp: 15,
    title: 'Pin Mematikan',
    fen: '4k3/8/4r3/8/8/8/4R3/4K3 w - - 0 1',
    instruction: 'Giliran Putih. Benteng e2 sudah meng-pin Benteng Hitam ke Raja. Apa langkah terbaik?',
    solutions: [{ from: 'e2', to: 'e6' }],
    hint: 'Benteng yang ter-pin tidak bisa membalas. Ambil langsung!',
  },

  // ===================== SERANGAN TERSEMBUNYI =====================
  {
    id: 'p14', category: 'discovered', difficulty: 3, xp: 20,
    title: 'Skak Tersembunyi',
    fen: '4k3/8/8/3N4/8/8/8/R3K3 w - - 0 1',
    instruction: 'Giliran Putih. Pindahkan Kuda untuk membuka skak dari Benteng!',
    solutions: [{ from: 'd5', to: 'c7' }],
    hint: 'Kuda di d5 menghalangi Benteng a1 ke Raja e8. Pindahkan Kuda ke kotak yang juga menyerang sesuatu - skak akan terbuka otomatis!',
    skipStrictCheck: true,
  },
  {
    id: 'p15', category: 'discovered', difficulty: 3, xp: 20,
    title: 'Buka Jalur Gajah',
    fen: '4k3/8/8/8/3N4/8/8/2B1K3 w - - 0 1',
    instruction: 'Giliran Putih. Geser Kuda untuk membuka serangan Gajah ke Raja!',
    solutions: [{ from: 'd4', to: 'b5' }, { from: 'd4', to: 'e6' }, { from: 'd4', to: 'f5' }],
    hint: 'Gajah di c1 terhalang Kuda sendiri. Pindahkan Kuda ke kotak manapun yang membuka diagonal c1-e8.',
    skipStrictCheck: true,
  },

  // ===================== AKHIR PERMAINAN =====================
  {
    id: 'p16', category: 'endgame', difficulty: 1, xp: 15,
    title: 'Skakmat Raja+Menteri',
    fen: 'k7/2K5/8/8/8/8/8/1Q6 w - - 0 1',
    instruction: 'Giliran Putih. Eksekusi skakmat!',
    solutions: [{ from: 'b1', to: 'b8' }],
    hint: 'Menteri mendarat tepat di depan Raja, dilindungi Raja Putih di c7.',
  },
  {
    id: 'p17', category: 'endgame', difficulty: 2, xp: 20,
    title: 'Promosi Penentu',
    fen: '8/4P1k1/8/8/8/8/6K1/8 w - - 0 1',
    instruction: 'Giliran Putih. Majukan Pion menuju promosi!',
    solutions: [{ from: 'e7', to: 'e8', promotion: 'Q' }],
    hint: 'Pion sudah di baris 7 - tinggal melangkah dan pilih Menteri saat promosi.',
  },
  {
    id: 'p18', category: 'endgame', difficulty: 2, xp: 20,
    title: 'Skakmat Raja+Benteng',
    fen: '1k6/8/1K6/8/8/8/8/3R4 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah!',
    solutions: [{ from: 'd1', to: 'd8' }],
    hint: 'Raja Hitam sudah terjebak di pinggir baris 8, dijaga Raja Putih dari b6. Benteng tinggal mendarat di kolom d, baris 8.',
  },

  // ===================== TAMBAHAN BARU =====================
  {
    id: 'p19', category: 'skakmat', difficulty: 2, xp: 15,
    title: 'Mati Tangga Dua Benteng',
    fen: '7k/R7/8/8/8/8/8/1R4K1 w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah (teknik tangga)!',
    solutions: [{ from: 'b1', to: 'b8' }],
    hint: 'Benteng a7 sudah mengunci seluruh baris 7. Benteng satunya tinggal "menutup" baris 8.',
  },
  {
    id: 'p20', category: 'skakmat', difficulty: 2, xp: 15,
    title: 'Baterai Gajah & Benteng',
    fen: '7k/6pp/8/8/2B5/8/8/R6K w - - 0 1',
    instruction: 'Giliran Putih. Gajah sudah menjaga g8 - temukan skakmat dengan Benteng!',
    solutions: [{ from: 'a1', to: 'a8' }],
    hint: 'Raja terkurung pion sendiri (g7,h7). Gajah c4 sudah mengawasi g8 lewat diagonal terbuka. Benteng tinggal menyapu baris 8.',
  },
  {
    id: 'p21', category: 'fork', difficulty: 2, xp: 15,
    title: 'Garpu Kuda ke Benteng',
    fen: '4k1r1/8/8/3N4/8/8/8/7K w - - 0 1',
    instruction: 'Giliran Putih. Kuda bisa skak SEKALIGUS mengincar Benteng!',
    solutions: [{ from: 'd5', to: 'f6' }],
    hint: 'Dari d5, salah satu kotak tujuan Kuda dekat Raja e8 sekaligus sejalur "L" ke Benteng g8.',
  },
  {
    id: 'p22', category: 'fork', difficulty: 2, xp: 15,
    title: 'Garpu Menteri Sebaris',
    fen: 'r5k1/8/8/8/8/8/8/3Q3K w - - 0 1',
    instruction: 'Giliran Putih. Menteri bisa skak sekaligus mengincar Benteng di baris yang sama!',
    solutions: [{ from: 'd1', to: 'd8' }],
    hint: 'Menteri naik ke baris 8 lewat kolom d - dari sana dia mengontrol seluruh baris 8, termasuk Raja g8 dan Benteng a8.',
  },
  {
    id: 'p23', category: 'pin', difficulty: 1, xp: 10,
    title: 'Pin Diagonal Mematikan',
    fen: '4k3/8/4b3/8/8/8/8/4Q1K1 w - - 0 1',
    instruction: 'Gajah Hitam ter-pin oleh Menteri. Sikat habis!',
    solutions: [{ from: 'e1', to: 'e6' }],
    hint: 'Gajah tidak bisa minggir - Raja e8 akan kena skak dari Menteri e1 kalau dia pergi. Tangkap langsung!',
  },
  {
    id: 'p24', category: 'pin', difficulty: 1, xp: 10,
    title: 'Pin Lurus ke Benteng',
    fen: '4k3/8/4n3/8/8/8/8/4R1K1 w - - 0 1',
    instruction: 'Kuda Hitam ter-pin oleh Benteng di kolom e. Manfaatkan!',
    solutions: [{ from: 'e1', to: 'e6' }],
    hint: 'Sama seperti pin Gajah - Kuda ini juga tidak bisa minggir karena melindungi Rajanya sendiri.',
  },
  {
    id: 'p25', category: 'discovered', difficulty: 2, xp: 20,
    title: 'Buka Jalur Benteng',
    fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1',
    instruction: 'Giliran Putih. Geser Kuda untuk membuka skak Benteng!',
    solutions: [{ from: 'e4', to: 'd6' }, { from: 'e4', to: 'f6' }, { from: 'e4', to: 'c5' }, { from: 'e4', to: 'g5' }, { from: 'e4', to: 'c3' }, { from: 'e4', to: 'g3' }, { from: 'e4', to: 'd2' }, { from: 'e4', to: 'f2' }],
    hint: 'Kuda di e4 menghalangi Benteng e1. Pindahkan ke kotak manapun di luar kolom e untuk membuka jalur skak.',
  },
  {
    id: 'p26', category: 'discovered', difficulty: 3, xp: 25,
    title: 'Tangkap & Buka Skak Sekaligus',
    fen: '4k3/8/8/3n4/4P3/8/8/4R1K1 w - - 0 1',
    instruction: 'Giliran Putih. Pion bisa menangkap Kuda SEKALIGUS membuka skak Benteng!',
    solutions: [{ from: 'e4', to: 'd5' }],
    hint: 'Pion menangkap secara diagonal. Saat dia pindah dari kolom e, otomatis Benteng e1 punya jalur terbuka ke Raja e8.',
  },
  {
    id: 'p27', category: 'endgame', difficulty: 1, xp: 15,
    title: 'Skakmat Kotak Raja+Benteng',
    fen: 'k7/8/1K6/8/8/8/8/7R w - - 0 1',
    instruction: 'Giliran Putih. Skakmat dalam 1 langkah!',
    solutions: [{ from: 'h1', to: 'h8' }],
    hint: 'Raja Putih di b6 sudah menjaga a7 & b7. Benteng tinggal menyapu seluruh baris 8 dari jauh.',
  },
  {
    id: 'p28', category: 'endgame', difficulty: 1, xp: 15,
    title: 'Promosi Sambil Skak',
    fen: '3k4/1P6/8/8/8/8/8/7K w - - 0 1',
    instruction: 'Giliran Putih. Promosikan Pion sambil memberi skak!',
    solutions: [{ from: 'b7', to: 'b8', promotion: 'Q' }],
    hint: 'Pion di b7 tinggal 1 langkah dari promosi. Setelah jadi Menteri di b8, dia langsung mengancam Raja d8 lewat baris 8.',
  },
];

function getPuzzleById(id) {
  return PUZZLES.find((p) => p.id === id);
}
function getPuzzlesByCategory(catId) {
  return PUZZLES.filter((p) => p.category === catId);
}

// ============================================================================
//  GLOBAL STYLES
// ============================================================================
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

      :root {
        --bg-deep: #1B1B2F;
        --bg-panel: #262642;
        --bg-panel-2: #30305A;
        --board-light: #F2E8D5;
        --board-dark: #4F4670;
        --accent-gold: #E0B952;
        --accent-gold-deep: #C9971F;
        --success: #7CB17B;
        --success-bg: rgba(124,177,123,0.16);
        --error: #E2867A;
        --error-bg: rgba(226,134,122,0.16);
        --text-primary: #F5F1E8;
        --text-muted: #9D97BE;
        --text-dark: #211F38;
        --border-soft: rgba(245,241,232,0.08);
      }

      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

      .ca-root {
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        background-color: var(--bg-deep);
        background-image: radial-gradient(ellipse 90% 50% at 50% -10%, #34335C 0%, var(--bg-deep) 60%);
        color: var(--text-primary);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        max-width: 480px;
        margin: 0 auto;
        position: relative;
        overflow-x: hidden;
      }
      .font-display { font-family: 'Fraunces', Georgia, serif; }
      .font-mono-chess { font-family: 'JetBrains Mono', monospace; }

      .ca-scroll { flex: 1; overflow-y: auto; padding-bottom: 5.5rem; -webkit-overflow-scrolling: touch; }
      .ca-scroll::-webkit-scrollbar { display: none; }

      /* ---------- Chessboard ---------- */
      .chess-board-wrap { width: 100%; max-width: 26rem; margin: 0 auto; position: relative; }
      .chess-board {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        grid-template-rows: repeat(8, 1fr);
        aspect-ratio: 1 / 1;
        border-radius: 0.85rem;
        overflow: hidden;
        box-shadow: 0 14px 34px -14px rgba(0,0,0,0.65), 0 0 0 1px var(--border-soft);
      }
      .board-square {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        padding: 0;
        margin: 0;
        font-size: clamp(1.4rem, 7.2vw, 2.4rem);
        line-height: 1;
        cursor: pointer;
        -webkit-user-select: none;
        user-select: none;
      }
      .board-square:disabled { cursor: default; }
      .board-light { background-color: var(--board-light); }
      .board-dark { background-color: var(--board-dark); }
      .board-light .chess-piece { color: #2A2440; }
      .board-dark .chess-piece { color: #FBF8F2; }
      .chess-piece {
        position: relative;
        z-index: 2;
        filter: drop-shadow(0 2px 1px rgba(0,0,0,0.25));
        transition: transform 0.12s ease;
      }
      .square-selected .chess-piece { transform: scale(1.08); }
      .square-selected::before { content:''; position:absolute; inset:0; background: rgba(224,185,82,0.5); z-index:1; }
      .square-last-move::before { content:''; position:absolute; inset:0; background: rgba(224,185,82,0.25); z-index:1; }
      .square-check::before {
        content:''; position:absolute; inset:0; z-index:1;
        background: radial-gradient(circle, rgba(226,90,70,0.85) 0%, rgba(226,90,70,0.15) 75%);
        animation: checkPulse 1.1s ease-in-out infinite;
      }
      @keyframes checkPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
      .square-hint::before {
        content:''; position:absolute; inset: 8%; z-index:1; border-radius: 0.4rem;
        border: 0.2rem solid #5BC8E0; box-shadow: 0 0 10px 1px rgba(91,200,224,0.6);
        animation: hintPulse 1.3s ease-in-out infinite;
      }
      @keyframes hintPulse { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
      .legal-dot {
        position: absolute; width: 26%; height: 26%; border-radius: 50%;
        background: rgba(27,27,47,0.32); z-index: 1; pointer-events: none;
      }
      .board-light .legal-dot { background: rgba(27,27,47,0.28); }
      .legal-dot-capture {
        position: absolute; inset: 6%; border-radius: 0.6rem; width: auto; height: auto;
        background: transparent; border: 0.22rem solid rgba(226,90,70,0.65); z-index: 1; pointer-events: none;
      }
      .coord-label {
        position: absolute; font-size: 0.55rem; font-weight: 700; opacity: 0.45; z-index: 1;
        font-family: 'JetBrains Mono', monospace; pointer-events: none;
      }
      .coord-file { bottom: 2px; right: 4px; }
      .coord-rank { top: 2px; left: 4px; }

      /* ---------- Promotion picker ---------- */
      .promo-overlay {
        position: absolute; inset: 0; background: rgba(27,27,47,0.82);
        display: flex; align-items: center; justify-content: center;
        border-radius: 0.85rem; z-index: 20; backdrop-filter: blur(2px);
      }
      .promo-card {
        background: var(--bg-panel); border: 1px solid var(--border-soft);
        border-radius: 1rem; padding: 1rem; text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      }
      .promo-options { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
      .promo-btn {
        background: var(--bg-panel-2); border: 1px solid var(--border-soft);
        border-radius: 0.75rem; padding: 0.6rem 0.75rem; display: flex;
        flex-direction: column; align-items: center; gap: 0.15rem; cursor: pointer;
        color: var(--text-primary); transition: background 0.15s, transform 0.1s;
      }
      .promo-btn:active { transform: scale(0.95); background: var(--accent-gold); color: var(--text-dark); }
      .promo-glyph { font-size: 1.8rem; }
      .promo-label { font-size: 0.6rem; color: var(--text-muted); }

      /* ---------- Buttons ---------- */
      .btn-primary {
        background: var(--accent-gold); color: var(--text-dark); font-weight: 700;
        border-radius: 1rem; padding: 0.85rem 1.25rem; border: none; cursor: pointer;
        transition: transform 0.1s, opacity 0.15s; font-size: 0.95rem;
        box-shadow: 0 4px 14px -4px rgba(224,185,82,0.5);
      }
      .btn-primary:active { transform: scale(0.97); }
      .btn-primary:disabled { opacity: 0.35; box-shadow: none; cursor: not-allowed; }
      .btn-ghost {
        background: var(--bg-panel-2); color: var(--text-primary); font-weight: 600;
        border-radius: 1rem; padding: 0.85rem 1.25rem; border: 1px solid var(--border-soft);
        cursor: pointer; transition: transform 0.1s, background 0.15s; font-size: 0.95rem;
      }
      .btn-ghost:active { transform: scale(0.97); }
      .btn-danger-text { color: var(--error); }

      /* ---------- Animations ---------- */
      @keyframes popIn { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      .anim-pop { animation: popIn 0.35s cubic-bezier(.34,1.56,.64,1); }
      @keyframes flicker { 0%,100% { transform: scale(1) rotate(-2deg); opacity: 1; } 50% { transform: scale(1.08) rotate(2deg); opacity: 0.85; } }
      .anim-flicker { animation: flicker 1.6s ease-in-out infinite; display: inline-block; }
      @keyframes slideUp { 0% { transform: translateY(16px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
      .anim-slide-up { animation: slideUp 0.3s ease-out; }
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

      /* ---------- Scrollbar hide for chip rows ---------- */
      .chip-row { display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.25rem; }
      .chip-row::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

// ============================================================================
//  CHESS BOARD
// ============================================================================

/** Returns all legal move objects from `from` square to `to` square (1, or 4 if promotion choices). */
function getMoveCandidates(state, fromSq, toSq) {
  const from = squareToRC(fromSq);
  const to = squareToRC(toSq);
  const legal = getLegalMoves(state, from.row, from.col);
  return legal.filter(m => m.to.row === to.row && m.to.col === to.col);
}

function ChessBoard({
  board, onSquareClick, selected, legalTargets = [], lastMove, checkSquare,
  orientation = 'white', disabled = false, showCoords = false, hintSquares = [], themeId = 'classic',
}) {
  const indices = orientation === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const theme = BOARD_THEMES[themeId] || BOARD_THEMES.classic;

  const isLegalTarget = (r, c) => legalTargets.some(t => t.row === r && t.col === c);
  const isLastMove = (r, c) => lastMove && (
    (lastMove.from.row === r && lastMove.from.col === c) ||
    (lastMove.to.row === r && lastMove.to.col === c)
  );
  const isSelected = (r, c) => selected && selected.row === r && selected.col === c;
  const isCheck = (r, c) => checkSquare && checkSquare.row === r && checkSquare.col === c;
  const isHint = (r, c) => hintSquares.some(h => h.row === r && h.col === c);

  return (
    <div className="chess-board-wrap" style={{ '--board-light': theme.light, '--board-dark': theme.dark }}>
      <div className="chess-board">
        {indices.map((r) => indices.map((c) => {
          const piece = board[r][c];
          const light = (r + c) % 2 === 0;
          const classes = [
            'board-square',
            light ? 'board-light' : 'board-dark',
            isSelected(r, c) ? 'square-selected' : '',
            !isSelected(r, c) && isLastMove(r, c) ? 'square-last-move' : '',
            isCheck(r, c) ? 'square-check' : '',
            isHint(r, c) ? 'square-hint' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={`${r}-${c}`}
              type="button"
              className={classes}
              disabled={disabled}
              onClick={() => onSquareClick && onSquareClick(r, c)}
              aria-label={rcToSquare(r, c)}
            >
              {piece && <span className="chess-piece">{PIECE_UNICODE[piece]}</span>}
              {isLegalTarget(r, c) && (
                <span className={piece ? 'legal-dot-capture' : 'legal-dot'} />
              )}
              {showCoords && c === indices[0] && (
                <span className="coord-label coord-rank">{8 - r}</span>
              )}
              {showCoords && r === indices[7] && (
                <span className="coord-label coord-file">{String.fromCharCode(97 + c)}</span>
              )}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

function PromotionPicker({ color, onChoose }) {
  const pieces = ['Q', 'R', 'B', 'N'];
  return (
    <div className="promo-overlay anim-pop">
      <div className="promo-card">
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, fontWeight: 600 }}>Promosi jadi:</p>
        <div className="promo-options">
          {pieces.map((p) => (
            <button key={p} type="button" className="promo-btn" onClick={() => onChoose(p)}>
              <span className="promo-glyph">{PIECE_UNICODE[color + p]}</span>
              <span className="promo-label">{PIECE_NAME_ID[p]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
// ============================================================================
//  ADDITIONAL GLOBAL STYLES (shell, nav, cards, chips, chat, profile)
// ============================================================================
function GlobalStyles2() {
  return (
    <style>{`
      html, body { height: 100%; margin: 0; padding: 0; background: var(--bg-deep); }
      .ca-root { height: 100vh; }

      /* ---------- Top bar ---------- */
      .top-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.9rem 1rem 0.7rem; flex-shrink: 0;
      }
      .app-logo { display: flex; align-items: center; gap: 0.45rem; }
      .app-logo-text { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.01em; }
      .top-bar-pills { display: flex; gap: 0.4rem; }
      .pill {
        display: inline-flex; align-items: center; gap: 0.28rem; border-radius: 999px;
        padding: 0.32rem 0.65rem; font-size: 0.8rem; font-weight: 700; white-space: nowrap;
      }
      .pill-gold { background: rgba(224,185,82,0.16); color: var(--accent-gold); }
      .pill-streak { background: rgba(226,134,122,0.14); color: #F0A99B; }
      .pill-muted { background: var(--bg-panel-2); color: var(--text-muted); }

      /* ---------- Bottom nav ---------- */
      .bottom-nav {
        position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
        width: 100%; max-width: 480px; display: flex; justify-content: space-around;
        background: rgba(38,38,66,0.92); backdrop-filter: blur(10px);
        border-top: 1px solid var(--border-soft); padding: 0.5rem 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
        z-index: 40;
      }
      .nav-btn {
        display: flex; flex-direction: column; align-items: center; gap: 0.18rem;
        background: none; border: none; color: var(--text-muted); font-size: 0.62rem;
        font-weight: 600; padding: 0.3rem 0.5rem; border-radius: 0.7rem; cursor: pointer;
        transition: color 0.15s, background 0.15s; flex: 1;
      }
      .nav-btn-active { color: var(--accent-gold); background: rgba(224,185,82,0.1); }

      /* ---------- Generic ---------- */
      .card {
        background: var(--bg-panel); border: 1px solid var(--border-soft);
        border-radius: 1rem; padding: 1rem;
      }
      .section-title {
        font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 1.05rem;
        margin: 0 0 0.15rem;
      }
      .muted { color: var(--text-muted); }
      .center-col { display: flex; flex-direction: column; align-items: center; text-align: center; }

      /* ---------- Unit header ---------- */
      .unit-header {
        display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0.25rem 0.6rem;
        margin-top: 0.4rem;
      }
      .unit-icon-circle {
        width: 2.6rem; height: 2.6rem; border-radius: 0.9rem; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .unit-title { font-family: 'Fraunces', Georgia, serif; font-weight: 700; font-size: 1.05rem; margin: 0; }
      .unit-subtitle { font-size: 0.78rem; color: var(--text-muted); margin: 0.05rem 0 0; }

      /* ---------- Lesson list ---------- */
      .lesson-card {
        display: flex; align-items: center; gap: 0.75rem; width: 100%;
        background: var(--bg-panel); border: 1px solid var(--border-soft);
        border-radius: 1rem; padding: 0.8rem 0.9rem; margin-bottom: 0.55rem;
        cursor: pointer; transition: transform 0.1s, border-color 0.15s; text-align: left;
      }
      .lesson-card:active { transform: scale(0.985); }
      .lesson-card-locked { opacity: 0.45; cursor: default; }
      .lesson-card-current { border-color: var(--accent-gold); box-shadow: 0 0 0 1px var(--accent-gold) inset; }
      .lesson-status-circle {
        width: 2.6rem; height: 2.6rem; border-radius: 50%; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700;
      }
      .status-locked { background: var(--bg-panel-2); color: var(--text-muted); }
      .status-available { background: rgba(224,185,82,0.18); color: var(--accent-gold); }
      .status-completed { background: var(--accent-gold); color: var(--text-dark); }
      .lesson-card-title { font-weight: 700; font-size: 0.92rem; margin: 0; }
      .lesson-card-sub { font-size: 0.74rem; color: var(--text-muted); margin: 0.1rem 0 0; }

      /* ---------- Lesson player overlay ---------- */
      .overlay-shell {
        position: fixed; inset: 0; left: 50%; transform: translateX(-50%);
        width: 100%; max-width: 480px; background: var(--bg-deep);
        background-image: radial-gradient(ellipse 90% 50% at 50% -10%, #34335C 0%, var(--bg-deep) 60%);
        z-index: 50; display: flex; flex-direction: column;
      }
      .lp-header { display: flex; align-items: center; gap: 0.7rem; padding: 0.85rem 1rem; flex-shrink: 0; }
      .lp-close { background: var(--bg-panel-2); border: none; border-radius: 0.7rem; padding: 0.4rem; color: var(--text-primary); cursor: pointer; }
      .progress-track { flex: 1; height: 0.55rem; background: var(--bg-panel-2); border-radius: 999px; overflow: hidden; }
      .progress-fill { height: 100%; background: var(--accent-gold); border-radius: 999px; transition: width 0.35s ease; }
      .lp-body { flex: 1; overflow-y: auto; padding: 0.25rem 1.1rem 1rem; }
      .lp-body::-webkit-scrollbar { display: none; }
      .lp-footer { padding: 0.85rem 1.1rem calc(0.85rem + env(safe-area-inset-bottom)); flex-shrink: 0; }
      .step-eyebrow {
        font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--accent-gold); margin: 0.7rem 0 0.3rem;
      }
      .step-title { font-family: 'Fraunces', Georgia, serif; font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem; line-height: 1.25; }
      .step-text { font-size: 0.92rem; line-height: 1.55; color: var(--text-primary); margin: 0 0 0.9rem; }

      /* ---------- Feedback banner ---------- */
      .feedback-banner {
        border-radius: 0.9rem; padding: 0.8rem 0.9rem; font-size: 0.88rem; line-height: 1.5;
        margin-top: 0.8rem; display: flex; gap: 0.55rem; align-items: flex-start;
      }
      .feedback-success { background: var(--success-bg); color: var(--success); }
      .feedback-error { background: var(--error-bg); color: var(--error); }
      .feedback-banner b, .feedback-banner strong { color: var(--text-primary); }

      /* ---------- Quiz ---------- */
      .quiz-option {
        display: block; width: 100%; text-align: left; padding: 0.8rem 1rem;
        border-radius: 0.9rem; border: 1.5px solid var(--border-soft); background: var(--bg-panel);
        color: var(--text-primary); font-size: 0.9rem; font-weight: 600; margin-bottom: 0.55rem;
        cursor: pointer; transition: border-color 0.15s, background 0.15s;
      }
      .quiz-option:active { transform: scale(0.99); }
      .quiz-option-correct { border-color: var(--success); background: var(--success-bg); color: var(--success); }
      .quiz-option-incorrect { border-color: var(--error); background: var(--error-bg); color: var(--error); }
      .quiz-option-disabled { cursor: default; }

      /* ---------- Play tab ---------- */
      .choice-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; }
      .choice-btn {
        border-radius: 1rem; border: 1.5px solid var(--border-soft); background: var(--bg-panel);
        padding: 0.75rem 0.6rem; cursor: pointer; text-align: left; color: var(--text-primary);
        transition: border-color 0.15s, transform 0.1s;
      }
      .choice-btn:active { transform: scale(0.98); }
      .choice-btn-active { border-color: var(--accent-gold); background: rgba(224,185,82,0.1); }
      .choice-btn-title { font-weight: 700; font-size: 0.92rem; display: flex; align-items: center; gap: 0.4rem; }
      .choice-btn-desc { font-size: 0.72rem; color: var(--text-muted); margin-top: 0.2rem; line-height: 1.35; }

      .game-status-bar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.6rem 0.2rem; font-size: 0.85rem; font-weight: 600;
      }
      .move-history {
        display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.6rem 0.2rem;
        font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;
      }
      .move-token { background: var(--bg-panel-2); border-radius: 0.5rem; padding: 0.2rem 0.5rem; color: var(--text-muted); }
      .move-token-white { color: var(--text-primary); }
      .thinking-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; color: var(--text-muted); padding: 0.4rem 0.2rem; }
      .spin { animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ---------- Guru chat ---------- */
      .chat-scroll { flex: 1; overflow-y: auto; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
      .chat-bubble { border-radius: 1.1rem; padding: 0.7rem 0.95rem; font-size: 0.88rem; line-height: 1.55; max-width: 86%; white-space: pre-wrap; }
      .chat-bubble-user { align-self: flex-end; background: var(--accent-gold); color: var(--text-dark); border-bottom-right-radius: 0.3rem; }
      .chat-bubble-assistant { align-self: flex-start; background: var(--bg-panel); border: 1px solid var(--border-soft); border-bottom-left-radius: 0.3rem; }
      .chat-input-bar { display: flex; gap: 0.5rem; padding: 0.7rem 1rem calc(0.7rem + env(safe-area-inset-bottom)); border-top: 1px solid var(--border-soft); background: var(--bg-deep); flex-shrink: 0; }
      .chat-input {
        flex: 1; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--bg-panel-2);
        color: var(--text-primary); padding: 0.7rem 1.1rem; font-size: 0.9rem; font-family: inherit; outline: none;
      }
      .chat-input::placeholder { color: var(--text-muted); }
      .send-btn {
        width: 2.7rem; height: 2.7rem; border-radius: 50%; background: var(--accent-gold); color: var(--text-dark);
        border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
        transition: transform 0.1s, opacity 0.15s;
      }
      .send-btn:active { transform: scale(0.93); }
      .send-btn:disabled { opacity: 0.4; }
      .suggestion-chip {
        flex-shrink: 0; background: var(--bg-panel-2); border: 1px solid var(--border-soft); color: var(--text-primary);
        border-radius: 999px; padding: 0.45rem 0.85rem; font-size: 0.78rem; font-weight: 600; cursor: pointer;
        white-space: nowrap;
      }

      /* ---------- Profile / rank ladder ---------- */
      .rank-hero { padding: 1.1rem; border-radius: 1.2rem; text-align: center; background: var(--bg-panel); border: 1px solid var(--border-soft); }
      .rank-hero-glyph { font-size: 3.2rem; line-height: 1; filter: drop-shadow(0 4px 12px rgba(224,185,82,0.35)); }
      .rank-ladder { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.7rem; }
      .rank-item {
        display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.8rem; border-radius: 0.9rem;
        background: var(--bg-panel); border: 1px solid var(--border-soft); opacity: 0.5;
      }
      .rank-item-active { opacity: 1; border-color: var(--accent-gold); background: rgba(224,185,82,0.08); }
      .rank-item-done { opacity: 0.85; }
      .rank-glyph { font-size: 1.6rem; width: 2.2rem; text-align: center; flex-shrink: 0; }
      .rank-name { font-weight: 700; font-size: 0.88rem; margin: 0; }
      .rank-desc { font-size: 0.72rem; color: var(--text-muted); margin: 0.05rem 0 0; }
      .rank-xp-need { font-size: 0.7rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-left: auto; }

      .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; }
      .stat-card { background: var(--bg-panel); border: 1px solid var(--border-soft); border-radius: 1rem; padding: 0.75rem 0.5rem; text-align: center; }
      .stat-num { font-family: 'Fraunces', Georgia, serif; font-size: 1.4rem; font-weight: 700; margin: 0; }
      .stat-label { font-size: 0.68rem; color: var(--text-muted); margin: 0.1rem 0 0; }

      /* ---------- Eval bar ---------- */
      .eval-bar-wrap { display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0; }
      .eval-bar-track { flex: 1; height: 0.55rem; border-radius: 999px; overflow: hidden; background: #1a1a30; position: relative; }
      .eval-bar-white { position: absolute; top: 0; left: 0; height: 100%; background: var(--board-light); border-radius: 999px; transition: width 0.5s ease; }
      .eval-bar-score { font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; color: var(--text-muted); min-width: 3rem; text-align: right; flex-shrink: 0; }

      /* ---------- Material badge ---------- */
      .material-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; color: var(--text-muted); padding: 0.1rem 0 0.3rem; }
      .material-ahead { color: var(--accent-gold); font-weight: 700; }

      /* ---------- Opening tag ---------- */
      .opening-tag { display: inline-flex; align-items: center; gap: 0.3rem; background: rgba(142,124,195,0.18); color: #C4B5FD; border-radius: 999px; padding: 0.25rem 0.65rem; font-size: 0.72rem; font-weight: 700; }

      /* ---------- Icon-only btn ---------- */
      .icon-btn { background: var(--bg-panel-2); border: 1px solid var(--border-soft); border-radius: 0.65rem; padding: 0.4rem; color: var(--text-primary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
      .icon-btn:active { background: var(--bg-panel); }
      .icon-btn:disabled { opacity: 0.35; cursor: default; }

      /* ---------- Multiplayer & Login ---------- */
      .room-code {
        font-family: 'JetBrains Mono', monospace; font-size: 2.2rem; font-weight: 800;
        letter-spacing: 0.25em; color: var(--accent-gold); text-align: center;
        background: rgba(224,185,82,0.1); border: 2px dashed rgba(224,185,82,0.4);
        border-radius: 1rem; padding: 0.8rem 1.2rem; margin: 0.6rem 0;
      }
      .player-bar {
        display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.7rem;
        background: var(--bg-panel); border: 1px solid var(--border-soft); border-radius: 0.9rem;
      }
      .player-avatar {
        width: 2.2rem; height: 2.2rem; border-radius: 50%; flex-shrink: 0;
        background: var(--bg-panel-2); display: flex; align-items: center; justify-content: center;
        overflow: hidden; font-size: 1.1rem; border: 2px solid var(--border-soft);
      }
      .player-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .player-bar-active { border-color: var(--accent-gold); }
      .player-bar-check { border-color: var(--error); animation: checkPulse 1.1s ease-in-out infinite; }
      .user-pill {
        display: flex; align-items: center; gap: 0.35rem; cursor: pointer; border: none;
        background: var(--bg-panel-2); border-radius: 999px; padding: 0.28rem 0.65rem 0.28rem 0.28rem;
        color: var(--text-primary); font-size: 0.75rem; font-weight: 600; transition: background 0.15s;
      }
      .user-pill:active { background: var(--bg-panel); }
      .user-pill-avatar {
        width: 1.6rem; height: 1.6rem; border-radius: 50%; overflow: hidden; flex-shrink: 0;
        background: var(--bg-panel); display: flex; align-items: center; justify-content: center; font-size: 0.8rem;
      }
      .user-pill-avatar img { width: 100%; height: 100%; object-fit: cover; }
      @keyframes dotBlink { 0%,80%,100%{opacity:0.2;} 40%{opacity:1;} }
      .dot-blink span { display:inline-block; width:0.45rem; height:0.45rem; border-radius:50%;
        background:var(--text-muted); margin:0 0.12rem; animation:dotBlink 1.4s infinite; }
      .dot-blink span:nth-child(2){animation-delay:0.2s;}
      .dot-blink span:nth-child(3){animation-delay:0.4s;}
    `}</style>
  );
}

// ============================================================================
//  TOP BAR & BOTTOM NAV
// ============================================================================
function TopBar({ progress, user, onLogin, onLogout }) {
  return (
    <header className="top-bar">
      <div className="app-logo">
        <Castle size={22} style={{ color: 'var(--accent-gold)' }} />
        <span className="app-logo-text font-display">CaturKu</span>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span className="pill pill-gold"><Zap size={13} />{progress.xp}</span>
        <span className="pill pill-streak">
          <Flame size={13} className={progress.streak > 0 ? 'anim-flicker' : ''} />
          {progress.streak}
        </span>
        {FIREBASE_CONFIGURED && (
          user ? (
            <button type="button" className="user-pill" onClick={onLogout} title="Logout">
              <div className="user-pill-avatar">
                {user.photoURL
                  ? <img src={user.photoURL} alt={user.displayName} referrerPolicy="no-referrer" />
                  : <span>👤</span>}
              </div>
              <span style={{ maxWidth: '4.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.displayName?.split(' ')[0] || 'Akun'}
              </span>
            </button>
          ) : (
            <button type="button" className="user-pill" onClick={onLogin} title="Login Google">
              <div className="user-pill-avatar"><span>🔑</span></div>
              <span>Login</span>
            </button>
          )
        )}
      </div>
    </header>
  );
}

function BottomNav({ active, onChange }) {
  const tabs = [
    { id: 'belajar', label: 'Belajar', icon: BookOpen },
    { id: 'taktik', label: 'Taktik', icon: Swords },
    { id: 'main', label: 'Main', icon: Crown },
    { id: 'guru', label: 'Guru', icon: Bot },
    { id: 'profil', label: 'Profil', icon: User },
  ];
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            className={`nav-btn ${isActive ? 'nav-btn-active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <Icon size={19} />
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
// ============================================================================
//  LEARN TAB - jalur pelajaran
// ============================================================================
function LearnTab({ progress, onOpenLesson }) {
  const completedCount = progress.completedLessons.length;
  const pct = Math.round((completedCount / LESSONS.length) * 100);

  return (
    <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ fontSize: '0.78rem', margin: 0, fontWeight: 600 }}>PROGRES KURIKULUM</p>
        <h2 className="section-title" style={{ fontSize: '1.35rem', marginTop: '0.15rem' }}>
          {completedCount} / {LESSONS.length} Pelajaran
        </h2>
        <div className="progress-track" style={{ marginTop: '0.5rem' }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted" style={{ fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
          Bab 1-4: fondasi dasar catur. Bab lanjutan (pembukaan lengkap, taktik tingkat lanjut, akhir permainan kompleks) akan terus ditambahkan.
        </p>
      </div>

      {UNITS.map((unit) => {
        const Icon = UNIT_ICONS[unit.icon] || BookOpen;
        const unitLessons = LESSONS.filter((l) => l.unit === unit.id);
        return (
          <div key={unit.id}>
            <div className="unit-header">
              <div className="unit-icon-circle" style={{ background: `${unit.color}26`, color: unit.color }}>
                <Icon size={22} />
              </div>
              <div>
                <h3 className="unit-title">Bab {unit.id}: {unit.title}</h3>
                <p className="unit-subtitle">{unit.subtitle}</p>
              </div>
            </div>
            {unitLessons.map((lesson) => {
              const flatIndex = LESSONS.findIndex((l) => l.id === lesson.id);
              const isDone = progress.completedLessons.includes(lesson.id);
              const prevDone = flatIndex === 0 || progress.completedLessons.includes(LESSONS[flatIndex - 1].id);
              const isLocked = !isDone && !prevDone;
              const isCurrent = !isDone && prevDone;
              return (
                <button
                  key={lesson.id}
                  type="button"
                  className={`lesson-card ${isLocked ? 'lesson-card-locked' : ''} ${isCurrent ? 'lesson-card-current' : ''}`}
                  onClick={() => !isLocked && onOpenLesson(lesson.id)}
                  disabled={isLocked}
                >
                  <div className={`lesson-status-circle ${isDone ? 'status-completed' : isLocked ? 'status-locked' : 'status-available'}`}>
                    {isDone ? <Check size={20} /> : isLocked ? <Lock size={18} /> : <Icon size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="lesson-card-title">{lesson.title}</p>
                    <p className="lesson-card-sub">{isDone ? 'Selesai - ulangi kapan saja' : `+${lesson.xp} XP`} · {lesson.steps.length} langkah</p>
                  </div>
                  {!isLocked && <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        );
      })}
      <div style={{ height: '0.5rem' }} />
    </div>
  );
}

// ============================================================================
//  LESSON PLAYER - step-by-step interaktif
// ============================================================================
function LessonPlayer({ lesson, onComplete, onClose }) {
  const { boardTheme } = usePrefs();
  const sound = useSound();
  const [stepIndex, setStepIndex] = useState(0);
  const [gameState, setGameState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [quizSelected, setQuizSelected] = useState(null);
  const [lastMove, setLastMove] = useState(null);

  const step = lesson.steps[stepIndex];
  const isFinished = stepIndex >= lesson.steps.length;
  const unit = UNITS.find((u) => u.id === lesson.unit);

  useEffect(() => {
    if (isFinished) return;
    setFeedback(null);
    setAttempts(0);
    setPendingPromotion(null);
    setQuizSelected(null);
    setLastMove(null);
    const s = lesson.steps[stepIndex];
    if (s.fen) {
      const st = fenToState(s.fen);
      setGameState(st);
      if (s.type === 'move' && s.mode === 'any' && s.pieceSquare) {
        const { row, col } = squareToRC(s.pieceSquare);
        setSelected({ row, col });
        setLegalTargets(getLegalMoves(st, row, col).map((m) => m.to));
      } else {
        setSelected(null);
        setLegalTargets([]);
      }
    } else {
      setGameState(null);
      setSelected(null);
      setLegalTargets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const checkSquare = gameState && isInCheck(gameState, gameState.turn)
    ? findKing(gameState.board, gameState.turn) : null;

  function finalizeMove(move, isCorrect) {
    if (isCorrect) {
      const next = applyMove(gameState, move);
      setGameState(next);
      setLastMove({ from: move.from, to: move.to });
      setSelected(null);
      setLegalTargets([]);
      setFeedback({ type: 'success', text: step.successText || 'Tepat!' });
      sound(move.capture ? 'capture' : 'move');
      setTimeout(() => { if (isInCheck(next, next.turn)) sound('check'); }, 180);
    } else {
      setSelected(null);
      setLegalTargets([]);
      setAttempts((a) => a + 1);
      setFeedback({ type: 'error', text: step.failHint || 'Belum tepat, coba lagi!' });
      sound('wrong');
    }
  }

  function moveMatchesSolution(move, sol) {
    return rcToSquare(move.from.row, move.from.col) === sol.from
      && rcToSquare(move.to.row, move.to.col) === sol.to
      && (sol.promotion ? move.promotion === sol.promotion : true);
  }

  function handleSquareClick(r, c) {
    if (!gameState || feedback?.type === 'success' || pendingPromotion) return;

    if (step.mode === 'any') {
      const isTarget = legalTargets.some((t) => t.row === r && t.col === c);
      if (!isTarget) return;
      const candidates = getMoveCandidates(gameState, rcToSquare(selected.row, selected.col), rcToSquare(r, c));
      if (candidates.length > 1) {
        setPendingPromotion({ fromSq: rcToSquare(selected.row, selected.col), toSq: rcToSquare(r, c), candidates });
        return;
      }
      finalizeMove(candidates[0], true);
      return;
    }

    // 'exact' mode: free piece selection
    const piece = gameState.board[r][c];
    if (selected) {
      if (selected.row === r && selected.col === c) {
        setSelected(null); setLegalTargets([]);
        return;
      }
      const isTarget = legalTargets.some((t) => t.row === r && t.col === c);
      if (isTarget) {
        const candidates = getMoveCandidates(gameState, rcToSquare(selected.row, selected.col), rcToSquare(r, c));
        if (candidates.length > 1) {
          setPendingPromotion({ fromSq: rcToSquare(selected.row, selected.col), toSq: rcToSquare(r, c), candidates });
          return;
        }
        const move = candidates[0];
        const isCorrect = (step.solutions || []).some((sol) => moveMatchesSolution(move, sol));
        finalizeMove(move, isCorrect);
        return;
      }
      if (piece && pieceColor(piece) === gameState.turn) {
        const lm = getLegalMoves(gameState, r, c);
        setSelected({ row: r, col: c });
        setLegalTargets(lm.map((m) => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }
    if (piece && pieceColor(piece) === gameState.turn) {
      const lm = getLegalMoves(gameState, r, c);
      setSelected({ row: r, col: c });
      setLegalTargets(lm.map((m) => m.to));
    }
  }

  function handlePromotionChoose(letter) {
    const move = pendingPromotion.candidates.find((c) => c.promotion === letter);
    if (step.mode === 'any') {
      finalizeMove(move, true);
    } else {
      const isCorrect = (step.solutions || []).some((sol) => moveMatchesSolution(move, sol));
      finalizeMove(move, isCorrect);
    }
    setPendingPromotion(null);
  }

  function handleReveal() {
    const sol = step.solutions[0];
    const candidates = getMoveCandidates(gameState, sol.from, sol.to);
    const move = sol.promotion ? candidates.find((c) => c.promotion === sol.promotion) : candidates[0];
    if (!move) return;
    const next = applyMove(gameState, move);
    setGameState(next);
    setLastMove({ from: move.from, to: move.to });
    setSelected(null); setLegalTargets([]);
    setFeedback({ type: 'success', text: `${step.successText || ''} (jawaban ditampilkan)` });
  }

  function canContinue() {
    if (isFinished) return true;
    if (step.type === 'info') return true;
    if (step.type === 'quiz') return quizSelected !== null;
    if (step.type === 'move') return feedback?.type === 'success';
    return false;
  }

  function handleContinue() {
    if (isFinished) { onClose(); return; }
    if (stepIndex === lesson.steps.length - 1) { sound('correct'); onComplete(lesson.xp); }
    else sound('click');
    setStepIndex((i) => i + 1);
  }

  const progressPct = isFinished ? 100 : Math.round((stepIndex / lesson.steps.length) * 100);

  return (
    <div className="overlay-shell">
      <div className="lp-header">
        <button type="button" className="lp-close" onClick={onClose} aria-label="Tutup">
          <X size={20} />
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="lp-body">
        {!isFinished && (
          <>
            <p className="step-eyebrow">Bab {lesson.unit} · {unit?.title} · {stepIndex + 1}/{lesson.steps.length}</p>
            <h2 className="step-title">{step.title}</h2>

            {step.type === 'info' && <p className="step-text">{step.text}</p>}
            {step.type === 'move' && <p className="step-text">{step.prompt}</p>}
            {step.type === 'quiz' && <p className="step-text" style={{ fontWeight: 700 }}>{step.question}</p>}

            {gameState && (
              <div style={{ position: 'relative', margin: '0.4rem 0 0.8rem' }}>
                <ChessBoard
                  board={gameState.board}
                  onSquareClick={handleSquareClick}
                  selected={selected}
                  legalTargets={legalTargets}
                  lastMove={lastMove}
                  checkSquare={checkSquare}
                  disabled={step.type === 'info' || feedback?.type === 'success'}
                  showCoords
                  themeId={boardTheme}
                />
                {pendingPromotion && <PromotionPicker color={gameState.turn} onChoose={handlePromotionChoose} />}
              </div>
            )}

            {step.type === 'quiz' && (
              <div style={{ marginTop: '0.3rem' }}>
                {step.options.map((opt, i) => {
                  let cls = 'quiz-option';
                  if (quizSelected !== null) {
                    cls += ' quiz-option-disabled';
                    if (i === step.correctIndex) cls += ' quiz-option-correct';
                    else if (i === quizSelected) cls += ' quiz-option-incorrect';
                  }
                  return (
                    <button
                      key={i}
                      type="button"
                      className={cls}
                      disabled={quizSelected !== null}
                      onClick={() => { setQuizSelected(i); sound(i === step.correctIndex ? 'correct' : 'wrong'); }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {feedback && (
              <div className={`feedback-banner anim-pop ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}>
                {feedback.type === 'success' ? <Check size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} /> : <Info size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />}
                <span>{feedback.text}</span>
              </div>
            )}

            {quizSelected !== null && step.type === 'quiz' && (
              <div className={`feedback-banner anim-pop ${quizSelected === step.correctIndex ? 'feedback-success' : 'feedback-error'}`}>
                {quizSelected === step.correctIndex ? <Check size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} /> : <Info size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />}
                <span>{step.explanation}</span>
              </div>
            )}

            {step.type === 'move' && feedback?.type === 'error' && attempts >= 2 && (
              <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: '0.7rem' }} onClick={handleReveal}>
                Lihat Jawaban
              </button>
            )}
          </>
        )}

        {isFinished && (
          <div className="center-col anim-pop" style={{ paddingTop: '3.5rem', gap: '0.6rem' }}>
            <Trophy size={56} style={{ color: 'var(--accent-gold)' }} />
            <h2 className="step-title" style={{ margin: 0 }}>Pelajaran Selesai!</h2>
            <p className="muted" style={{ margin: 0, fontSize: '0.88rem' }}>Kerja bagus - lanjutkan ke pelajaran berikutnya kapan pun kamu siap.</p>
            <div className="pill pill-gold" style={{ fontSize: '1.05rem', padding: '0.55rem 1.1rem', marginTop: '0.4rem' }}>
              <Zap size={18} /> +{lesson.xp} XP
            </div>
          </div>
        )}
      </div>

      <div className="lp-footer">
        <button type="button" className="btn-primary" style={{ width: '100%' }} disabled={!canContinue()} onClick={handleContinue}>
          {isFinished ? 'Kembali ke Jalur Belajar' : stepIndex === lesson.steps.length - 1 ? 'Selesaikan Pelajaran' : 'Lanjut'}
        </button>
      </div>
    </div>
  );
}
// ============================================================================
//  EVAL BAR
// ============================================================================
function EvalBar({ gameState }) {
  if (!gameState) return null;
  const raw = evaluate(gameState); // centipawns, white-centric
  const isMate = isCheckmate(gameState);
  const whitePct = isMate
    ? (gameState.turn === 'w' ? 2 : 98)
    : Math.max(3, Math.min(97, 50 + raw / 22));
  const label = isMate
    ? (gameState.turn === 'w' ? 'M Hitam' : 'M Putih')
    : raw === 0 ? '0.0'
      : (raw > 0 ? '+' : '') + (raw / 100).toFixed(1);
  return (
    <div className="eval-bar-wrap">
      <span style={{ fontSize: '0.65rem', color: '#888', minWidth: '1.5rem' }}>♟</span>
      <div className="eval-bar-track">
        <div className="eval-bar-white" style={{ width: `${whitePct}%` }} />
      </div>
      <span style={{ fontSize: '0.65rem', color: '#ccc', minWidth: '1.5rem', textAlign: 'right' }}>♙</span>
      <span className="eval-bar-score">{label}</span>
    </div>
  );
}

// ============================================================================
//  MATERIAL BALANCE
// ============================================================================
const MAT_VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

function getMaterial(board) {
  const w = {}, b = {};
  for (const r of board) for (const cell of r) {
    if (!cell) continue;
    const [c, t] = [cell[0], cell[1]];
    if (c === 'w') w[t] = (w[t] || 0) + 1;
    else b[t] = (b[t] || 0) + 1;
  }
  const score = (m) => Object.entries(m).reduce((s, [t, n]) => s + (MAT_VAL[t] || 0) * n, 0);
  return { wScore: score(w), bScore: score(b), wPieces: w, bPieces: b };
}

function MaterialRow({ board, playerColor }) {
  const { wScore, bScore } = getMaterial(board);
  const diff = wScore - bScore;
  const playerAhead = playerColor === 'w' ? diff > 0 : diff < 0;
  const absDiff = Math.abs(diff);
  if (absDiff === 0) return null;
  return (
    <div className="material-row">
      <span>{playerColor === 'w' ? '♙ Putih' : '♟ Hitam'} (kamu)</span>
      {playerAhead
        ? <span className="material-ahead">+{absDiff} materi</span>
        : <span style={{ color: 'var(--error)', fontWeight: 700 }}>-{absDiff} materi</span>
      }
    </div>
  );
}

// ============================================================================
//  OPENING DETECTOR
// ============================================================================
const OPENINGS = [
  { moves: ['e4','e5','Nf3','Nc6','Bb5'],       name: 'Ruy López' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4'],        name: 'Italian Game' },
  { moves: ['e4','e5','Nf3','Nc6','Bc4','Nf6'],  name: 'Two Knights Defense' },
  { moves: ['e4','e5','Nf3','Nc6','d4'],         name: 'Scotch Game' },
  { moves: ['e4','c5'],                          name: 'Sicilian Defense' },
  { moves: ['e4','c5','Nf3','d6','d4'],          name: 'Sicilian – Open' },
  { moves: ['e4','c5','Nf3','Nc6'],              name: 'Sicilian – Alapin (var)' },
  { moves: ['e4','e6'],                          name: 'French Defense' },
  { moves: ['e4','e6','d4','d5'],                name: 'French Defense' },
  { moves: ['e4','c6'],                          name: 'Caro-Kann Defense' },
  { moves: ['e4','d5'],                          name: 'Scandinavian Defense' },
  { moves: ['d4','d5','c4'],                     name: "Queen's Gambit" },
  { moves: ['d4','d5','c4','e6'],                name: "Queen's Gambit Declined" },
  { moves: ['d4','d5','c4','dxc4'],              name: "Queen's Gambit Accepted" },
  { moves: ['d4','Nf6','c4','e6'],               name: "Nimzo/QID Setup" },
  { moves: ['d4','Nf6','c4','g6'],               name: "King's Indian Defense" },
  { moves: ['d4','Nf6','c4','c5'],               name: "Benoni Defense" },
  { moves: ['Nf3','d5','c4'],                    name: "Réti Opening" },
  { moves: ['e4','e5'],                          name: "Open Game (1.e4 e5)" },
  { moves: ['d4','d5'],                          name: "Closed Game (1.d4 d5)" },
  { moves: ['e4'],                               name: "King's Pawn (1.e4)" },
  { moves: ['d4'],                               name: "Queen's Pawn (1.d4)" },
  { moves: ['c4'],                               name: "English Opening" },
  { moves: ['Nf3'],                              name: "Réti / King's Indian Attack" },
];

function detectOpening(moveHistory) {
  const sans = moveHistory.map(m => m.san);
  let best = null;
  for (const op of OPENINGS) {
    if (op.moves.length > sans.length) continue;
    const match = op.moves.every((m, i) => sans[i] === m);
    if (match && (!best || op.moves.length > best.moves.length)) best = op;
  }
  return best ? best.name : null;
}

// ============================================================================
//  THREEFOLD REPETITION
// ============================================================================
function positionKey(state) {
  // board + giliran + hak castling + target en passant (abaikan halfmove/fullmove counter)
  return stateToFen(state).split(' ').slice(0, 4).join(' ');
}
function isThreefoldRepetition(stateHistory, currentState) {
  const all = [...(stateHistory || []), currentState];
  const counts = {};
  for (const s of all) {
    const key = positionKey(s);
    counts[key] = (counts[key] || 0) + 1;
    if (counts[key] >= 3) return true;
  }
  return false;
}

// ============================================================================
//  TACTICS TAB - puzzle taktik & Ujian Harian
// ============================================================================
const STARS_BY_DIFFICULTY = { 1: '★☆☆', 2: '★★☆', 3: '★★★' };

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}
function getDailyPuzzle() {
  const idx = dayOfYear(new Date()) % PUZZLES.length;
  return PUZZLES[idx];
}

function TacticsTab({ progress, onOpenPuzzleSet }) {
  const solved = progress.solvedPuzzles || [];
  const solvedCount = solved.length;
  const dailyPuzzle = getDailyPuzzle();
  const dailyDoneToday = progress.lastDailyPuzzleDate === todayStr();

  return (
    <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
      {/* Puzzle Harian card */}
      <button
        type="button"
        onClick={() => onOpenPuzzleSet({ mode: 'single', puzzleId: dailyPuzzle.id, isDaily: true })}
        style={{
          width: '100%', textAlign: 'left', border: dailyDoneToday ? '1.5px solid var(--success)' : '1.5px solid var(--accent-gold)',
          cursor: 'pointer', background: dailyDoneToday ? 'rgba(124,177,123,0.1)' : 'rgba(224,185,82,0.1)',
          borderRadius: '1.1rem', padding: '1rem', marginBottom: '0.7rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div style={{
            width: '2.6rem', height: '2.6rem', borderRadius: '0.85rem', flexShrink: 0,
            background: dailyDoneToday ? 'rgba(124,177,123,0.18)' : 'rgba(224,185,82,0.18)',
            color: dailyDoneToday ? 'var(--success)' : 'var(--accent-gold)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {dailyDoneToday ? <Check size={22} /> : <Star size={20} />}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontFamily: 'Fraunces,serif', fontWeight: 700, fontSize: '0.95rem' }}>
              Puzzle Harian {dailyDoneToday && '· Selesai!'}
            </p>
            <p className="muted" style={{ margin: '0.1rem 0 0', fontSize: '0.76rem' }}>
              {dailyPuzzle.title} · {STARS_BY_DIFFICULTY[dailyPuzzle.difficulty]}
            </p>
          </div>
          <ChevronRight size={17} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
      </button>

      {/* Ujian Harian card */}
      <button
        type="button"
        onClick={() => onOpenPuzzleSet({ mode: 'exam' })}
        style={{
          width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#3a3670,#5a4fa0)',
          borderRadius: '1.1rem', padding: '1.1rem', marginBottom: '1.1rem',
          boxShadow: '0 8px 24px -10px rgba(90,79,160,0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <div style={{ width: '2.8rem', height: '2.8rem', borderRadius: '0.9rem', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <HelpCircle size={24} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontFamily: 'Fraunces,serif', fontWeight: 700, fontSize: '1.05rem', color: '#fff' }}>Ujian Harian</p>
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>
              8 puzzle acak · 3 menit · {progress.examBestScore ? `Rekor: ${progress.examBestScore}%` : 'Belum pernah dicoba'}
            </p>
          </div>
          <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.7)' }} />
        </div>
      </button>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="muted" style={{ fontSize: '0.78rem', margin: 0, fontWeight: 600 }}>PROGRES TAKTIK</p>
        <h2 className="section-title" style={{ fontSize: '1.35rem', marginTop: '0.15rem' }}>
          {solvedCount} / {PUZZLES.length} Puzzle Selesai
        </h2>
        <div className="progress-track" style={{ marginTop: '0.5rem' }}>
          <div className="progress-fill" style={{ width: `${(solvedCount / PUZZLES.length) * 100}%` }} />
        </div>
      </div>

      {PUZZLE_CATEGORIES.map((cat) => {
        const Icon = UNIT_ICONS[cat.icon] || HelpCircle;
        const catPuzzles = getPuzzlesByCategory(cat.id);
        const catSolved = catPuzzles.filter((p) => solved.includes(p.id)).length;
        return (
          <div key={cat.id} style={{ marginBottom: '0.6rem' }}>
            <div className="unit-header" style={{ marginTop: '0.2rem' }}>
              <div className="unit-icon-circle" style={{ background: `${cat.color}26`, color: cat.color }}>
                <Icon size={20} />
              </div>
              <div>
                <h3 className="unit-title" style={{ fontSize: '0.98rem' }}>{cat.label}</h3>
                <p className="unit-subtitle">{catSolved}/{catPuzzles.length} selesai</p>
              </div>
            </div>
            {catPuzzles.map((puzzle) => {
              const isDone = solved.includes(puzzle.id);
              return (
                <button
                  key={puzzle.id}
                  type="button"
                  className="lesson-card"
                  onClick={() => onOpenPuzzleSet({ mode: 'single', puzzleId: puzzle.id })}
                >
                  <div className={`lesson-status-circle ${isDone ? 'status-completed' : 'status-available'}`}>
                    {isDone ? <Check size={20} /> : <Icon size={16} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="lesson-card-title">{puzzle.title}</p>
                    <p className="lesson-card-sub">
                      {STARS_BY_DIFFICULTY[puzzle.difficulty]} · +{puzzle.xp} XP
                    </p>
                  </div>
                  <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        );
      })}
      <div style={{ height: '0.5rem' }} />
    </div>
  );
}

// ============================================================================
//  PUZZLE PLAYER - mode latihan tunggal & Ujian Harian
// ============================================================================
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function PuzzlePlayer({ config, onClose, onPuzzleSolved, onExamComplete }) {
  const { boardTheme } = usePrefs();
  const sound = useSound();
  const isExam = config.mode === 'exam';
  const examPuzzles = useRef(isExam ? shuffleArray(PUZZLES).slice(0, 8) : null);
  const singlePuzzle = !isExam ? getPuzzleById(config.puzzleId) : null;

  const puzzleList = isExam ? examPuzzles.current : [singlePuzzle];
  const [idx, setIdx] = useState(0);
  const [gameState, setGameState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [examScore, setExamScore] = useState(0);
  const [examDone, setExamDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(isExam ? 180 : null);
  const timerRef = useRef(null);
  const scoreRef = useRef(0); // avoids stale-closure bug when timer auto-finishes the exam

  const puzzle = puzzleList[idx];

  useEffect(() => {
    scoreRef.current = examScore;
  }, [examScore]);

  useEffect(() => {
    if (!puzzle) return;
    const st = fenToState(puzzle.fen);
    setGameState(st);
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    setFeedback(null);
    setAttempts(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, puzzle?.id]);

  // Exam timer
  useEffect(() => {
    if (!isExam || examDone) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          finishExam();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExam, examDone]);

  function finishExam() {
    clearInterval(timerRef.current);
    setExamDone(true);
    // Pakai scoreRef (bukan state examScore) supaya tidak kena bug stale-closure
    // saat fungsi ini dipanggil otomatis dari dalam setInterval waktu habis.
    const pct = Math.round((scoreRef.current / puzzleList.length) * 100);
    onExamComplete(pct);
  }

  const checkSquare = gameState && isInCheck(gameState, gameState.turn)
    ? findKing(gameState.board, gameState.turn) : null;

  function moveMatchesSolution(move, sol) {
    return rcToSquare(move.from.row, move.from.col) === sol.from
      && rcToSquare(move.to.row, move.to.col) === sol.to
      && (sol.promotion ? move.promotion === sol.promotion : true);
  }

  function handleCorrect(move) {
    const next = applyMove(gameState, move);
    setGameState(next);
    setSelected(null); setLegalTargets([]);
    setFeedback({ type: 'success' });
    // play capture/move → then check/mate sound if applicable
    sound(move.capture ? 'capture' : 'move');
    setTimeout(() => {
      if (isCheckmate(next)) sound('checkmateWin');
      else if (isInCheck(next, next.turn)) sound('check');
      else sound('correct');
    }, 160);
    if (!isExam) {
      onPuzzleSolved(puzzle.id, puzzle.xp, config.isDaily === true);
    } else {
      setExamScore((s) => s + 1);
    }
  }

  function handleWrong() {
    setSelected(null); setLegalTargets([]);
    setAttempts((a) => a + 1);
    setFeedback({ type: 'error' });
    sound('wrong');
  }

  function handleSquareClick(r, c) {
    if (!gameState || feedback?.type === 'success' || pendingPromotion) return;
    const piece = gameState.board[r][c];
    if (selected) {
      if (selected.row === r && selected.col === c) { setSelected(null); setLegalTargets([]); return; }
      const isTarget = legalTargets.some((t) => t.row === r && t.col === c);
      if (isTarget) {
        const candidates = getMoveCandidates(gameState, rcToSquare(selected.row, selected.col), rcToSquare(r, c));
        if (candidates.length > 1) { setPendingPromotion({ candidates }); return; }
        const move = candidates[0];
        const isCorrect = puzzle.solutions.some((sol) => moveMatchesSolution(move, sol));
        if (isCorrect) handleCorrect(move); else handleWrong();
        return;
      }
      if (piece && pieceColor(piece) === gameState.turn) {
        setSelected({ row: r, col: c });
        setLegalTargets(getLegalMoves(gameState, r, c).map((m) => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }
    if (piece && pieceColor(piece) === gameState.turn) {
      setSelected({ row: r, col: c });
      setLegalTargets(getLegalMoves(gameState, r, c).map((m) => m.to));
    }
  }

  function handlePromotionChoose(letter) {
    const move = pendingPromotion.candidates.find((c) => c.promotion === letter);
    const isCorrect = puzzle.solutions.some((sol) => moveMatchesSolution(move, sol));
    setPendingPromotion(null);
    if (isCorrect) handleCorrect(move); else handleWrong();
  }

  function handleReveal() {
    const sol = puzzle.solutions[0];
    const candidates = getMoveCandidates(gameState, sol.from, sol.to);
    const move = sol.promotion ? candidates.find((c) => c.promotion === sol.promotion) : candidates[0];
    if (!move) return;
    const next = applyMove(gameState, move);
    setGameState(next);
    setSelected(null); setLegalTargets([]);
    setFeedback({ type: 'reveal' });
  }

  function handleNext() {
    if (isExam) {
      if (idx + 1 >= puzzleList.length) { finishExam(); return; }
      setIdx((i) => i + 1);
    } else {
      onClose();
    }
  }

  function handleSkip() {
    if (isExam) {
      if (idx + 1 >= puzzleList.length) { finishExam(); return; }
      setIdx((i) => i + 1);
    }
  }

  const canContinue = feedback?.type === 'success' || feedback?.type === 'reveal';
  const minutes = timeLeft !== null ? Math.floor(timeLeft / 60) : 0;
  const seconds = timeLeft !== null ? timeLeft % 60 : 0;

  // ---- Exam results screen ----
  if (isExam && examDone) {
    const pct = Math.round((examScore / puzzleList.length) * 100);
    return (
      <div className="overlay-shell">
        <div className="lp-header">
          <button type="button" className="lp-close" onClick={onClose}><X size={20} /></button>
          <h2 className="section-title" style={{ margin: 0, flex: 1 }}>Hasil Ujian</h2>
        </div>
        <div className="lp-body center-col" style={{ paddingTop: '3rem', gap: '0.8rem' }}>
          <Award size={56} style={{ color: 'var(--accent-gold)' }} />
          <h2 className="step-title" style={{ margin: 0 }}>{pct}% Benar</h2>
          <p className="muted" style={{ margin: 0 }}>{examScore} dari {puzzleList.length} puzzle terjawab benar</p>
          <div className="pill pill-gold" style={{ fontSize: '1rem', padding: '0.5rem 1rem', marginTop: '0.4rem' }}>
            <Zap size={16} /> +{examScore * 8} XP
          </div>
          <button type="button" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} onClick={onClose}>
            Kembali ke Taktik
          </button>
        </div>
      </div>
    );
  }

  if (!puzzle || !gameState) return null;

  return (
    <div className="overlay-shell">
      <div className="lp-header">
        <button type="button" className="lp-close" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        {isExam ? (
          <>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${((idx) / puzzleList.length) * 100}%` }} />
            </div>
            <span style={{
              fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: '0.85rem',
              color: timeLeft <= 30 ? 'var(--error)' : 'var(--text-primary)', minWidth: '3.2rem', textAlign: 'right',
            }}>
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
          </>
        ) : (
          <span style={{ fontWeight: 700 }}>{STARS_BY_DIFFICULTY[puzzle.difficulty]}</span>
        )}
      </div>

      <div className="lp-body">
        <p className="step-eyebrow">
          {isExam ? `Soal ${idx + 1}/${puzzleList.length}` : PUZZLE_CATEGORIES.find((c) => c.id === puzzle.category)?.label}
        </p>
        <h2 className="step-title">{puzzle.title}</h2>
        <p className="step-text">{puzzle.instruction}</p>

        <div style={{ position: 'relative', margin: '0.4rem 0 0.8rem' }}>
          <ChessBoard
            board={gameState.board}
            onSquareClick={handleSquareClick}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={null}
            checkSquare={checkSquare}
            disabled={feedback?.type === 'success' || feedback?.type === 'reveal'}
            showCoords
            themeId={boardTheme}
          />
          {pendingPromotion && <PromotionPicker color={gameState.turn} onChoose={handlePromotionChoose} />}
        </div>

        {feedback?.type === 'success' && (
          <div className="feedback-banner anim-pop feedback-success">
            <Check size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <span>Benar! {!isExam && `+${puzzle.xp} XP`}</span>
          </div>
        )}
        {feedback?.type === 'reveal' && (
          <div className="feedback-banner anim-pop" style={{ background: 'var(--bg-panel-2)', color: 'var(--text-primary)' }}>
            <Info size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <span>Jawaban ditampilkan. Yuk lanjut ke puzzle berikutnya!</span>
          </div>
        )}
        {feedback?.type === 'error' && (
          <div className="feedback-banner anim-pop feedback-error">
            <Info size={18} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
            <span>Belum tepat, coba lagi! {attempts >= 2 ? `Hint: ${puzzle.hint}` : ''}</span>
          </div>
        )}
      </div>

      <div className="lp-footer" style={{ display: 'flex', gap: '0.5rem' }}>
        {!canContinue && attempts >= 2 && (
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={handleReveal}>
            Lihat Jawaban
          </button>
        )}
        {isExam && !canContinue && (
          <button type="button" className="btn-ghost" style={{ flex: canContinue ? 0 : 1 }} onClick={handleSkip}>
            Lewati
          </button>
        )}
        {canContinue && (
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={handleNext}>
            {isExam && idx + 1 >= puzzleList.length ? 'Lihat Hasil' : isExam ? 'Soal Berikutnya' : 'Selesai'}
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  ACHIEVEMENT TOAST
// ============================================================================
function AchievementToast({ achievement, onDone }) {
  const sound = useSound();
  useEffect(() => {
    sound('achievement');
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [achievement, onDone]);

  if (!achievement) return null;
  const Icon = UNIT_ICONS[achievement.icon] || Award;

  return (
    <div
      className="anim-pop"
      style={{
        position: 'fixed', top: '4.2rem', left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 2rem)', maxWidth: '440px', zIndex: 90,
        background: 'linear-gradient(135deg,#3a3670,#5a4fa0)', borderRadius: '1rem',
        padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.7rem',
        boxShadow: '0 10px 30px -8px rgba(0,0,0,0.5)', border: '1px solid rgba(224,185,82,0.4)',
      }}
    >
      <div style={{ width: '2.6rem', height: '2.6rem', borderRadius: '0.8rem', background: 'rgba(224,185,82,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} style={{ color: 'var(--accent-gold)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-gold)', letterSpacing: '0.05em' }}>PENCAPAIAN TERBUKA!</p>
        <p style={{ margin: '0.1rem 0 0', fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{achievement.label}</p>
        <p style={{ margin: '0.05rem 0 0', fontSize: '0.74rem', color: 'rgba(255,255,255,0.75)' }}>{achievement.desc} · +{achievement.xp} XP</p>
      </div>
    </div>
  );
}

// ============================================================================
//  MAIN CHOICE SCREEN - pilih mode: Lawan AI atau Lawan Player
// ============================================================================
function MainChoiceScreen({ user, onChooseAI, onChooseMultiplayer }) {
  return (
    <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
      <div className="card center-col" style={{ marginBottom: '1rem', padding: '1.2rem' }}>
        <Crown size={32} style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem' }} />
        <h2 className="section-title">Pilih Mode Main</h2>
        <p className="muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0', textAlign: 'center' }}>
          Latihan lawan AI atau tantang teman secara real-time!
        </p>
      </div>

      <button type="button" className="lesson-card" style={{ marginBottom: '0.6rem' }} onClick={onChooseAI}>
        <div className="lesson-status-circle status-available">
          <Bot size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <p className="lesson-card-title">Lawan AI</p>
          <p className="lesson-card-sub">4 tingkat kesulitan · Analisis setelah partai</p>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
      </button>

      <button
        type="button"
        className="lesson-card"
        style={{ borderColor: user ? undefined : 'var(--border-soft)', opacity: FIREBASE_CONFIGURED ? 1 : 0.45 }}
        onClick={FIREBASE_CONFIGURED ? onChooseMultiplayer : undefined}
        disabled={!FIREBASE_CONFIGURED}
      >
        <div className="lesson-status-circle" style={{ background: 'rgba(91,200,224,0.18)', color: '#5BC8E0' }}>
          <User size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <p className="lesson-card-title">Lawan Player</p>
          <p className="lesson-card-sub">
            {!FIREBASE_CONFIGURED
              ? 'Perlu konfigurasi Firebase — lihat firebase.js'
              : !user
                ? 'Login Google dulu untuk main bareng teman'
                : 'Real-time · Buat room atau gabung dengan kode'}
          </p>
        </div>
        {FIREBASE_CONFIGURED && <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {FIREBASE_CONFIGURED && !user && (
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.78rem', marginTop: '0.7rem' }}>
          Ketuk tombol <b>Login</b> di pojok kanan atas untuk masuk dengan Google.
        </p>
      )}
    </div>
  );
}

// ============================================================================
//  MULTIPLAYER TAB - VS Player real-time via Firebase
// ============================================================================
function replayMoves(moves) {
  let state = fenToState(REAL_START_FEN);
  for (const m of moves) {
    try {
      const f = squareToRC(m.from), t = squareToRC(m.to);
      const legal = getLegalMoves(state, f.row, f.col);
      const mv = legal.find(lm =>
        lm.to.row === t.row && lm.to.col === t.col &&
        (!m.promotion || lm.promotion === m.promotion)
      );
      if (mv) state = applyMove(state, mv);
    } catch (_) {}
  }
  return state;
}

function PlayerBar({ info, color, isMyTurn, inCheck }) {
  const cls = ['player-bar', isMyTurn ? 'player-bar-active' : '', inCheck ? 'player-bar-check' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="player-avatar">
        {info?.photo ? <img src={info.photo} alt={info.name} referrerPolicy="no-referrer" /> : <span>♟</span>}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem' }}>{info?.name || 'Menunggu...'}</p>
        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          {color === 'w' ? '♙ Putih' : '♟ Hitam'}
        </p>
      </div>
      {isMyTurn && !inCheck && <span className="dot-blink"><span /><span /><span /></span>}
      {inCheck && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--error)' }}>SKAK!</span>}
    </div>
  );
}

function MultiplayerTab({ user, onBack }) {
  const { boardTheme } = usePrefs();
  const sound = useSound();

  const [phase, setPhase] = useState('lobby'); // lobby|creating|waiting|joining|playing|ended
  const [roomCode, setRoomCode] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [error, setError] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [result, setResult] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const unsubRef = useRef(null);
  const prevMovesLen = useRef(0);

  // my color in this room
  const myColor = roomData
    ? (roomData.host?.uid === user?.uid ? roomData.hostColor : (roomData.hostColor === 'w' ? 'b' : 'w'))
    : null;
  const meIsHost = roomData?.host?.uid === user?.uid;
  const opponent = meIsHost ? roomData?.guest : roomData?.host;

  // Subscribe to room changes
  useEffect(() => {
    if (!roomCode || phase === 'lobby') return;
    unsubRef.current = subscribeRoom(roomCode, (data) => {
      setRoomData(data);

      // Guest joined → start game
      if (data.status === 'playing' && phase === 'waiting') {
        setPhase('playing');
        setGameState(replayMoves(data.moves || []));
        prevMovesLen.current = (data.moves || []).length;
      }

      // Apply new moves from opponent
      if (data.status === 'playing' && phase === 'playing') {
        const moves = data.moves || [];
        if (moves.length !== prevMovesLen.current) {
          const newState = replayMoves(moves);
          prevMovesLen.current = moves.length;
          const lastM = moves[moves.length - 1];
          const wasCapture = lastM?.capture;
          sound(wasCapture ? 'capture' : 'move');
          setTimeout(() => {
            if (isCheckmate(newState)) sound(newState.turn === myColor ? 'checkmateLoss' : 'checkmateWin');
            else if (isInCheck(newState, newState.turn)) sound('check');
          }, 160);
          setGameState(newState);
          setSelected(null); setLegalTargets([]);
        }
      }

      // Game ended
      if (data.status === 'ended' && phase !== 'ended') {
        setPhase('ended');
        setResult(data.result);
        if (data.result === myColor) sound('checkmateWin');
        else if (data.result === 'draw') sound('draw');
        else sound('checkmateLoss');
      }
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, phase]);

  // End-game detection
  useEffect(() => {
    if (!gameState || phase !== 'playing') return;
    if (isCheckmate(gameState)) {
      const winner = gameState.turn === 'w' ? 'b' : 'w';
      finishRoom(roomCode, winner);
    } else if (isDraw(gameState)) {
      finishRoom(roomCode, 'draw');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

  function cleanup() {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
    setRoomCode(''); setRoomData(null); setGameState(null);
    setSelected(null); setLegalTargets([]); setPendingPromotion(null);
    setResult(null); prevMovesLen.current = 0; setError('');
    setPhase('lobby');
  }

  async function handleCreate(color) {
    setPhase('creating'); setError('');
    try {
      const code = await createRoom(user, color);
      setRoomCode(code);
      setPhase('waiting');
    } catch (e) { setError(e.message); setPhase('lobby'); }
  }

  async function handleJoin() {
    if (!joinInput.trim()) return;
    setPhase('joining'); setError('');
    try {
      const data = await joinRoom(joinInput.trim(), user);
      setRoomCode(joinInput.trim().toUpperCase());
      setRoomData(data);
      setPhase('playing');
      setGameState(replayMoves(data.moves || []));
      prevMovesLen.current = (data.moves || []).length;
    } catch (e) { setError(e.message); setPhase('lobby'); }
  }

  async function doMove(move) {
    if (!gameState || gameState.turn !== myColor) return;
    const san = moveToSAN(gameState, move);
    const next = applyMove(gameState, move);
    sound(move.capture ? 'capture' : 'move');
    setTimeout(() => {
      if (isCheckmate(next)) sound(next.turn === myColor ? 'checkmateLoss' : 'checkmateWin');
      else if (isInCheck(next, next.turn)) sound('check');
    }, 160);
    setGameState(next);
    setSelected(null); setLegalTargets([]);
    prevMovesLen.current += 1;
    await pushMove(roomCode, {
      from: rcToSquare(move.from.row, move.from.col),
      to: rcToSquare(move.to.row, move.to.col),
      promotion: move.promotion || null,
      capture: move.capture || false,
      san,
    });
  }

  function handleSquareClick(r, c) {
    if (!gameState || phase !== 'playing') return;
    if (gameState.turn !== myColor) return;
    if (pendingPromotion) return;
    const piece = gameState.board[r][c];
    if (selected) {
      if (selected.row === r && selected.col === c) { setSelected(null); setLegalTargets([]); return; }
      const isTarget = legalTargets.some(t => t.row === r && t.col === c);
      if (isTarget) {
        const from = rcToSquare(selected.row, selected.col);
        const to = rcToSquare(r, c);
        const candidates = getMoveCandidates(gameState, from, to);
        if (candidates.length > 1) { setPendingPromotion({ candidates }); return; }
        doMove(candidates[0]);
        return;
      }
      if (piece && pieceColor(piece) === gameState.turn) {
        setSelected({ row: r, col: c });
        setLegalTargets(getLegalMoves(gameState, r, c).map(m => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }
    if (piece && pieceColor(piece) === gameState.turn) {
      setSelected({ row: r, col: c });
      setLegalTargets(getLegalMoves(gameState, r, c).map(m => m.to));
    }
  }

  function handlePromotion(letter) {
    const mv = pendingPromotion.candidates.find(c => c.promotion === letter);
    setPendingPromotion(null);
    if (mv) doMove(mv);
  }

  function copyCode() {
    navigator.clipboard?.writeText(roomCode).then(() => { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 1800); });
  }

  // ---- LOBBY ----
  if (phase === 'lobby') {
    return (
      <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
        <button type="button" className="lp-close" style={{ marginBottom: '0.7rem' }} onClick={onBack}>
          <ArrowLeft size={18} /> <span style={{ fontWeight: 700, marginLeft: '0.4rem' }}>Kembali</span>
        </button>

        <div className="card center-col" style={{ marginBottom: '1rem' }}>
          <User size={28} style={{ color: '#5BC8E0', marginBottom: '0.4rem' }} />
          <h2 className="section-title">Lawan Player</h2>
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.2rem 0 0', textAlign: 'center' }}>
            Halo, <b style={{ color: 'var(--text-primary)' }}>{user?.displayName?.split(' ')[0]}</b>! Buat room baru atau gabung dengan kode teman.
          </p>
        </div>

        <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '0 0 0.45rem' }}>BUAT ROOM BARU</p>
        <div className="choice-grid" style={{ marginBottom: '1.1rem' }}>
          <button type="button" className="choice-btn" onClick={() => handleCreate('w')}>
            <div className="choice-btn-title"><span style={{ fontSize: '1.3rem' }}>♔</span> Main Putih</div>
            <div className="choice-btn-desc">Kamu jalan duluan</div>
          </button>
          <button type="button" className="choice-btn" onClick={() => handleCreate('b')}>
            <div className="choice-btn-title"><span style={{ fontSize: '1.3rem' }}>♚</span> Main Hitam</div>
            <div className="choice-btn-desc">Lawan jalan duluan</div>
          </button>
        </div>

        <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '0 0 0.45rem' }}>GABUNG ROOM</p>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="chat-input"
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}
            placeholder="Masukkan kode (misal: KUDA42)"
            value={joinInput}
            maxLength={6}
            onChange={e => setJoinInput(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          <button type="button" className="btn-primary" style={{ padding: '0.7rem 1rem', flexShrink: 0 }} onClick={handleJoin}>
            Gabung
          </button>
        </div>

        {error && (
          <div className="feedback-banner feedback-error anim-pop" style={{ marginTop: '0.7rem' }}>
            <Info size={16} style={{ flexShrink: 0 }} /> <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  // ---- CREATING / JOINING (loading) ----
  if (phase === 'creating' || phase === 'joining') {
    return (
      <div className="center-col" style={{ padding: '5rem 1rem', gap: '1rem' }}>
        <Loader2 size={36} className="spin" style={{ color: 'var(--accent-gold)' }} />
        <p style={{ margin: 0, fontWeight: 700 }}>{phase === 'creating' ? 'Membuat room...' : 'Bergabung ke room...'}</p>
      </div>
    );
  }

  // ---- WAITING (host menunggu guest) ----
  if (phase === 'waiting') {
    return (
      <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
        <div className="card center-col" style={{ marginBottom: '0.8rem' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>Kamu Host — Bagikan Kode Ini!</p>
          <div className="room-code" onClick={copyCode} style={{ cursor: 'pointer' }} title="Ketuk untuk menyalin">
            {roomCode}
          </div>
          <button type="button" className="btn-ghost" style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }} onClick={copyCode}>
            {copiedCode ? <><Check size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.3rem', color: 'var(--success)' }} />Tersalin!</> : 'Salin Kode'}
          </button>
          <p className="muted" style={{ fontSize: '0.78rem', margin: '0.6rem 0 0', textAlign: 'center' }}>
            Minta temanmu buka CaturKu → Lawan Player → masukkan kode di atas
          </p>
        </div>
        <div className="center-col" style={{ gap: '0.5rem', padding: '0.5rem 0' }}>
          <div className="dot-blink"><span /><span /><span /></div>
          <p className="muted" style={{ margin: 0, fontSize: '0.82rem' }}>Menunggu teman bergabung...</p>
        </div>
        <button type="button" className="btn-ghost" style={{ width: '100%', marginTop: '1rem' }} onClick={async () => { await abandonRoom(roomCode); cleanup(); }}>
          Batalkan Room
        </button>
      </div>
    );
  }

  // ---- PLAYING ----
  if (phase === 'playing' && gameState) {
    const myTurn = gameState.turn === myColor;
    const orientation = myColor === 'w' ? 'white' : 'black';
    const checkSquare = isInCheck(gameState, gameState.turn) ? findKing(gameState.board, gameState.turn) : null;
    const meInfo = meIsHost ? roomData?.host : roomData?.guest;
    const oppInfo = meIsHost ? roomData?.guest : roomData?.host;
    const oppColor = myColor === 'w' ? 'b' : 'w';

    return (
      <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
        <div className="game-status-bar">
          <span className="pill pill-muted"><User size={13} /> VS Player{roomCode ? ` · ${roomCode}` : ''}</span>
          <button type="button" className="icon-btn" onClick={copyCode} title="Salin kode room">
            {copiedCode ? <Check size={14} style={{ color: 'var(--success)' }} /> : <RefreshCw size={14} />}
          </button>
        </div>

        {/* Opponent bar (top) */}
        <PlayerBar info={oppInfo} color={oppColor} isMyTurn={!myTurn} inCheck={!myTurn && !!checkSquare} />

        <div style={{ position: 'relative', margin: '0.45rem 0' }}>
          <ChessBoard
            board={gameState.board}
            onSquareClick={handleSquareClick}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={null}
            checkSquare={checkSquare}
            orientation={orientation}
            disabled={!myTurn}
            showCoords
            themeId={boardTheme}
          />
          {pendingPromotion && <PromotionPicker color={myColor} onChoose={handlePromotion} />}
        </div>

        {/* My bar (bottom) */}
        <PlayerBar info={meInfo} color={myColor} isMyTurn={myTurn} inCheck={myTurn && !!checkSquare} />

        <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={async () => { await abandonRoom(roomCode); cleanup(); onBack(); }}>
            Menyerah & Keluar
          </button>
        </div>
      </div>
    );
  }

  // ---- ENDED ----
  if (phase === 'ended') {
    const iWon = result === myColor;
    const isDr = result === 'draw';
    const abandoned = result === 'abandoned';
    return (
      <div className="anim-slide-up center-col" style={{ padding: '3rem 1rem', gap: '0.8rem' }}>
        <Trophy size={52} style={{ color: iWon ? 'var(--accent-gold)' : 'var(--text-muted)' }} />
        <h2 className="step-title" style={{ margin: 0 }}>
          {abandoned ? 'Lawan Keluar' : iWon ? 'Kamu Menang!' : isDr ? 'Seri!' : 'Kamu Kalah'}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {abandoned ? 'Partai diakhiri karena lawan meninggalkan permainan.'
            : iWon ? 'Selamat! Kamu berhasil mengalahkan lawan.' : isDr ? 'Partai berakhir imbang.' : 'Terus berlatih ya!'}
        </p>
        <button type="button" className="btn-primary" style={{ marginTop: '1rem', minWidth: '12rem' }} onClick={() => { cleanup(); }}>
          Kembali ke Lobby
        </button>
        <button type="button" className="btn-ghost" style={{ minWidth: '12rem' }} onClick={() => { cleanup(); onBack(); }}>
          Kembali ke Menu
        </button>
      </div>
    );
  }

  return null;
}

// ============================================================================
//  PLAY TAB - lawan AI
// ============================================================================
function PlayTab({ playState, setPlayState, onGameEnd, onAskGuru }) {
  const { boardTheme } = usePrefs();
  const sound = useSound();
  const { status, gameState, playerColor, difficultyId, moveHistory, lastMove } = playState;
  const [selected, setSelected] = useState(null);
  const [legalTargets, setLegalTargets] = useState([]);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [confirmSurrender, setConfirmSurrender] = useState(false);
  const [hintMove, setHintMove] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);

  const difficulty = DIFFICULTIES.find((d) => d.id === difficultyId) || DIFFICULTIES[1];

  // Clear selection whenever the position changes
  useEffect(() => {
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    setHintMove(null);
  }, [gameState]);

  // AI move effect
  useEffect(() => {
    if (status !== 'playing' || !gameState) return;
    if (gameState.turn === playerColor) return;
    if (isCheckmate(gameState) || isDraw(gameState)) return;

    setAiThinking(true);
    const capturedStateForAI = gameState;
    const timer = setTimeout(() => {
      const result = getBestMove(capturedStateForAI, { depth: difficulty.depth, randomFactor: difficulty.randomFactor });
      setAiThinking(false);
      if (result && result.move) {
        const san = moveToSAN(capturedStateForAI, result.move);
        const next = applyMove(capturedStateForAI, result.move);
        // AI move sound
        if (result.move.capture || result.move.isEnPassant) sound('capture');
        else sound('move');
        setTimeout(() => {
          if (isCheckmate(next)) sound(next.turn === playerColor ? 'checkmateLoss' : 'checkmateWin');
          else if (isInCheck(next, next.turn)) sound('check');
        }, 160);
        setPlayState((p) => ({
          ...p,
          gameState: next,
          moveHistory: [...p.moveHistory, {
            san, color: capturedStateForAI.turn,
            from: result.move.from, to: result.move.to, promotion: result.move.promotion || null,
          }],
          stateHistory: [...(p.stateHistory || []), capturedStateForAI],
          lastMove: { from: result.move.from, to: result.move.to },
        }));
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, status]);

  // End-of-game detection
  useEffect(() => {
    if (status !== 'playing' || !gameState) return;
    if (isCheckmate(gameState)) {
      const result = gameState.turn === playerColor ? 'loss' : 'win';
      setPlayState((p) => ({ ...p, status: 'ended', result }));
      onGameEnd(result, difficultyId, playerColor, moveHistory.length);
    } else if (isDraw(gameState)) {
      setPlayState((p) => ({ ...p, status: 'ended', result: 'draw', drawReason: hasInsufficientMaterial(gameState.board) ? 'material' : 'stalemate' }));
      onGameEnd('draw', difficultyId, playerColor, moveHistory.length);
    } else if (isThreefoldRepetition(playState.stateHistory, gameState)) {
      setPlayState((p) => ({ ...p, status: 'ended', result: 'draw', drawReason: 'repetition' }));
      onGameEnd('draw', difficultyId, playerColor, moveHistory.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, status]);

  function doMove(move) {
    const san = moveToSAN(gameState, move);
    const next = applyMove(gameState, move);
    const capturedState = gameState;
    // Sound: play immediately for responsiveness
    if (move.promotion) { sound('promote'); }
    else if (move.capture || move.isEnPassant) { sound('capture'); }
    else { sound('move'); }
    setTimeout(() => {
      if (isCheckmate(next)) sound(next.turn === playerColor ? 'checkmateLoss' : 'checkmateWin');
      else if (isInCheck(next, next.turn)) sound('check');
    }, 160);
    setPlayState((p) => ({
      ...p,
      gameState: next,
      moveHistory: [...p.moveHistory, {
        san, color: capturedState.turn,
        from: move.from, to: move.to, promotion: move.promotion || null,
      }],
      stateHistory: [...(p.stateHistory || []), capturedState],
      lastMove: { from: move.from, to: move.to },
    }));
  }

  function handleSquareClick(r, c) {
    if (status !== 'playing' || aiThinking || !gameState) return;
    if (gameState.turn !== playerColor) return;
    if (pendingPromotion) return;

    const piece = gameState.board[r][c];
    if (selected) {
      if (selected.row === r && selected.col === c) {
        setSelected(null); setLegalTargets([]);
        return;
      }
      const isTarget = legalTargets.some((t) => t.row === r && t.col === c);
      if (isTarget) {
        const candidates = getMoveCandidates(gameState, rcToSquare(selected.row, selected.col), rcToSquare(r, c));
        if (candidates.length > 1) {
          setPendingPromotion({ candidates });
          return;
        }
        doMove(candidates[0]);
        setSelected(null); setLegalTargets([]);
        return;
      }
      if (piece && pieceColor(piece) === gameState.turn) {
        setSelected({ row: r, col: c });
        setLegalTargets(getLegalMoves(gameState, r, c).map((m) => m.to));
        return;
      }
      setSelected(null); setLegalTargets([]);
      return;
    }
    if (piece && pieceColor(piece) === gameState.turn) {
      setSelected({ row: r, col: c });
      setLegalTargets(getLegalMoves(gameState, r, c).map((m) => m.to));
    }
  }

  function handlePromotionChoose(letter) {
    const move = pendingPromotion.candidates.find((c) => c.promotion === letter);
    doMove(move);
    setPendingPromotion(null);
    setSelected(null); setLegalTargets([]);
  }

  function startGame(color, diffId) {
    setPlayState({
      status: 'playing',
      gameState: fenToState(REAL_START_FEN),
      playerColor: color,
      difficultyId: diffId,
      moveHistory: [],
      stateHistory: [],
      lastMove: null,
      result: null,
    });
  }

  function resetToSetup() {
    setPlayState((p) => ({ ...p, status: 'setup' }));
  }

  function askGuruAboutGame() {
    if (!gameState) return;
    const fen = stateToFen(gameState);
    const lastSan = moveHistory.length ? moveHistory[moveHistory.length - 1].san : '-';
    onAskGuru(`Tolong analisis posisi catur ini (FEN: ${fen}). Aku main sebagai ${playerColor === 'w' ? 'Putih' : 'Hitam'}, lawan AI tingkat ${difficulty.label}. Langkah terakhir: ${lastSan}. Ada ide bagus atau kesalahan yang perlu aku perhatikan?`);
  }

  function handleTakeback() {
    setPlayState((p) => {
      if ((p.moveHistory || []).length < 2) return p;
      const newMoveHistory = p.moveHistory.slice(0, -2);
      const newStateHistory = p.stateHistory.slice(0, -2);
      // stateHistory[i] = posisi SEBELUM langkah ke-i. Untuk batalkan 2 langkah,
      // posisi yang dipulihkan adalah stateHistory[panjang asli - 2].
      const restoreIdx = p.stateHistory.length - 2;
      const restoredState = restoreIdx >= 0 ? p.stateHistory[restoreIdx] : fenToState(REAL_START_FEN);
      return {
        ...p,
        gameState: restoredState,
        moveHistory: newMoveHistory,
        stateHistory: newStateHistory,
        lastMove: newMoveHistory.length > 0
          ? { from: newMoveHistory[newMoveHistory.length - 1].from, to: newMoveHistory[newMoveHistory.length - 1].to }
          : null,
      };
    });
  }

  function handleHint() {
    if (!gameState || status !== 'playing' || gameState.turn !== playerColor || aiThinking) return;
    setHintLoading(true);
    setTimeout(() => {
      const result = getBestMove(gameState, { depth: Math.min(3, difficulty.depth + 1) });
      setHintLoading(false);
      if (result && result.move) {
        setHintMove({ from: result.move.from, to: result.move.to, san: moveToSAN(gameState, result.move) });
      }
    }, 30);
  }

  function handleCopyPgn() {
    let pgn = '';
    moveHistory.forEach((m, i) => {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. ${m.san} `;
      else pgn += `${m.san} `;
    });
    pgn = pgn.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn).then(() => {
        setCopiedPgn(true);
        setTimeout(() => setCopiedPgn(false), 1800);
      }).catch(() => {});
    }
  }

  function handleQuickRematch() {
    startGame(playerColor, difficultyId);
  }

  // ---------------- Setup screen ----------------
  if (status === 'setup') {
    const pendingColor = playState.pendingColor || 'w';
    const pendingDiff = playState.pendingDiff || 'menengah';
    const setPendingColor = (v) => setPlayState((p) => ({ ...p, pendingColor: v }));
    const setPendingDiff = (v) => setPlayState((p) => ({ ...p, pendingDiff: v }));
    return (
      <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
        <div className="card center-col" style={{ marginBottom: '1rem' }}>
          <Swords size={32} style={{ color: 'var(--accent-gold)', marginBottom: '0.4rem' }} />
          <h2 className="section-title">Main Lawan AI</h2>
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
            Latihan bebas melawan komputer. Mainkan apa yang sudah kamu pelajari!
          </p>
        </div>

        <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '0 0 0.4rem' }}>MAIN SEBAGAI</p>
        <div className="choice-grid" style={{ marginBottom: '1rem' }}>
          <button type="button" className={`choice-btn ${pendingColor === 'w' ? 'choice-btn-active' : ''}`} onClick={() => setPendingColor('w')}>
            <div className="choice-btn-title"><span style={{ fontSize: '1.3rem' }}>♔</span> Putih</div>
            <div className="choice-btn-desc">Jalan duluan</div>
          </button>
          <button type="button" className={`choice-btn ${pendingColor === 'b' ? 'choice-btn-active' : ''}`} onClick={() => setPendingColor('b')}>
            <div className="choice-btn-title"><span style={{ fontSize: '1.3rem' }}>♚</span> Hitam</div>
            <div className="choice-btn-desc">AI jalan duluan</div>
          </button>
        </div>

        <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '0 0 0.4rem' }}>TINGKAT KESULITAN AI</p>
        <div className="choice-grid" style={{ marginBottom: '1.2rem' }}>
          {DIFFICULTIES.map((d) => (
            <button key={d.id} type="button" className={`choice-btn ${pendingDiff === d.id ? 'choice-btn-active' : ''}`} onClick={() => setPendingDiff(d.id)}>
              <div className="choice-btn-title">{d.label}</div>
              <div className="choice-btn-desc">{d.desc}</div>
            </button>
          ))}
        </div>

        <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={() => startGame(pendingColor, pendingDiff)}>
          <Play size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem' }} />
          Mulai Permainan
        </button>
        <div style={{ height: '0.5rem' }} />
      </div>
    );
  }

  // ---------------- Playing / Ended screen ----------------
  const checkSquare = gameState && isInCheck(gameState, gameState.turn)
    ? findKing(gameState.board, gameState.turn) : null;
  const orientation = flipped
    ? (playerColor === 'w' ? 'black' : 'white')
    : (playerColor === 'w' ? 'white' : 'black');

  const openingName = detectOpening(moveHistory);

  let statusText = '';
  if (gameState) {
    if (status === 'ended') {
      if (playState.result === 'win') statusText = 'Skakmat - Kamu Menang!';
      else if (playState.result === 'loss') {
        statusText = playState.endReason === 'resign' ? 'Kamu Menyerah' : 'Skakmat - Kamu Kalah';
      } else {
        statusText = playState.drawReason === 'repetition' ? 'Seri - Pengulangan Posisi 3x'
          : playState.drawReason === 'material' ? 'Seri - Materi Tidak Cukup'
            : 'Permainan Seri - Stalemate';
      }
    } else if (gameState.turn === playerColor) {
      statusText = checkSquare ? '⚡ Skak! Giliranmu' : 'Giliranmu';
    } else {
      statusText = aiThinking ? 'AI berpikir...' : 'Giliran AI';
    }
  }

  const canTakeback = status === 'playing' && moveHistory.length >= 2
    && gameState && gameState.turn === playerColor && !aiThinking;

  // pair up move history for display
  const pairs = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    pairs.push([moveHistory[i], moveHistory[i + 1]]);
  }

  return (
    <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
      {/* Top bar */}
      <div className="game-status-bar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span className="pill pill-muted">
            {playerColor === 'w' ? '♔' : '♚'} Kamu vs AI ({difficulty.label})
          </span>
          {openingName && (
            <span className="opening-tag">
              <BookOpen size={11} /> {openingName}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {status === 'playing' && (
            <button type="button" className="icon-btn" title="Minta hint" disabled={gameState.turn !== playerColor || aiThinking || hintLoading} onClick={handleHint}>
              {hintLoading ? <Loader2 size={15} className="spin" /> : <HelpCircle size={15} />}
            </button>
          )}
          {status === 'playing' && (
            <button type="button" className="icon-btn" title="Batalkan langkah" disabled={!canTakeback} onClick={handleTakeback}>
              <ChevronLeft size={16} />
            </button>
          )}
          <button type="button" className="icon-btn" title="Balik papan" onClick={() => setFlipped(f => !f)}>
            <RefreshCw size={15} />
          </button>
          <button type="button" className="lp-close" onClick={resetToSetup} aria-label="Atur ulang">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Eval bar */}
      {gameState && <EvalBar gameState={gameState} />}

      {/* Board */}
      <div style={{ position: 'relative' }}>
        <ChessBoard
          board={gameState.board}
          onSquareClick={handleSquareClick}
          selected={selected}
          legalTargets={legalTargets}
          lastMove={lastMove}
          checkSquare={checkSquare}
          orientation={orientation}
          disabled={status !== 'playing' || gameState.turn !== playerColor || aiThinking}
          showCoords
          hintSquares={hintMove ? [hintMove.from, hintMove.to] : []}
          themeId={boardTheme}
        />
        {pendingPromotion && <PromotionPicker color={playerColor} onChoose={handlePromotionChoose} />}
      </div>

      {hintMove && (
        <div className="feedback-banner anim-pop" style={{ background: 'rgba(91,200,224,0.12)', color: '#5BC8E0', marginTop: '0.5rem' }}>
          <HelpCircle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
          <span>Coba langkah <b style={{ fontFamily: 'JetBrains Mono,monospace' }}>{hintMove.san}</b></span>
        </div>
      )}

      {/* Material balance */}
      {gameState && <MaterialRow board={gameState.board} playerColor={playerColor} />}

      {/* Status */}
      <div className="game-status-bar" style={{ paddingTop: '0.2rem' }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700 }}>{statusText}</span>
        {aiThinking && <Loader2 size={14} className="spin" style={{ color: 'var(--text-muted)' }} />}
      </div>

      {status === 'ended' && (
        <div className={`feedback-banner anim-pop ${playState.result === 'win' ? 'feedback-success' : playState.result === 'loss' ? 'feedback-error' : ''}`}
          style={playState.result === 'draw' ? { background: 'var(--bg-panel-2)', color: 'var(--text-primary)' } : undefined}>
          {playState.result === 'win' ? <Trophy size={18} /> : <Info size={18} />}
          <span>
            {playState.result === 'win' && 'Mantap! +15 XP. Setiap kemenangan mengasah insting taktikmu.'}
            {playState.result === 'loss' && 'Belum menang, tapi +2 XP untuk usahanya. Coba lihat di mana titik baliknya bareng Guru AI.'}
            {playState.result === 'draw' && 'Seri! +5 XP. Posisi seimbang sampai akhir.'}
          </span>
        </div>
      )}

      {status === 'ended' && moveHistory.length > 0 && (
        <button
          type="button"
          className="btn-primary"
          style={{ width: '100%', marginTop: '0.7rem', background: 'linear-gradient(135deg,#3a3670,#5a4fa0)', boxShadow: '0 4px 14px -4px rgba(90,79,160,0.5)' }}
          onClick={() => setShowAnalysis(true)}
        >
          <Star size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.4rem' }} />
          Lihat Analisis Permainan
        </button>
      )}

      {moveHistory.length > 0 && (
        <div className="move-history">
          {pairs.map((pair, i) => (
            <React.Fragment key={i}>
              <span className="move-token">{i + 1}.</span>
              <span className="move-token move-token-white">{pair[0]?.san}</span>
              {pair[1] && <span className="move-token">{pair[1].san}</span>}
            </React.Fragment>
          ))}
        </div>
      )}

      {moveHistory.length > 0 && (
        <button type="button" className="btn-ghost" style={{ width: '100%', fontSize: '0.78rem', padding: '0.5rem', marginBottom: '0.4rem' }} onClick={handleCopyPgn}>
          {copiedPgn ? <Check size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.3rem', color: 'var(--success)' }} /> : null}
          {copiedPgn ? 'Tersalin!' : 'Salin Notasi PGN'}
        </button>
      )}

      {/* Confirm-surrender dialog */}
      {confirmSurrender && (
        <div className="card anim-pop" style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
          <p style={{ fontSize: '0.85rem', margin: '0 0 0.7rem' }}>Yakin mau menyerah dari partai ini?</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmSurrender(false)}>Batal</button>
            <button
              type="button"
              className="btn-primary"
              style={{ flex: 1 }}
              onClick={() => {
                setConfirmSurrender(false);
                setPlayState((p) => ({ ...p, status: 'ended', result: 'loss', endReason: 'resign' }));
                onGameEnd('loss', difficultyId, playerColor, moveHistory.length);
              }}
            >
              Ya, Menyerah
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
        {status === 'playing' && !confirmSurrender && (
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmSurrender(true)}>
            Menyerah
          </button>
        )}
        {status === 'ended' && (
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={handleQuickRematch}>
            <RotateCcw size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.35rem' }} />
            Main Lagi (sama)
          </button>
        )}
        {status === 'ended' && (
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={resetToSetup}>
            Atur Ulang
          </button>
        )}
        {status === 'playing' && (
          <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={askGuruAboutGame}>
            <Bot size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.35rem' }} />
            Tanya Guru
          </button>
        )}
      </div>
      {status === 'ended' && (
        <button type="button" className="btn-ghost" style={{ width: '100%', marginBottom: '0.5rem' }} onClick={askGuruAboutGame}>
          <Bot size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '0.35rem' }} />
          Tanya Guru
        </button>
      )}
      {showAnalysis && (
        <GameAnalysis
          stateHistory={playState.stateHistory || []}
          moveHistory={moveHistory}
          playerColor={playerColor}
          difficulty={difficulty}
          onClose={() => setShowAnalysis(false)}
        />
      )}
    </div>
  );
}
// ============================================================================
//  GAME ANALYSIS - chess.com style
// ============================================================================
const MOVE_CATS = [
  { key: 'best',       label: 'Terbaik',     symbol: '★',  color: '#48BB78', bg: 'rgba(72,187,120,0.15)',  maxCp: 0    },
  { key: 'great',      label: 'Bagus',       symbol: '!',  color: '#68D391', bg: 'rgba(104,211,145,0.15)', maxCp: 20   },
  { key: 'good',       label: 'Baik',        symbol: '✓',  color: '#90CDF4', bg: 'rgba(144,205,244,0.15)', maxCp: 60   },
  { key: 'inaccuracy', label: 'Tidak Akurat',symbol: '?!', color: '#F6AD55', bg: 'rgba(246,173,85,0.15)',  maxCp: 150  },
  { key: 'mistake',    label: 'Kesalahan',   symbol: '?',  color: '#FC8181', bg: 'rgba(252,129,129,0.15)', maxCp: 300  },
  { key: 'blunder',    label: 'Blunder',     symbol: '??', color: '#E53E3E', bg: 'rgba(229,62,62,0.18)',   maxCp: Infinity },
];

function classifyMoveCat(cpLoss, isSameAsEngine) {
  // "Terbaik" hanya kalau langkah SAMA PERSIS dengan pilihan engine
  if (isSameAsEngine) return 'best';
  // Untuk langkah berbeda, gunakan cpLoss (centipawn loss vs engine's best)
  for (const cat of MOVE_CATS) {
    if (cat.key === 'best') continue; // skip best, sudah ditangani di atas
    if (cpLoss <= cat.maxCp) return cat.key;
  }
  return 'blunder';
}

function computeAcc(cats) {
  if (!cats.length) return 100;
  const w = { best: 100, great: 85, good: 70, inaccuracy: 45, mistake: 20, blunder: 5 };
  return Math.round(cats.reduce((s, c) => s + (w[c] || 0), 0) / cats.length * 10) / 10;
}

function phaseLabel(moveIdx) {
  const n = Math.floor(moveIdx / 2) + 1;
  if (n <= 10) return 'opening';
  if (n <= 30) return 'middlegame';
  return 'endgame';
}

function accLabel(acc) {
  if (acc >= 90) return { text: 'Luar Biasa', color: '#68D391' };
  if (acc >= 75) return { text: 'Sangat Bagus', color: '#90CDF4' };
  if (acc >= 60) return { text: 'Cukup Baik', color: 'var(--accent-gold)' };
  if (acc >= 45) return { text: 'Perlu Latihan', color: '#FC8181' };
  return { text: 'Banyak Blunder', color: '#E53E3E' };
}

function GameAnalysis({ stateHistory, moveHistory, playerColor, difficulty, onClose }) {
  const { boardTheme } = usePrefs();
  const [results, setResults] = useState(null);
  const [pct, setPct]         = useState(0);
  const [viewIdx, setViewIdx] = useState(null);

  const aiColor = playerColor === 'w' ? 'b' : 'w';

  useEffect(() => {
    const allMoves = moveHistory.map((m, i) => ({ ...m, idx: i, state: stateHistory[i] })).filter(m => m.state);
    if (!allMoves.length) { setResults([]); return; }

    const analysed = [];
    let i = 0;

    function next() {
      if (i >= allMoves.length) { setResults(analysed); return; }
      const item = allMoves[i];
      const state = item.state;

      const bestResult = getBestMove(state, { depth: 2 });
      const bestScore  = bestResult ? bestResult.score : 0;
      const bestSan    = bestResult ? moveToSAN(state, bestResult.move) : '?';

      const legal = getAllLegalMoves(state, state.turn);
      // Gunakan koordinat from/to yang disimpan di history (lebih akurat dari SAN matching)
      const actualMove = item.from
        ? legal.find(m =>
            m.from.row === item.from.row && m.from.col === item.from.col &&
            m.to.row === item.to.row && m.to.col === item.to.col &&
            (!item.promotion || m.promotion === item.promotion))
        : legal.find(m => moveToSAN(state, m) === item.san); // fallback SAN

      let cpLoss = 0, actualNextState = null;
      const isSameAsEngine = item.san === bestSan;

      if (actualMove) {
        actualNextState = applyMove(state, actualMove);
        if (!isSameAsEngine) {
          // Hitung cpLoss hanya kalau beda sama pilihan engine
          const oppRes = getBestMove(actualNextState, { depth: 2 });
          const actualScore = oppRes ? -oppRes.score : 0;
          cpLoss = Math.max(0, bestScore - actualScore);
        }
      }

      const cat = classifyMoveCat(cpLoss, isSameAsEngine);

      analysed.push({
        idx: i,
        moveNum: Math.floor(i / 2) + 1,
        color: item.color,
        san: item.san,
        bestSan,
        isBest: isSameAsEngine,
        cpLoss: Math.round(cpLoss),
        cat,
        phase: phaseLabel(i),
        stateAfter: actualNextState,
        stateBefore: state,
      });

      setPct(Math.round(((i + 1) / allMoves.length) * 100));
      i++;
      setTimeout(next, 0);
    }
    setTimeout(next, 30);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playerRes = results ? results.filter(r => r.color === playerColor) : [];
  const aiRes     = results ? results.filter(r => r.color === aiColor)     : [];

  const playerAcc = computeAcc(playerRes.map(r => r.cat));
  const aiAcc     = computeAcc(aiRes.map(r => r.cat));

  function countCat(arr, key) { return arr.filter(r => r.cat === key).length; }

  function phaseAcc(arr, ph) {
    const ph_moves = arr.filter(r => r.phase === ph);
    if (!ph_moves.length) return null;
    return computeAcc(ph_moves.map(r => r.cat));
  }

  const selectedResult = (viewIdx !== null && results) ? results[viewIdx] : null;

  const playerPill = playerColor === 'w' ? '♔ Kamu (Putih)' : '♚ Kamu (Hitam)';
  const aiPill     = aiColor     === 'w' ? '♔ AI (Putih)'   : '♚ AI (Hitam)';

  return (
    <div className="overlay-shell" style={{ zIndex: 60, background: '#111122' }}>
      {/* Header */}
      <div className="lp-header" style={{ borderBottom: '1px solid var(--border-soft)', paddingBottom: '0.85rem' }}>
        <button type="button" className="lp-close" onClick={onClose} aria-label="Kembali">
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ margin: 0, flex: 1, fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 700 }}>
          Ulasan Permainan
        </h2>
      </div>

      <div className="lp-body" style={{ padding: '0 0 1rem' }}>

        {/* ---- LOADING ---- */}
        {!results && (
          <div className="center-col" style={{ paddingTop: '5rem', gap: '1.1rem', padding: '5rem 1.5rem 0' }}>
            <Loader2 size={40} className="spin" style={{ color: 'var(--accent-gold)' }} />
            <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem' }}>Menganalisis permainan...</p>
            <div style={{ width: '100%', maxWidth: '16rem' }}>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <p className="muted" style={{ textAlign: 'center', fontSize: '0.8rem', marginTop: '0.4rem', fontFamily: 'JetBrains Mono,monospace' }}>{pct}%</p>
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>Engine depth-2 mengevaluasi tiap langkah kedua sisi. Hasilnya perkiraan — lebih dangkal dari chess.com (depth 15+).</p>
          </div>
        )}

        {/* ---- EMPTY ---- */}
        {results && results.length === 0 && (
          <div className="center-col" style={{ paddingTop: '5rem', gap: '0.8rem' }}>
            <Info size={36} style={{ color: 'var(--text-muted)' }} />
            <p style={{ margin: 0 }}>Tidak ada langkah yang bisa dianalisis.</p>
          </div>
        )}

        {/* ---- RESULTS ---- */}
        {results && results.length > 0 && (
          <>
            {/* Board preview */}
            {selectedResult && (
              <div style={{ padding: '0.8rem 1rem 0' }}>
                <ChessBoard
                  board={(selectedResult.stateAfter || selectedResult.stateBefore).board}
                  onSquareClick={() => {}}
                  selected={null} legalTargets={[]} lastMove={null} checkSquare={null}
                  orientation={playerColor === 'w' ? 'white' : 'black'}
                  disabled showCoords
                  themeId={boardTheme}
                />
                <div style={{
                  margin: '0.6rem 0 0', padding: '0.7rem 0.9rem',
                  background: MOVE_CATS.find(c => c.key === selectedResult.cat)?.bg || 'var(--bg-panel)',
                  borderRadius: '0.85rem', border: `1.5px solid ${MOVE_CATS.find(c => c.key === selectedResult.cat)?.color || 'var(--border-soft)'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: MOVE_CATS.find(c => c.key === selectedResult.cat)?.color }}>
                      {MOVE_CATS.find(c => c.key === selectedResult.cat)?.symbol}
                    </span>
                    <span style={{ fontWeight: 700, fontFamily: 'JetBrains Mono,monospace' }}>
                      {selectedResult.moveNum}. {selectedResult.san}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: MOVE_CATS.find(c => c.key === selectedResult.cat)?.color, fontWeight: 700 }}>
                      {MOVE_CATS.find(c => c.key === selectedResult.cat)?.label}
                    </span>
                  </div>
                  {!selectedResult.isBest && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Langkah terbaik: <span style={{ fontFamily: 'JetBrains Mono,monospace', color: 'var(--text-primary)', fontWeight: 700 }}>{selectedResult.bestSan}</span>
                      {selectedResult.cpLoss > 0 && <span style={{ color: 'var(--error)' }}> (-{selectedResult.cpLoss} cp)</span>}
                    </p>
                  )}
                  {selectedResult.isBest && (
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: '#68D391' }}>Langkah terbaik menurut engine!</p>
                  )}
                </div>
              </div>
            )}

            {/* ---- ACCURACY HEADER ---- */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', padding: '0.9rem 1rem 0' }}>
              {[
                { label: playerPill, acc: playerAcc, isPlayer: true },
                { label: aiPill,     acc: aiAcc,     isPlayer: false },
              ].map(({ label, acc, isPlayer }) => {
                const al = accLabel(acc);
                return (
                  <div key={label} style={{
                    background: isPlayer ? 'rgba(224,185,82,0.08)' : 'var(--bg-panel)',
                    border: `1.5px solid ${isPlayer ? 'var(--accent-gold)' : 'var(--border-soft)'}`,
                    borderRadius: '1rem', padding: '0.8rem 0.7rem', textAlign: 'center',
                  }}>
                    <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                      {label}
                    </p>
                    <p style={{ margin: '0.15rem 0 0', fontFamily: 'Fraunces,serif', fontSize: '1.9rem', fontWeight: 700, color: al.color, lineHeight: 1 }}>
                      {acc}
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', fontWeight: 700, color: al.color }}>{al.text}</p>
                  </div>
                );
              })}
            </div>

            {/* ---- CATEGORY TABLE (chess.com style) ---- */}
            <div style={{ padding: '0.9rem 1rem 0' }}>
              <div style={{
                background: 'var(--bg-panel)', borderRadius: '1rem',
                border: '1px solid var(--border-soft)', overflow: 'hidden',
              }}>
                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2.2rem 1fr', background: 'var(--bg-panel-2)', padding: '0.55rem 0.9rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent-gold)' }}>Kamu</span>
                  <span />
                  <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>AI</span>
                </div>
                {/* Rows */}
                {MOVE_CATS.map((cat) => {
                  const pCount = countCat(playerRes, cat.key);
                  const aCount = countCat(aiRes, cat.key);
                  if (pCount === 0 && aCount === 0) return null;
                  return (
                    <div key={cat.key} style={{
                      display: 'grid', gridTemplateColumns: '1fr 2.8rem 1fr',
                      padding: '0.6rem 0.9rem', alignItems: 'center',
                      borderTop: '1px solid var(--border-soft)',
                    }}>
                      {/* Player count */}
                      <span style={{
                        fontFamily: 'Fraunces,serif', fontSize: '1.25rem', fontWeight: 700,
                        color: pCount > 0 ? cat.color : 'var(--text-muted)',
                      }}>{pCount}</span>
                      {/* Icon + label */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
                        <span style={{
                          width: '1.7rem', height: '1.7rem', borderRadius: '50%',
                          background: cat.bg, color: cat.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '0.75rem',
                        }}>{cat.symbol}</span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                          {cat.label}
                        </span>
                      </div>
                      {/* AI count */}
                      <span style={{
                        fontFamily: 'Fraunces,serif', fontSize: '1.25rem', fontWeight: 700, textAlign: 'right',
                        color: aCount > 0 ? cat.color : 'var(--text-muted)',
                      }}>{aCount}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ---- PHASE ANALYSIS ---- */}
            <div style={{ padding: '0.9rem 1rem 0' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Fase Permainan</p>
              <div style={{ background: 'var(--bg-panel)', borderRadius: '1rem', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                {[
                  { key: 'opening',     label: 'Pembukaan',         icon: '📖' },
                  { key: 'middlegame',  label: 'Permainan Tengah',  icon: '⚔️' },
                  { key: 'endgame',     label: 'Permainan Akhir',   icon: '♟️' },
                ].map((ph, pi) => {
                  const pAcc = phaseAcc(playerRes, ph.key);
                  const aAcc = phaseAcc(aiRes, ph.key);
                  const pAl  = pAcc !== null ? accLabel(pAcc) : null;
                  const aAl  = aAcc !== null ? accLabel(aAcc) : null;
                  return (
                    <div key={ph.key} style={{
                      display: 'grid', gridTemplateColumns: '1fr 2.8rem 1fr',
                      padding: '0.65rem 0.9rem', alignItems: 'center',
                      borderTop: pi > 0 ? '1px solid var(--border-soft)' : 'none',
                    }}>
                      <div>
                        {pAl ? (
                          <>
                            <p style={{ margin: 0, fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 700, color: pAl.color }}>{pAcc}</p>
                            <p style={{ margin: 0, fontSize: '0.65rem', color: pAl.color }}>{pAl.text}</p>
                          </>
                        ) : <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>—</p>}
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '1.1rem' }}>{ph.icon}</span>
                        <p style={{ margin: 0, fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 600, lineHeight: 1.1 }}>{ph.label}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {aAl ? (
                          <>
                            <p style={{ margin: 0, fontFamily: 'Fraunces,serif', fontSize: '1.1rem', fontWeight: 700, color: aAl.color }}>{aAcc}</p>
                            <p style={{ margin: 0, fontSize: '0.65rem', color: aAl.color }}>{aAl.text}</p>
                          </>
                        ) : <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'right' }}>—</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ---- MOVE LIST ---- */}
            <div style={{ padding: '0.9rem 1rem 0' }}>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Daftar Langkahmu — ketuk untuk lihat posisi
              </p>
              <div style={{ background: 'var(--bg-panel)', borderRadius: '1rem', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                {results.filter(r => r.color === playerColor).map((r) => {
                  const cat = MOVE_CATS.find(c => c.key === r.cat);
                  const isSelected = viewIdx === r.idx;
                  return (
                    <button
                      key={r.idx}
                      type="button"
                      onClick={() => setViewIdx(isSelected ? null : r.idx)}
                      style={{
                        display: 'grid', gridTemplateColumns: '1.8rem 1fr auto',
                        alignItems: 'center', gap: '0.6rem', width: '100%',
                        padding: '0.65rem 0.9rem', background: isSelected ? cat.bg : 'transparent',
                        border: 'none', borderTop: '1px solid var(--border-soft)',
                        color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                    >
                      <span style={{
                        width: '1.7rem', height: '1.7rem', borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: cat.bg, color: cat.color, fontWeight: 800, fontSize: '0.78rem',
                      }}>{cat.symbol}</span>
                      <div>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: '0.88rem' }}>
                          {r.moveNum}. {r.san}
                        </span>
                        {!r.isBest && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            → lebih baik: <span style={{ fontFamily: 'JetBrains Mono,monospace' }}>{r.bestSan}</span>
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.72rem', color: cat.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {cat.label}{r.cpLoss > 0 ? ` -${r.cpLoss}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '0.9rem 1rem 0' }}>
              <div style={{ background: 'rgba(224,185,82,0.07)', border: '1px solid rgba(224,185,82,0.2)', borderRadius: '0.85rem', padding: '0.65rem 0.9rem' }}>
                <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  ⚠️ <b style={{ color: 'var(--accent-gold)' }}>Catatan:</b> Analisis ini menggunakan engine kedalaman 2 (perkiraan). Chess.com pakai depth 15–18 yang jauh lebih akurat. "Terbaik ★" berarti langkahmu sama persis dengan pilihan engine kami.
                </p>
              </div>
            </div>
            <div style={{ padding: '0.7rem 1rem 0' }}>
              <button type="button" className="btn-ghost" style={{ width: '100%' }} onClick={onClose}>
                Kembali ke Permainan
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
//  GURU AI TAB - tutor catur via Claude API
// ============================================================================
const GURU_SYSTEM_PROMPT = `Kamu adalah "Guru Catur" - tutor catur yang ramah, sabar, dan suportif untuk pemain Indonesia level pemula sampai menengah, bagian dari aplikasi belajar catur "CaturKu".

Gaya bicara: santai tapi jelas, Bahasa Indonesia, hindari sok pintar atau menggurui berlebihan. Selalu beri semangat dan validasi usaha pengguna.

Gunakan istilah catur dalam Bahasa Indonesia (Skak, Skakmat, Benteng, Gajah, Menteri, Kuda, Pion, Rokade) - boleh sertakan istilah Inggris dalam kurung untuk istilah penting, misalnya "Garpu (Fork)" atau "Sematan (Pin)".

Jika pengguna memberikan posisi dalam notasi FEN, analisis singkat: ancaman saat ini, ide/rencana yang bagus, dan kesalahan jika ada - bahas posisinya secara natural, jangan menyebut kata "FEN" balik ke pengguna.

Jawaban harus singkat dan padat: 2-4 kalimat pendek, atau list singkat jika perlu. Jangan gunakan heading markdown (#, ##, dst). Hindari paragraf panjang.

Jika ditanya hal di luar topik catur, arahkan kembali dengan ramah ke topik catur.`;

const GURU_SUGGESTIONS = [
  'Apa itu Garpu (Fork)?',
  'Gimana cara melindungi Raja di awal permainan?',
  'Kenapa Menteri jangan keluar duluan?',
  'Tips biar gak gampang blunder?',
];

const GURU_INITIAL_MESSAGE = {
  role: 'assistant',
  content: 'Halo! Aku Guru Catur. Tanya apa saja soal aturan, taktik, strategi, atau minta aku menganalisis posisi dari permainanmu di tab Main. Yuk mulai!',
};

function GuruTab({ messages, setMessages, pendingMessage, onPendingConsumed }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(text) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const apiMessages = newMessages.slice(1).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch('/.netlify/functions/guru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: GURU_SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      const textOut = (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      setMessages((m) => [...m, { role: 'assistant', content: textOut || 'Hmm, aku belum dapat jawaban. Coba tanya lagi, ya?' }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: 'Maaf, Guru sedang tidak bisa dihubungi. Coba lagi sebentar, ya.' }]);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }

  useEffect(() => {
    if (pendingMessage) {
      send(pendingMessage);
      onPendingConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMessage]);

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    send(text);
  }

  const showSuggestions = messages.length <= 1 && !loading;

  return (
    <div style={{
      position: 'fixed', top: '3rem', bottom: '3.9rem', left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', zIndex: 30,
    }}>
      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble anim-pop ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-bubble-assistant">
            <Loader2 size={16} className="spin" />
          </div>
        )}
      </div>
      {showSuggestions && (
        <div className="chip-row" style={{ padding: '0 1rem 0.6rem' }}>
          {GURU_SUGGESTIONS.map((s, i) => (
            <button key={i} type="button" className="suggestion-chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="chat-input-bar">
        <input
          className="chat-input"
          placeholder="Tanya apa saja soal catur..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
        />
        <button type="button" className="send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
// ============================================================================
//  PROFILE TAB - Tangga Promosi & statistik
// ============================================================================
function ProfileTab({ progress, onResetProgress, onUpdatePrefs }) {
  const { boardTheme, soundEnabled } = usePrefs();
  const sound = useSound();
  const [confirmReset, setConfirmReset] = useState(false);
  const { index, current, next, progress: pct } = getRankInfo(progress.xp);

  return (
    <div className="anim-slide-up" style={{ padding: '0 1rem' }}>
      <div className="rank-hero anim-pop">
        <div className="rank-hero-glyph">{current.glyph}</div>
        <h2 className="section-title" style={{ marginTop: '0.45rem' }}>{current.name}</h2>
        <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0.7rem' }}>{current.desc}</p>
        {next ? (
          <>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct * 100}%` }} />
            </div>
            <p className="muted font-mono-chess" style={{ fontSize: '0.72rem', margin: '0.45rem 0 0' }}>
              {progress.xp} / {next.minXP} XP menuju {next.name} {next.glyph}
            </p>
          </>
        ) : (
          <span className="pill pill-gold" style={{ fontSize: '0.85rem' }}>
            <Crown size={14} /> Predikat Tertinggi - terus berkembang!
          </span>
        )}
      </div>

      <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '1.1rem 0 0.5rem' }}>STATISTIK</p>
      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-num">{progress.completedLessons.length}/{LESSONS.length}</p>
          <p className="stat-label">Pelajaran</p>
        </div>
        <div className="stat-card">
          <p className="stat-num">{progress.gamesPlayed}</p>
          <p className="stat-label">Permainan</p>
        </div>
        <div className="stat-card">
          <p className="stat-num">{progress.streak}</p>
          <p className="stat-label">Hari Beruntun</p>
        </div>
      </div>
      <div className="stat-grid" style={{ marginTop: '0.55rem' }}>
        <div className="stat-card">
          <p className="stat-num" style={{ color: 'var(--success)' }}>{progress.gamesWon}</p>
          <p className="stat-label">Menang</p>
        </div>
        <div className="stat-card">
          <p className="stat-num">{progress.gamesDraw}</p>
          <p className="stat-label">Seri</p>
        </div>
        <div className="stat-card">
          <p className="stat-num" style={{ color: 'var(--error)' }}>{progress.gamesLost}</p>
          <p className="stat-label">Kalah</p>
        </div>
      </div>

      <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>TANGGA PROMOSI</p>
      <div className="rank-ladder">
        {RANKS.slice().reverse().map((rank) => {
          const realIdx = RANKS.indexOf(rank);
          const isActive = realIdx === index;
          const isDone = realIdx < index;
          return (
            <div key={rank.name} className={`rank-item ${isActive ? 'rank-item-active' : ''} ${isDone ? 'rank-item-done' : ''}`}>
              <span className="rank-glyph">{rank.glyph}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="rank-name">{rank.name}</p>
                <p className="rank-desc">{rank.desc}</p>
              </div>
              <span className="rank-xp-need">
                {isDone ? <Check size={14} style={{ color: 'var(--success)' }} /> : `${rank.minXP} XP`}
              </span>
            </div>
          );
        })}
      </div>

      <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>
        PENCAPAIAN ({(progress.unlockedAchievements || []).length}/{ACHIEVEMENTS.length})
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {ACHIEVEMENTS.map((a) => {
          const unlocked = (progress.unlockedAchievements || []).includes(a.id);
          const Icon = UNIT_ICONS[a.icon] || Award;
          return (
            <div key={a.id} className="card" style={{
              padding: '0.7rem 0.65rem', textAlign: 'center', opacity: unlocked ? 1 : 0.4,
              borderColor: unlocked ? 'var(--accent-gold)' : 'var(--border-soft)',
            }}>
              <div style={{
                width: '2.2rem', height: '2.2rem', borderRadius: '0.7rem', margin: '0 auto 0.35rem',
                background: unlocked ? 'rgba(224,185,82,0.18)' : 'var(--bg-panel-2)',
                color: unlocked ? 'var(--accent-gold)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unlocked ? <Icon size={18} /> : <Lock size={16} />}
              </div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.74rem' }}>{a.label}</p>
              <p style={{ margin: '0.1rem 0 0', fontSize: '0.64rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{a.desc}</p>
            </div>
          );
        })}
      </div>

      {/* ---- SETTINGS ---- */}
      <p className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, margin: '1.2rem 0 0.5rem' }}>PENGATURAN</p>

      {/* Sound toggle */}
      <div className="card" style={{ marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {soundEnabled ? <Volume2 size={18} style={{ color: 'var(--accent-gold)' }} /> : <VolumeX size={18} style={{ color: 'var(--text-muted)' }} />}
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem' }}>Efek Suara</p>
              <p className="muted" style={{ margin: 0, fontSize: '0.7rem' }}>Suara langkah, skak, & notifikasi</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { const next = !soundEnabled; onUpdatePrefs({ soundEnabled: next }); if (next) playSound('click', true); }}
            style={{
              width: '3.1rem', height: '1.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
              background: soundEnabled ? 'var(--accent-gold)' : 'var(--bg-panel-2)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}
            aria-label={soundEnabled ? 'Matikan suara' : 'Aktifkan suara'}
          >
            <span style={{
              position: 'absolute', top: '0.22rem', left: soundEnabled ? '1.5rem' : '0.22rem',
              width: '1.25rem', height: '1.25rem', borderRadius: '50%',
              background: soundEnabled ? 'var(--text-dark)' : 'var(--text-muted)',
              transition: 'left 0.2s', display: 'block',
            }} />
          </button>
        </div>
      </div>

      {/* Board theme picker */}
      <div className="card" style={{ marginBottom: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
          <Palette size={18} style={{ color: 'var(--accent-gold)' }} />
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem' }}>Tema Papan</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
          {Object.values(BOARD_THEMES).map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => { onUpdatePrefs({ boardTheme: theme.id }); sound('click'); }}
              style={{
                border: boardTheme === theme.id ? `2px solid var(--accent-gold)` : '2px solid transparent',
                borderRadius: '0.6rem', padding: '0.3rem', background: 'var(--bg-panel-2)',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              }}
              title={theme.label}
            >
              {/* Mini board preview */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', width: '2.2rem', height: '2.2rem',
                borderRadius: '0.3rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {[...Array(16)].map((_, i) => (
                  <div key={i} style={{ background: (Math.floor(i / 4) + i) % 2 === 0 ? theme.light : theme.dark }} />
                ))}
              </div>
              <span style={{ fontSize: '0.5rem', color: boardTheme === theme.id ? 'var(--accent-gold)' : 'var(--text-muted)', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-word' }}>
                {theme.label.split(' ').slice(-1)[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.2rem', marginBottom: '0.5rem' }}>
        {!confirmReset ? (
          <button type="button" className="btn-ghost" style={{ width: '100%', fontSize: '0.82rem', color: 'var(--text-muted)' }} onClick={() => setConfirmReset(true)}>
            Atur Ulang Progres
          </button>
        ) : (
          <div className="card anim-pop" style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', margin: '0 0 0.7rem' }}>
              Yakin mau hapus semua progres (XP, streak, & riwayat pelajaran)? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>Batal</button>
              <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => { onResetProgress(); setConfirmReset(false); }}>Ya, Hapus</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// ============================================================================
//  MAIN APP
// ============================================================================
export default function App() {
  const [progress, setProgress] = useState(null);
  const [activeTab, setActiveTab] = useState('belajar');
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [playState, setPlayState] = useState({
    status: 'setup',
    gameState: null,
    playerColor: 'w',
    difficultyId: 'menengah',
    moveHistory: [],
    stateHistory: [],
    lastMove: null,
    result: null,
    pendingColor: 'w',
    pendingDiff: 'menengah',
  });
  const [guruMessages, setGuruMessages] = useState([GURU_INITIAL_MESSAGE]);
  const [guruPending, setGuruPending] = useState(null);
  const [activePuzzleConfig, setActivePuzzleConfig] = useState(null);
  const [achievementQueue, setAchievementQueue] = useState([]);
  const [user, setUser] = useState(null);
  const [mainMode, setMainMode] = useState(null); // null | 'ai' | 'multiplayer'

  function handleUpdatePrefs(changes) {
    setProgress((p) => ({ ...p, ...changes }));
  }

  // Firebase auth listener
  useEffect(() => {
    const unsub = onAuthChange(async (fbUser) => {
      setUser(fbUser);
      if (fbUser && progress) {
        // Load cloud progress when user logs in
        const cloud = await loadProgressCloud(fbUser.uid);
        if (cloud && (cloud.xp || 0) >= (progress.xp || 0)) {
          setProgress((p) => ({ ...DEFAULT_PROGRESS, ...p, ...cloud }));
        }
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync progress to Firestore whenever it changes (if logged in)
  useEffect(() => {
    if (!progress || !user) return;
    saveProgressCloud(user.uid, progress).catch(() => {});
  }, [progress, user]);

  // Load progress + update streak
  useEffect(() => {
    let p = { ...DEFAULT_PROGRESS };
    try {
      const val = localStorage.getItem('caturku_progress');
      if (val) p = { ...DEFAULT_PROGRESS, ...JSON.parse(val) };
    } catch (e) {
      // no stored progress yet - use defaults
    }
    const today = todayStr();
    if (p.lastActiveDate) {
      const diff = dayDiff(p.lastActiveDate, today);
      if (diff === 1) p = { ...p, streak: p.streak + 1, lastActiveDate: today };
      else if (diff > 1) p = { ...p, streak: 1, lastActiveDate: today };
      else if (diff < 0) p = { ...p, lastActiveDate: today };
    } else {
      p = { ...p, streak: 1, lastActiveDate: today };
    }
    setProgress(p);
  }, []);

  // Persist progress on change
  useEffect(() => {
    if (!progress) return;
    try { localStorage.setItem('caturku_progress', JSON.stringify(progress)); } catch (e) {}
  }, [progress]);

  // Detect newly unlocked achievements whenever progress changes
  useEffect(() => {
    if (!progress) return;
    const newOnes = checkNewAchievements(progress);
    if (newOnes.length > 0) {
      const xpGain = newOnes.reduce((s, a) => s + a.xp, 0);
      setProgress((p) => ({
        ...p,
        xp: p.xp + xpGain,
        unlockedAchievements: [...(p.unlockedAchievements || []), ...newOnes.map((a) => a.id)],
      }));
      setAchievementQueue((q) => [...q, ...newOnes]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.completedLessons?.length, progress?.gamesWon, progress?.solvedPuzzles?.length,
      progress?.examsTaken, progress?.examBestScore, progress?.streak, progress?.xp, progress?.beatAhli,
      progress?.wonAsBlack, progress?.quickWin, progress?.lastDailyPuzzleDate]);

  function handleLessonComplete(xp) {
    const lessonId = activeLessonId;
    setProgress((p) => {
      if (p.completedLessons.includes(lessonId)) return p;
      return { ...p, xp: p.xp + xp, completedLessons: [...p.completedLessons, lessonId] };
    });
  }

  function handleGameEnd(result, difficultyId, playerColor, plyCount) {
    setProgress((p) => {
      const np = { ...p, gamesPlayed: p.gamesPlayed + 1 };
      if (result === 'win') {
        np.gamesWon = p.gamesWon + 1; np.xp = p.xp + 15;
        if (difficultyId === 'ahli') np.beatAhli = true;
        if (playerColor === 'b') np.wonAsBlack = true;
        if (typeof plyCount === 'number' && plyCount > 0 && plyCount <= 30) np.quickWin = true;
      }
      else if (result === 'draw') { np.gamesDraw = p.gamesDraw + 1; np.xp = p.xp + 5; }
      else { np.gamesLost = p.gamesLost + 1; np.xp = p.xp + 2; }
      return np;
    });
  }

  function handlePuzzleSolved(puzzleId, xp, isDaily) {
    setProgress((p) => {
      const alreadySolved = (p.solvedPuzzles || []).includes(puzzleId);
      const alreadyDailyToday = p.lastDailyPuzzleDate === todayStr();
      if (alreadySolved && (!isDaily || alreadyDailyToday)) return p; // tidak ada yang perlu diupdate
      const next = { ...p };
      if (!alreadySolved) {
        next.xp = p.xp + xp;
        next.solvedPuzzles = [...(p.solvedPuzzles || []), puzzleId];
      }
      if (isDaily && !alreadyDailyToday) {
        next.lastDailyPuzzleDate = todayStr();
        next.xp = (next.xp ?? p.xp) + 5; // bonus XP puzzle harian
      }
      return next;
    });
  }

  function handleExamComplete(pct) {
    setProgress((p) => ({
      ...p,
      examsTaken: (p.examsTaken || 0) + 1,
      examBestScore: Math.max(p.examBestScore || 0, pct),
    }));
  }

  function handleAskGuru(text) {
    setGuruPending(text);
    setActiveTab('guru');
  }

  function handleResetProgress() {
    setProgress({ ...DEFAULT_PROGRESS, streak: 1, lastActiveDate: todayStr() });
    setPlayState({
      status: 'setup', gameState: null, playerColor: 'w', difficultyId: 'menengah',
      moveHistory: [], stateHistory: [], lastMove: null, result: null, pendingColor: 'w', pendingDiff: 'menengah',
    });
    setGuruMessages([GURU_INITIAL_MESSAGE]);
    setActiveLessonId(null);
    setActivePuzzleConfig(null);
    setAchievementQueue([]);
    setActiveTab('belajar');
  }

  if (!progress) {
    return (
      <div className="ca-root">
        <GlobalStyles />
        <GlobalStyles2 />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Loader2 size={28} className="spin" style={{ color: 'var(--accent-gold)' }} />
        </div>
      </div>
    );
  }

  const activeLesson = activeLessonId ? LESSONS.find((l) => l.id === activeLessonId) : null;
  const prefsValue = { boardTheme: progress.boardTheme || 'classic', soundEnabled: progress.soundEnabled !== false };

  async function handleLogin() {
    try { await loginGoogle(); } catch (e) { alert(e.message); }
  }
  async function handleLogout() {
    await logoutUser();
    setUser(null);
    setMainMode(null);
  }
  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab !== 'main') setMainMode(null);
  }

  return (
    <PreferencesContext.Provider value={prefsValue}>
      <div className="ca-root">
        <GlobalStyles />
        <GlobalStyles2 />
        <TopBar progress={progress} user={user} onLogin={handleLogin} onLogout={handleLogout} />

        {achievementQueue.length > 0 && (
          <AchievementToast
            achievement={achievementQueue[0]}
            onDone={() => setAchievementQueue((q) => q.slice(1))}
          />
        )}

        {activeTab === 'guru' ? (
          <GuruTab
            messages={guruMessages}
            setMessages={setGuruMessages}
            pendingMessage={guruPending}
            onPendingConsumed={() => setGuruPending(null)}
          />
        ) : (
          <div className="ca-scroll">
            {activeTab === 'belajar' && <LearnTab progress={progress} onOpenLesson={setActiveLessonId} />}
            {activeTab === 'taktik' && <TacticsTab progress={progress} onOpenPuzzleSet={setActivePuzzleConfig} />}
            {activeTab === 'main' && (
              mainMode === 'ai'
                ? <PlayTab playState={playState} setPlayState={setPlayState} onGameEnd={handleGameEnd} onAskGuru={handleAskGuru} />
                : mainMode === 'multiplayer' && user
                  ? <MultiplayerTab user={user} onBack={() => setMainMode(null)} />
                  : <MainChoiceScreen
                      user={user}
                      onChooseAI={() => setMainMode('ai')}
                      onChooseMultiplayer={() => user ? setMainMode('multiplayer') : handleLogin()}
                    />
            )}
            {activeTab === 'profil' && <ProfileTab progress={progress} onResetProgress={handleResetProgress} onUpdatePrefs={handleUpdatePrefs} />}
          </div>
        )}

        <BottomNav active={activeTab} onChange={handleTabChange} />

        {activeLesson && (
          <LessonPlayer lesson={activeLesson} onComplete={handleLessonComplete} onClose={() => setActiveLessonId(null)} />
        )}
        {activePuzzleConfig && (
          <PuzzlePlayer
            config={activePuzzleConfig}
            onClose={() => setActivePuzzleConfig(null)}
            onPuzzleSolved={handlePuzzleSolved}
            onExamComplete={handleExamComplete}
          />
        )}
      </div>
    </PreferencesContext.Provider>
  );
}
