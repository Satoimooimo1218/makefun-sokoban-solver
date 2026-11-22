import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const DIRS = [
  [0, -1, 'u'],
  [0, 1, 'd'],
  [-1, 0, 'l'],
  [1, 0, 'r'],
];

function parse(text) {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const wall = new Uint8Array(w * h).fill(1);
  const goals = [];
  const boxes = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '#';
      const i = y * w + x;
      wall[i] = ch === '#' ? 1 : 0;
      if ('.*+'.includes(ch)) goals.push(i);
      if ('$*'.includes(ch)) boxes.push(i);
      if ('@+'.includes(ch)) player = i;
    }
  });
  boxes.sort((a, b) => a - b);
  return { w, h, wall, goals, boxes, player };
}

function neighbours(w, h, c) {
  const x = c % w, y = (c / w) | 0;
  const out = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.push(ny * w + nx);
  }
  return out;
}

function floodSet(w, h, start, open) {
  const seen = new Uint8Array(w * h);
  if (!open(start)) return seen;
  const q = [start];
  seen[start] = 1;
  for (let s = 0; s < q.length; s++) {
    for (const m of neighbours(w, h, q[s])) {
      if (seen[m] || !open(m)) continue;
      seen[m] = 1;
      q.push(m);
    }
  }
  return seen;
}

function walkPath(w, h, a, b, open) {
  if (a === b) return '';
  const n = w * h;
  const prev = new Int32Array(n).fill(-2);
  const q = [a];
  prev[a] = -1;
  for (let s = 0; s < q.length; s++) {
    const c = q[s];
    if (c === b) break;
    for (const m of neighbours(w, h, c)) {
      if (prev[m] !== -2 || !open(m)) continue;
      prev[m] = c;
      q.push(m);
    }
  }
  if (prev[b] === -2) return null;
  let out = '';
  for (let c = b; c !== a; c = prev[c]) {
    const d = c - prev[c];
    out = (d === 1 ? 'r' : d === -1 ? 'l' : d === w ? 'd' : 'u') + out;
  }
  return out;
}

