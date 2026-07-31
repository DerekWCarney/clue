const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Game Constants
const SUSPECTS = [
  'Brian Albert', 'Coco Albert', 'Brian Higgins',
  'Colin Albert', 'Jen McCabe', 'Matt McCabe'
];

const WEAPONS = [
  'Fist', 'Rubber Duck', 'Turtle',
  'SUV', 'Red Solo Cup', 'Leaf Blower'
];

const ROOMS = [
  '34 Fairview', 'Canton Library', 'Canton High School',
  'Sallyport', '1 Meadows', 'Canton Police Dept.',
  'D & E Pizza', 'CF McCarthy\'s Bar', 'The Waterfall Bar & Grill'
];

const INITIAL_POSITIONS = {
  'Brian Albert':  { x: 65, y: 6 },
  'Coco Albert':   { x: 90, y: 31 },
  'Brian Higgins': { x: 42, y: 91 },
  'Colin Albert':  { x: 58, y: 91 },
  'Jen McCabe':    { x: 9, y: 23 },
  'Matt McCabe':   { x: 9, y: 72 }
};

const INITIAL_WEAPON_POSITIONS = {
  'Turtle':       { x: 20, y: 18 },
  'Fist':         { x: 50, y: 18 },
  'Rubber Duck':  { x: 80, y: 18 },
  'SUV':          { x: 20, y: 48 },
  'Red Solo Cup': { x: 50, y: 78 },
  'Leaf Blower':  { x: 80, y: 78 }
};

const ROOM_COORDINATES = {
  '34 Fairview':               { x: 20, y: 18 },
  'Canton Library':            { x: 50, y: 18 },
  'Canton High School':        { x: 80, y: 18 },
  'Sallyport':                 { x: 20, y: 45 },
  '1 Meadows':                 { x: 80, y: 48 },
  'Canton Police Dept.':       { x: 20, y: 72 },
  'D & E Pizza':               { x: 20, y: 90 },
  'CF McCarthy\'s Bar':        { x: 50, y: 78 },
  'The Waterfall Bar & Grill': { x: 80, y: 90 }
};

const games = {};

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}

function initializeGame(roomId) {
  const room = games[roomId];
  const players = Object.values(room.players);

  const secretSuspect = SUSPECTS[Math.floor(Math.random() * SUSPECTS.length)];
  const secretWeapon = WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
  const secretRoom = ROOMS[Math.floor(Math.random() * ROOMS.length)];

  room.envelope = { suspect: secretSuspect, weapon: secretWeapon, room: secretRoom };

  const deck = [
    ...SUSPECTS.filter(s => s !== secretSuspect),
    ...WEAPONS.filter(w => w !== secretWeapon),
    ...ROOMS.filter(r => r !== secretRoom)
  ];

  const shuffledDeck = shuffle(deck);

  players.forEach(p => { p.hand = []; p.eliminated = false; });

  let cardIdx = 0;
  while (cardIdx < shuffledDeck.length) {
    const player = players[cardIdx % players.length];
    player.hand.push(shuffledDeck[cardIdx]);
    cardIdx++;
  }

  room.status = 'IN_PROGRESS';
  room.turnIndex = 0;
  room.turnOrder = players.map(p => p.id);
}

