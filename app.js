let peer = null;
let conn = null;
let amIHost = false;
let myTurn = false;
let gamePhase = "placement"; // Options: 'placement', 'playing', 'gameover'

// Game state arrays (0 = empty, 1 = ship, 2 = hit, 3 = miss)
let myGridState = Array(100).fill(0);
let enemyGridState = Array(100).fill(0);

const shipSizes = [5, 4, 3, 3, 2]; 
let currentShipIndex = 0; 
let horizontal = true; 

const ROOM_PREFIX = "ship-";

const btnRotateMobile = document.getElementById('btn-rotate-mobile');

let myRemainingHitsLeft = 17;
let enemyRemainingHitsLeft = 17;

let iWantToPlayAgain = false;
let opponentWantsToPlayAgain = false;

document.addEventListener("DOMContentLoaded", () => {
    const lobbyScreen = document.getElementById('lobby-screen');
    const gameScreen = document.getElementById('game-screen');
    const btnCreate = document.getElementById('btn-create');
    const btnJoin = document.getElementById('btn-join');
    const displayId = document.getElementById('display-id');
    const lobbyIdText = document.getElementById('lobby-id-text');
    const waitingStatus = document.getElementById('waiting-status');
    const inputLobbyId = document.getElementById('input-lobby-id');
    const turnIndicator = document.getElementById('turn-indicator');

    const gameOverModal = document.getElementById('game-over-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalStatusText = document.getElementById('modal-status-text');
    const btnPlayAgain = document.getElementById('btn-play-again');
    const btnLeaveLobby = document.getElementById('btn-leave-lobby');

    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'r') {
            horizontal = !horizontal;
            updateTurnText();
        }
    });
	
	btnRotateMobile.addEventListener('click', () => {
		horizontal = !horizontal;
		updateTurnText();
	});

    function updateTurnText() {
		if (gamePhase === "placement") {
			if (btnRotateMobile) btnRotateMobile.classList.remove('hidden'); 
			
			if (currentShipIndex < shipSizes.length) {
				turnIndicator.innerHTML = `Place your <strong>${shipSizes[currentShipIndex]}-cell ship</strong>.<br><small>Press 'R' or tap Rotate below (Current: ${horizontal ? 'Horizontal' : 'Vertical'})</small>`;
			} else {
				turnIndicator.innerText = "All ships placed! Waiting for opponent to finish setup...";
				if (btnRotateMobile) btnRotateMobile.classList.add('hidden');
			}
		} else if (gamePhase === "playing") {
			if (btnRotateMobile) btnRotateMobile.classList.add('hidden');
			turnIndicator.innerText = myTurn ? "🎯 Your Turn! Click on the Enemy Board." : "⏳ Opponent's Turn... Waiting.";
		}
	}

    function createBoards() {
        const myBoard = document.getElementById('my-board');
        const enemyBoard = document.getElementById('enemy-board');
        myBoard.innerHTML = '';
        enemyBoard.innerHTML = '';
        
        for (let i = 0; i < 100; i++) {
            let myCell = document.createElement('div');
            myCell.classList.add('cell');
            myCell.id = `my-cell-${i}`;
            myCell.addEventListener('click', () => handleMyGridClick(i));
            myBoard.appendChild(myCell);

            let enemyCell = document.createElement('div');
            enemyCell.classList.add('cell');
            enemyCell.id = `enemy-cell-${i}`;
            enemyCell.addEventListener('click', () => handleEnemyGridClick(i));
            enemyBoard.appendChild(enemyCell);
        }
    }

    function handleMyGridClick(index) {
        if (gamePhase !== "placement" || currentShipIndex >= shipSizes.length) return;

        const size = shipSizes[currentShipIndex];
        const row = Math.floor(index / 10);
        const col = index % 10;
        let targetIndices = [];

        for (let i = 0; i < size; i++) {
            if (horizontal) {
                if (col + i >= 10) return; 
                targetIndices.push(index + i);
            } else {
                if (row + i >= 10) return; 
                targetIndices.push(index + (i * 10));
            }
        }

        for (let idx of targetIndices) {
            if (myGridState[idx] === 1) return; 
        }

        for (let idx of targetIndices) {
            myGridState[idx] = 1;
            document.getElementById(`my-cell-${idx}`).style.backgroundColor = "#95a5a6"; 
        }

        currentShipIndex++;
        updateTurnText();

        if (currentShipIndex === shipSizes.length) {
            conn.send({ type: 'READY' });
            checkGameStart(); 
        }
    }

    function handleEnemyGridClick(index) {
        if (gamePhase !== "playing" || !myTurn) return;
        if (enemyGridState[index] !== 0) return; 

        myTurn = false; 
        updateTurnText();
        conn.send({ type: 'FIRE', index: index });
    }

    btnPlayAgain.addEventListener('click', () => {
        iWantToPlayAgain = true;
        btnPlayAgain.disabled = true;
        btnPlayAgain.innerText = "⏳ Waiting for opponent...";
        
        conn.send({ type: 'PLAY_AGAIN_REQUEST' });
        evaluateRematchConditions();
    });

    btnLeaveLobby.addEventListener('click', () => {
        if (conn) conn.send({ type: 'OPPONENT_LEFT' });
        returnToMainMenu();
    });

    function showEndScreen(victory) {
        gamePhase = "gameover";
        modalTitle.innerText = victory ? "🏆 VICTORY!" : "❌ DEFEAT!";
        modalStatusText.innerText = victory ? "Outstanding strategy! You sunk their entire fleet." : "All your vessels were compromised.";
        btnPlayAgain.disabled = false;
        btnPlayAgain.innerText = "🎮 Play Again";
        gameOverModal.classList.remove('hidden');
    }

    function evaluateRematchConditions() {
        if (iWantToPlayAgain && opponentWantsToPlayAgain) {

            gamePhase = "placement";
            myGridState = Array(100).fill(0);
            enemyGridState = Array(100).fill(0);
            currentShipIndex = 0;
            myRemainingHitsLeft = 17;
            enemyRemainingHitsLeft = 17;
            iWantToPlayAgain = false;
            opponentWantsToPlayAgain = false;
            opponentReady = false;

            gameOverModal.classList.add('hidden');
            createBoards();
            updateTurnText();
        }
    }

    function returnToMainMenu() {
        if (peer) { peer.destroy(); peer = null; }
        conn = null;
        gameOverModal.classList.add('hidden');
        gameScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        btnCreate.disabled = false;
        displayId.classList.add('hidden');
        waitingStatus.classList.add('hidden');
        inputLobbyId.value = '';
    }
	
	function randomRoomId() {
	  return ROOM_PREFIX + Math.random().toString(36).slice(2, 8).toUpperCase();
	}

    btnCreate.addEventListener('click', () => {
        amIHost = true;
        btnCreate.disabled = true;
		
        const customId = randomRoomId();
        peer = new Peer(customId);

        peer.on('open', (id) => {
            lobbyIdText.innerText = id;
            displayId.classList.remove('hidden');
            waitingStatus.classList.remove('hidden');
        });

        peer.on('connection', (connection) => {
            conn = connection;
            setupDataChannel();
        });
    });

    btnJoin.addEventListener('click', () => {
        const targetId = inputLobbyId.value.trim();
        if (!targetId) return alert("Please enter a valid Lobby ID");

        amIHost = false;
        peer = new Peer();

        peer.on('open', () => {
            conn = peer.connect(targetId);
            setupDataChannel();
        });
		
		peer.on('error', (err) => {
            if (err.type === 'unavailable-id') {
                alert("ID je zauzet, pokušajte ponovo.");
                returnToMainMenu();
            }
        });
    });

    let opponentReady = false;

    function setupDataChannel() {
        conn.on('open', () => {
            lobbyScreen.classList.add('hidden');
            gameScreen.classList.remove('hidden');
            createBoards();
            updateTurnText();
        });

        conn.on('data', (data) => {
            if (data.type === 'READY') {
                opponentReady = true;
                checkGameStart();
            }

            if (data.type === 'PLAY_AGAIN_REQUEST') {
                opponentWantsToPlayAgain = true;
                evaluateRematchConditions();
            }

            if (data.type === 'OPPONENT_LEFT') {
                alert("Your opponent left the game lobby.");
                returnToMainMenu();
            }

            if (data.type === 'FIRE') {
                if (gamePhase !== "playing") return;

                let targetIndex = data.index;
                let isHit = myGridState[targetIndex] === 1;
                
                if (isHit) {
                    myGridState[targetIndex] = 2; 
                    document.getElementById(`my-cell-${targetIndex}`).style.backgroundColor = "#e74c3c"; 
                    myRemainingHitsLeft--;
                } else {
                    myGridState[targetIndex] = 3; 
                    document.getElementById(`my-cell-${targetIndex}`).style.backgroundColor = "#3498db"; 
                }

                conn.send({ type: 'FIRE_RESULT', index: targetIndex, isHit: isHit, playerDefeated: myRemainingHitsLeft === 0 });

                if (myRemainingHitsLeft === 0) {
                    showEndScreen(false);
                } else {
                    myTurn = true;
                    updateTurnText();
                }
            }

            if (data.type === 'FIRE_RESULT') {
                enemyGridState[data.index] = data.isHit ? 2 : 3;
                document.getElementById(`enemy-cell-${data.index}`).style.backgroundColor = data.isHit ? "#e74c3c" : "#3498db";

                if (data.playerDefeated) {
                    showEndScreen(true);
                } else {
                    myTurn = false;
                    updateTurnText();
                }
            }
        });

        conn.on('close', () => {
            alert("Connection closed. Opponent disconnected.");
            returnToMainMenu();
        });
    }

    function checkGameStart() {
        console.log(`Checking game start... My ships: ${currentShipIndex}/${shipSizes.length}, Opponent Ready: ${opponentReady}`);
        if (currentShipIndex === shipSizes.length && opponentReady) {
            gamePhase = "playing";
            myTurn = amIHost; 
            updateTurnText();
            console.log("!!! GAME PHASE TRANSITIONED TO PLAYING !!! Turn status: " + myTurn);
        }
    }
});