function pushSolve(w, h, allowed, boxes0, goals, playerStart, budget, exitCells) {
  const n = w * h;
  const goalSet = new Set(goals);
  const dist = new Int32Array(n).fill(-1);
  {
    const q = [];
    for (const g of goals) { dist[g] = 0; q.push(g); }
    for (let s = 0; s < q.length; s++) {
      const c = q[s];
      for (const m of neighbours(w, h, c)) {
        if (!allowed[m] || dist[m] >= 0) continue;
        dist[m] = dist[c] + 1;
        q.push(m);
      }
    }
  }
  const live = new Uint8Array(n);
  {
    const q = [];
    for (const g of goals) { live[g] = 1; q.push(g); }
    for (let s = 0; s < q.length; s++) {
      const c = q[s];
      const cx = c % w, cy = (c / w) | 0;
      for (const [dx, dy] of DIRS) {
        const px = cx - dx, py = cy - dy, sx = cx - 2 * dx, sy = cy - 2 * dy;
        if (px < 0 || py < 0 || px >= w || py >= h || sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const p = py * w + px, st = sy * w + sx;
        if (!allowed[p] || !allowed[st] || live[p]) continue;
        live[p] = 1;
        q.push(p);
      }
    }
  }
  const estimate = (bs) => {
    let s = 0;
    for (const b of bs) {
      if (dist[b] < 0) return Infinity;
      s += dist[b];
    }
    return s;
  };
  const deadlocked = (bs, boxSet) => {
    for (const b of bs) if (!goalSet.has(b) && !live[b]) return true;
    for (let y = 0; y + 1 < h; y++) {
      for (let x = 0; x + 1 < w; x++) {
        const cells = [y * w + x, y * w + x + 1, (y + 1) * w + x, (y + 1) * w + x + 1];
        let solid = true, bad = false;
        for (const c of cells) {
          if (allowed[c] && !boxSet[c]) { solid = false; break; }
          if (boxSet[c] && !goalSet.has(c)) bad = true;
        }
        if (solid && bad) return true;
      }
    }
    return false;
  };
  const boxSetOf = (bs) => {
    const s = new Uint8Array(n);
    for (const b of bs) s[b] = 1;
    return s;
  };
  const canonOf = (playerPos, boxSet) => {
    const seen = floodSet(w, h, playerPos, (c) => allowed[c] && !boxSet[c]);
    for (let c = 0; c < n; c++) if (seen[c]) return c;
    return playerPos;
  };
  const startSet = boxSetOf(boxes0);
  if (deadlocked(boxes0, startSet)) return null;
  const states = [{ boxes: boxes0, player: playerStart, parent: -1, walk: '', pushLetter: '' }];
  const gScore = new Map([[canonOf(playerStart, startSet) + '|' + boxes0.join(','), 0]]);
  const heap = [[estimate(boxes0), 0, 0]];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] > b[1]);
  const hpush = (e) => {
    let i = heap.length;
    heap.push(e);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const hpop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ; ) {
        let c = 2 * i + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
        if (!less(heap[c], heap[i])) break;
        [heap[i], heap[c]] = [heap[c], heap[i]];
        i = c;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length > 0) {
    const [, g, si] = hpop();
    const st = states[si];
    const bs = st.boxes;
    if (bs.every((b) => goalSet.has(b))) {
      if (exitCells === null || exitCells === undefined) {
        const parts = [];
        for (let t = si; t > 0; t = states[t].parent) parts.push(states[t].walk + states[t].pushLetter);
        return parts.reverse().join('');
      }
      const reach = floodSet(w, h, st.player, (c) => allowed[c] && !boxSetOf(bs)[c]);
      if (exitCells.some((ec) => reach[ec])) {
        const parts = [];
        for (let t = si; t > 0; t = states[t].parent) parts.push(states[t].walk + states[t].pushLetter);
        return parts.reverse().join('');
      }
    }
    if (expanded >= budget || states.length > 2_000_000) return null;
    expanded++;
    const boxSet = boxSetOf(bs);
    const reach = floodSet(w, h, st.player, (c) => allowed[c] && !boxSet[c]);
    for (let bi = 0; bi < bs.length; bi++) {
      const b = bs[bi];
      const bx = b % w, by = (b / w) | 0;
      for (const [dx, dy, letter] of DIRS) {
        const sx = bx - dx, sy = by - dy, tx = bx + dx, ty = by + dy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h || tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const stand = sy * w + sx, dest = ty * w + tx;
        if (!reach[stand] || !allowed[dest] || boxSet[dest]) continue;
        const nb = bs.slice();
        nb[bi] = dest;
        nb.sort((a, z) => a - z);
        const nSet = boxSetOf(nb);
        if (deadlocked(nb, nSet)) continue;
        const e = estimate(nb);
        if (e === Infinity) continue;
        const walk = walkPath(w, h, st.player, stand, (c) => allowed[c] && !boxSet[c]);
        if (walk === null) continue;
        const k = canonOf(b, nSet) + '|' + nb.join(',');
        const ng = g + 1;
        const seenG = gScore.get(k);
        if (seenG !== undefined && seenG <= ng) continue;
        gScore.set(k, ng);
        states.push({ boxes: nb, player: b, parent: si, walk, pushLetter: letter });
        hpush([ng + e, ng, states.length - 1]);
      }
    }
  }
  return null;
}

function replay(level, moves) {
  const { w, wall } = level;
  const boxes = new Set(level.boxes);
  let player = level.player;
  let pushes = 0;
  for (const ch of moves) {
    const d = DIRS.find(([, , l]) => l === ch.toLowerCase());
    if (!d) return null;
    const [dx, dy] = d;
    const q = player + dy * w + dx;
    if (wall[q]) return null;
    if (boxes.has(q)) {
      const t = q + dy * w + dx;
      if (wall[t] || boxes.has(t)) return null;
      boxes.delete(q);
      boxes.add(t);
      pushes++;
    }
    player = q;
  }
  return { boxes, player, pushes };
}

function decompose(level) {
  const { w, h, wall, goals, boxes, player } = level;
  const goalSet = new Set(goals);
  const boxSet = new Set(boxes);
  const hallY = (player / w) | 0;
  const hall = new Set();
  for (let x = 0; x < w; x++) {
    const c = hallY * w + x;
    if (!wall[c]) hall.add(c);
  }
  if (!hall.has(player)) return null;
  const seen = new Uint8Array(w * h);
  const rooms = [];
  for (let c = 0; c < w * h; c++) {
    if (wall[c] || hall.has(c) || seen[c]) continue;
    const comp = [];
    const q = [c];
    seen[c] = 1;
    for (let s = 0; s < q.length; s++) {
      comp.push(q[s]);
      for (const m of neighbours(w, h, q[s])) {
        if (seen[m] || wall[m] || hall.has(m)) continue;
        seen[m] = 1;
        q.push(m);
      }
    }
    const bIn = comp.filter((x) => boxSet.has(x)).length;
    const gIn = comp.filter((x) => goalSet.has(x)).length;
    if (bIn !== gIn || bIn < 3 || bIn > 4 || comp.length > 42) return null;
    const entries = [...hall].filter((hc) => neighbours(w, h, hc).some((m) => comp.includes(m)));
    if (entries.length === 0) return null;
    rooms.push({ cells: comp, entries });
  }
  if (rooms.length === 0) return null;
  if (rooms.reduce((s, r) => s + r.cells.filter((x) => boxSet.has(x)).length, 0) !== boxes.length) return null;
  return { rooms, hall };
}