// Serve single-page web client
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Online Custom Clue Game</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    body { font-family: sans-serif; margin: 1.5rem; background: #121212; color: #fff; }
    .card { background: #1e1e1e; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
    button { background: #e50914; color: white; border: none; padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px; font-weight: bold; }
    button:hover { background: #ff1e27; }
    input, select { padding: 0.5rem; margin-right: 0.5rem; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 4px; }
    .game-layout { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .board-wrapper { position: relative; display: inline-block; width: 100%; max-width: 650px; }
    .board-img { width: 100%; height: auto; display: block; border-radius: 8px; border: 2px solid #333; cursor: crosshair; }
    .token {
      position: absolute;
      width: 44px;
      height: auto;
      transform: translate(-50%, -85%);
      transition: all 0.3s ease-in-out;
      pointer-events: none;
      filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.8));
    }
    .weapon-token {
      position: absolute;
      width: 32px;
      height: auto;
      transform: translate(-50%, -50%);
      transition: all 0.3s ease-in-out;
      pointer-events: none;
      filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.9));
    }
    .controls-container { flex: 1; min-width: 300px; }
    .hand-card { display: inline-block; padding: 0.5rem 1rem; background: #333; border: 1px solid #555; margin: 4px; border-radius: 4px; }
  </style>
</head>
<body>

  <h1>Online Custom Clue Game</h1>

  <div id="join-section" class="card">
    <input id="username" placeholder="Your Name" />
    <input id="room-id" placeholder="Room Code" value="ROOM1" />
    <button onclick="joinRoom()">Join Game Room</button>
  </div>

  <div id="game-section" style="display:none;">
    <div class="card">
      <h2 id="room-title"></h2>
      <button id="start-btn" onclick="startGame()">Start Game</button>
    </div>

    <div class="game-layout">
      <div class="card">
        <h3>Game Board (Click tile to move selected suspect)</h3>
        <div class="board-wrapper" id="board-container" onclick="handleBoardClick(event)">
          <img src="GameBoard (1).jpg" id="board-img" class="board-img" alt="Game Board" />
          <div id="tokens-layer"></div>
          <div id="weapons-layer"></div>
        </div>
      </div>

      <div class="controls-container">
        <div class="card">
          <h3>Your Active Token</h3>
          <select id="my-suspect">
            <option>Brian Albert</option>
            <option>Coco Albert</option>
            <option>Brian Higgins</option>
            <option>Colin Albert</option>
            <option>Jen McCabe</option>
            <option>Matt McCabe</option>
          </select>
        </div>

        <div class="card">
          <h3>Your Cards</h3>
          <div id="hand-container"><i>Waiting for game to start...</i></div>
        </div>

        <div class="card">
          <h3>Make Suggestion or Accusation</h3>
          <div style="display: flex; flex-direction: column; gap: 0.8rem;">
            <label>Suspect: 
              <select id="suspect-select">
                <option>Brian Albert</option><option>Coco Albert</option>
                <option>Brian Higgins</option><option>Colin Albert</option>
                <option>Jen McCabe</option><option>Matt McCabe</option>
              </select>
            </label>
            <label>Weapon: 
              <select id="weapon-select">
                <option>Fist</option><option>Rubber Duck</option>
                <option>Turtle</option><option>SUV</option>
                <option>Red Solo Cup</option><option>Leaf Blower</option>
              </select>
            </label>
            <label>Room: 
              <select id="room-select">
                <option>34 Fairview</option><option>Canton Library</option>
                <option>Canton High School</option><option>Sallyport</option>
                <option>1 Meadows</option><option>Canton Police Dept.</option>
                <option>D & E Pizza</option><option>CF McCarthy's Bar</option>
                <option>The Waterfall Bar & Grill</option>
              </select>
            </label>
            <div>
              <button onclick="makeSuggestion()">Make Suggestion</button>
              <button onclick="makeAccusation()" style="background:#d9534f;">Make Final Accusation</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top: 1rem;">
    <h3>Activity Log</h3>
    <ul id="log" style="list-style:none; padding:0; max-height: 150px; overflow-y: auto; color: #aaa;"></ul>
  </div>

  <script>
    const socket = io();
    let currentRoom = '';

    const SUSPECT_IMAGES = {
      'Brian Albert':  'unnamed (3).webp',
      'Jen McCabe':    'unnamed (2).webp',
      'Matt McCabe':   'unnamed (1).webp',
      'Coco Albert':   'Gemini_Generated_Image_lsky30lsky30lsky.png',
      'Brian Higgins': 'Gemini_Generated_Image_84kpll84kpll84kp (1).png',
      'Colin Albert':  'Gemini_Generated_Image_sh2vjnsh2vjnsh2v (1).png'
    };

    const WEAPON_IMAGES = {
      'Turtle':       'Remove background project - July 31, 2026 at 02.01.08 (1).jpg',
      'Fist':         'Remove background project - July 31, 2026 at 02.01.08.jpg',
      'Leaf Blower':  'Remove background project - July 31, 2026 at 02.01.08 (5).jpg',
      'Red Solo Cup': 'Remove background project - July 31, 2026 at 02.01.08 (3).png',
      'Rubber Duck':  'Remove background project - July 31, 2026 at 02.01.08 (2).jpg',
      'SUV':          'Remove background project - July 31, 2026 at 02.01.08 (6).jpg'
    };

    function log(msg) {
      const li = document.createElement('li');
      li.textContent = '> ' + msg;
      document.getElementById('log').prepend(li);
    }

    function joinRoom() {
      const playerName = document.getElementById('username').value;
      currentRoom = document.getElementById('room-id').value;
      if (!playerName || !currentRoom) return alert('Enter name and room code');

      socket.emit('joinRoom', { roomId: currentRoom, playerName });
      document.getElementById('join-section').style.display = 'none';
      document.getElementById('game-section').style.display = 'block';
      document.getElementById('room-title').textContent = 'Room: ' + currentRoom;
    }

    function startGame() {
      socket.emit('startGame', currentRoom);
    }

    function handleBoardClick(event) {
      const img = document.getElementById('board-img');
      const rect = img.getBoundingClientRect();
      const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
      const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
      const selectedSuspect = document.getElementById('my-suspect').value;

      socket.emit('moveToken', {
        roomId: currentRoom,
        suspect: selectedSuspect,
        x: xPercent.toFixed(2),
        y: yPercent.toFixed(2)
      });
    }

    function makeSuggestion() {
      socket.emit('makeSuggestion', {
        roomId: currentRoom,
        suspect: document.getElementById('suspect-select').value,
        weapon: document.getElementById('weapon-select').value,
        room: document.getElementById('room-select').value
      });
    }

    function makeAccusation() {
      if (confirm("Are you sure? An incorrect accusation eliminates you from winning!")) {
        socket.emit('makeAccusation', {
          roomId: currentRoom,
          suspect: document.getElementById('suspect-select').value,
          weapon: document.getElementById('weapon-select').value,
          room: document.getElementById('room-select').value
        });
      }
    }

    // Socket Events
    socket.on('roomState', (state) => {
      log('Players in room: ' + Object.keys(state.players).length);
    });

    socket.on('gameStarted', () => {
      log('Game started!');
      document.getElementById('start-btn').style.display = 'none';
    });

    socket.on('privateHand', (hand) => {
      document.getElementById('hand-container').innerHTML = hand.map(c => '<span class="hand-card">' + c + '</span>').join('');
    });

    socket.on('updatePositions', (positions) => {
      const layer = document.getElementById('tokens-layer');
      layer.innerHTML = '';
      for (const [suspect, pos] of Object.entries(positions)) {
        if (SUSPECT_IMAGES[suspect]) {
          const img = document.createElement('img');
          img.className = 'token';
          img.src = SUSPECT_IMAGES[suspect];
          img.title = suspect;
          img.style.left = pos.x + '%';
          img.style.top = pos.y + '%';
          layer.appendChild(img);
        }
      }
    });

    socket.on('updateWeaponPositions', (weaponPositions) => {
      const layer = document.getElementById('weapons-layer');
      layer.innerHTML = '';
      for (const [weapon, pos] of Object.entries(weaponPositions)) {
        if (WEAPON_IMAGES[weapon]) {
          const img = document.createElement('img');
          img.className = 'weapon-token';
          img.src = WEAPON_IMAGES[weapon];
          img.title = weapon;
          img.style.left = pos.x + '%';
          img.style.top = pos.y + '%';
          layer.appendChild(img);
        }
      }
    });

    socket.on('suggestionMade', ({ by, suggestion }) => {
      log(by + ' suggested: ' + suggestion.suspect + ' in ' + suggestion.room + ' with the ' + suggestion.weapon);
    });

    socket.on('gameOver', ({ winner, solution }) => {
      alert('GAME OVER! Winner: ' + winner + '\\nSolution: ' + solution.suspect + ', ' + solution.weapon + ', ' + solution.room);
    });

    socket.on('playerEliminated', ({ playerName, message }) => {
      log(playerName + ' eliminated! ' + message);
    });
  </script>
</body>
</html>
  `);
});

// Static assets (Place image files in the same directory as app.js)
app.use(express.static(__dirname));

// Socket.io Game Server Logic
io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, playerName }) => {
    socket.join(roomId);

    if (!games[roomId]) {
      games[roomId] = {
        id: roomId,
        players: {},
        status: 'LOBBY',
        envelope: null,
        turnIndex: 0,
        turnOrder: [],
        positions: { ...INITIAL_POSITIONS },
        weaponPositions: { ...INITIAL_WEAPON_POSITIONS }
      };
    }

    games[roomId].players[socket.id] = {
      id: socket.id,
      name: playerName || `Player ${Object.keys(games[roomId].players).length + 1}`,
      hand: [],
      eliminated: false
    };

    io.to(roomId).emit('roomState', games[roomId]);
    io.to(roomId).emit('updatePositions', games[roomId].positions);
    io.to(roomId).emit('updateWeaponPositions', games[roomId].weaponPositions);
  });

  socket.on('startGame', (roomId) => {
    const game = games[roomId];
    if (game && Object.keys(game.players).length >= 2) {
      initializeGame(roomId);
      io.to(roomId).emit('gameStarted', game);
      Object.values(game.players).forEach(p => {
        io.to(p.id).emit('privateHand', p.hand);
      });
    }
  });

  socket.on('moveToken', ({ roomId, suspect, x, y }) => {
    const game = games[roomId];
    if (game && game.positions[suspect]) {
      game.positions[suspect] = { x, y };
      io.to(roomId).emit('updatePositions', game.positions);
    }
  });

  socket.on('makeSuggestion', ({ roomId, suspect, weapon, room }) => {
    const game = games[roomId];
    if (!game || game.status !== 'IN_PROGRESS') return;

    const targetCoords = ROOM_COORDINATES[room];
    if (targetCoords) {
      game.positions[suspect] = { x: targetCoords.x - 3, y: targetCoords.y };
      game.weaponPositions[weapon] = { x: targetCoords.x + 3, y: targetCoords.y };

      io.to(roomId).emit('updatePositions', game.positions);
      io.to(roomId).emit('updateWeaponPositions', game.weaponPositions);
    }

    io.to(roomId).emit('suggestionMade', {
      by: game.players[socket.id].name,
      suggestion: { suspect, weapon, room }
    });
  });

  socket.on('makeAccusation', ({ roomId, suspect, weapon, room }) => {
    const game = games[roomId];
    if (!game || game.status !== 'IN_PROGRESS') return;

    const env = game.envelope;
    const isCorrect = env.suspect === suspect && env.weapon === weapon && env.room === room;

    if (isCorrect) {
      game.status = 'ENDED';
      io.to(roomId).emit('gameOver', { winner: game.players[socket.id].name, solution: env });
    } else {
      game.players[socket.id].eliminated = true;
      io.to(roomId).emit('playerEliminated', {
        playerName: game.players[socket.id].name,
        message: 'Incorrect accusation!'
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Clue App running on http://localhost:${PORT}`);
});