function solveLevel(level) {
  const { w, h, wall, goals, boxes, player } = level;
  const goalSet = new Set(goals);
  const dec = decompose(level);
  if (dec) {
    const solvedRooms = [];
    let ok = true;
    for (const room of dec.rooms) {
      const subGoals = room.cells.filter((c) => goalSet.has(c));
      const subBoxes = room.cells.filter((c) => boxes.includes(c));
      subBoxes.sort((a, b) => a - b);
      const allowed = new Uint8Array(w * h);
      for (const c of room.cells) allowed[c] = 1;
      for (const e of room.entries) allowed[e] = 1;
      const subWall = new Uint8Array(w * h);
      for (let c = 0; c < w * h; c++) subWall[c] = allowed[c] ? 0 : 1;
      const countPushes = (entry, moves) =>
        replay({ w, wall: subWall, boxes: subBoxes, player: entry }, moves)?.pushes ?? Infinity;
      let plan = null;
      for (const entry of room.entries) {
        const withExit = pushSolve(w, h, allowed, subBoxes, subGoals, entry, 600_000, room.entries);
        const any = withExit ? pushSolve(w, h, allowed, subBoxes, subGoals, entry, 600_000, null) : null;
        const cand = {
          entry,
          withExit,
          any,
          exitPushes: withExit ? countPushes(entry, withExit) : Infinity,
          anyPushes: any ? countPushes(entry, any) : (withExit ? countPushes(entry, withExit) : Infinity),
        };
        if (!plan || cand.anyPushes < plan.anyPushes) plan = cand;
        if (plan.withExit && plan.exitPushes === plan.anyPushes) break;
      }
      if (!plan || (!plan.withExit && !plan.any)) { ok = false; break; }
      plan.penalty = plan.exitPushes - plan.anyPushes;
      solvedRooms.push({ room, ...plan });
    }
    if (ok) {
      let lastIdx = 0;
      solvedRooms.forEach((sr, i) => { if (sr.penalty >= solvedRooms[lastIdx].penalty) lastIdx = i; });
      const lastRoom = solvedRooms.splice(lastIdx, 1)[0];
      lastRoom.useAny = lastRoom.any !== null && lastRoom.any !== undefined;
      for (const sr of solvedRooms) sr.useAny = false;
      solvedRooms.push(lastRoom);
      let cur = { boxes: new Set(boxes), player };
      let out = '';
      let good = true;
      for (const sr of solvedRooms) {
        const boxNow = cur.boxes;
        const walk = walkPath(w, h, cur.player, sr.entry, (c) => !wall[c] && !boxNow.has(c));
        if (walk === null) { good = false; break; }
        const seg = walk + (sr.useAny ? sr.any : (sr.withExit ?? sr.any));
        const next = replay({ w, wall, boxes: [...boxNow], player: cur.player }, seg);
        if (!next) { good = false; break; }
        out += seg;
        cur = next;
      }
      if (good) {
        const fin = replay(level, out);
        if (fin && goals.every((g) => fin.boxes.has(g))) return out;
      }
    }
  }
  const allowed = new Uint8Array(w * h);
  for (let c = 0; c < w * h; c++) allowed[c] = wall[c] ? 0 : 1;
  const moves = pushSolve(w, h, allowed, boxes, goals, player, 300_000, null);
  if (moves !== null) {
    const fin = replay(level, moves);
    if (fin && goals.every((g) => fin.boxes.has(g))) return moves;
  }
  return '';
}

for (const id of readdirSync(I).sort()) {
  const level = parse(readFileSync(join(I, id, 'level.txt'), 'utf8'));
  const moves = solveLevel(level);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'solution.txt'), `${moves}\n`);
}
