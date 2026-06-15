// --- 1. 定数とDOM要素の定義 ---
const puzzleBoard = document.getElementById('puzzleBoard');
const movesDisplay = document.getElementById('movesDisplay');
const movesCount = document.getElementById('movesCount');
const timeDisplay = document.getElementById('timeDisplay');
const timeCount = document.getElementById('timeCount');
const messageDisplay = document.getElementById('message');
const bestScoreDisplay = document.getElementById('bestScoreDisplay');
const bestScoreCount = document.getElementById('bestScoreCount');
const bestTimeDisplay = document.getElementById('bestTimeDisplay');
const bestTimeCount = document.getElementById('bestTimeCount');
const newGameButton = document.getElementById('newGameButton');
const retryButton = document.getElementById('retryButton');
const numberToggleInput = document.getElementById('numberToggleInput');
const shareBox = document.getElementById('shareBox');
const shareLink = document.getElementById('shareLink');
const modeButtons = document.querySelectorAll('.mode-button');
const SCORE_STORAGE_VERSION = '2';
const SCORE_STORAGE_VERSION_KEY = 'puzzleScoreStorageVersion';
const COMPLETION_IMAGES = [
    './images/furimuki_2.png',
    './images/furimuki_3.png',
    './images/furimuki_4.png'
];

// --- 2. ゲームの状態変数 ---
let tiles = [];     
let boardState = []; 
let initialBoardState = [];
let moves = 0;
let isGameActive = false;
let currentBoardSize = 4;
let isNumberHidden = true;
let swipeStart = null;
let suppressNextClick = false;
let timerStartTime = null;
let timerInterval = null;
let elapsedSeconds = 0;
// 完成・リセット演出の途中で押し直しても、古いタイマーが残らないように管理する
let completionTimer = null;
let resetAnimationTimer = null;

// --- 3. ユーティリティ関数 ---

/**
 * ハイスコア（最少手数）をロードし、表示する
 */
function loadHighScore() {
    const savedScore = localStorage.getItem(getHighScoreKey());
    const score = savedScore ? parseInt(savedScore, 10) : Infinity;
    // 0手クリアはありえないので、古い不正な保存値は未記録扱いにする
    return score > 0 ? score : Infinity;
}

function loadBestTime() {
    const savedTime = localStorage.getItem(getBestTimeKey());
    const time = savedTime ? parseInt(savedTime, 10) : Infinity;
    return time >= 0 ? time : Infinity;
}

function getTileCount() {
    return currentBoardSize * currentBoardSize;
}

function getHighScoreKey() {
    return `puzzleHighScore-${currentBoardSize}x${currentBoardSize}`;
}

function getBestTimeKey() {
    return `puzzleBestTime-${currentBoardSize}x${currentBoardSize}`;
}

function resetOldScoresOnce() {
    if (localStorage.getItem(SCORE_STORAGE_VERSION_KEY) === SCORE_STORAGE_VERSION) return;

    [2, 3, 4].forEach(size => {
        localStorage.removeItem(`puzzleHighScore-${size}x${size}`);
        localStorage.removeItem(`puzzleBestTime-${size}x${size}`);
    });
    localStorage.setItem(SCORE_STORAGE_VERSION_KEY, SCORE_STORAGE_VERSION);
}

function isCompletedState(state) {
    return state.every((value, index) => value === index + 1);
}

function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimeDisplay(totalSeconds = 0) {
    const formattedTime = formatTime(totalSeconds);
    timeCount.textContent = formattedTime;
    timeDisplay.setAttribute('aria-label', `タイム: ${formattedTime}`);
}

function updateMovesDisplay() {
    movesCount.textContent = moves;
    movesDisplay.setAttribute('aria-label', `手数: ${moves}`);
}

function startTimer() {
    if (timerInterval) return;

    timerStartTime = Date.now();
    timerInterval = window.setInterval(() => {
        elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
        updateTimeDisplay(elapsedSeconds);
    }, 1000);
}

function stopTimer() {
    if (!timerInterval) return;

    elapsedSeconds = Math.floor((Date.now() - timerStartTime) / 1000);
    window.clearInterval(timerInterval);
    timerInterval = null;
    updateTimeDisplay(elapsedSeconds);
}

function resetElapsedTime() {
    window.clearInterval(timerInterval);
    timerStartTime = null;
    timerInterval = null;
    elapsedSeconds = 0;
    updateTimeDisplay();
}

function hideShareLink() {
    shareBox.classList.add('hidden');
    shareLink.removeAttribute('href');
}

function showShareLink() {
    const resultText =
        `ウミウサ明ちゃんパズル(${currentBoardSize}x${currentBoardSize}) をクリア！\n` +
        `手数: ${moves}\n` +
        `タイム: ${formatTime(elapsedSeconds)}\n` +
        `#きょうあい #強制改宗大恋愛`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(resultText)}`;

    shareLink.href = shareUrl;
    shareBox.classList.remove('hidden');
}

/**
 * 解が存在するかどうかを判定する (インバージョン数チェック)
 */
function isSolvable(state) {
    let inversions = 0;
    const tileCount = getTileCount();
    const tempState = state.filter(n => n !== tileCount); 
    
    for (let i = 0; i < tempState.length; i++) {
        for (let j = i + 1; j < tempState.length; j++) {
            if (tempState[i] > tempState[j]) {
                inversions++;
            }
        }
    }

    if (currentBoardSize % 2 !== 0) {
        return inversions % 2 === 0;
    }

    const emptyTileIndex = state.indexOf(tileCount);
    const emptyTileRowFromBottom = currentBoardSize - Math.floor(emptyTileIndex / currentBoardSize);

    // 偶数サイズパズルの解ける条件は「空白行とインバージョン数の奇偶が異なる」こと
    return (emptyTileRowFromBottom % 2 !== 0) !== (inversions % 2 !== 0);
}

/**
 * 配列をシャッフルし、解けるまで繰り返す
 */
function generateSolvableState() {
    let state;
    const tileCount = getTileCount();
    do {
        state = Array.from({length: tileCount}, (_, i) => i + 1);
        // Fisher-Yatesシャッフル
        for (let i = state.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [state[i], state[j]] = [state[j], state[i]];
        }
    } while (!isSolvable(state) || isCompletedState(state)); 

    return state;
}

function setRandomCompletionImage() {
    const imagePath = COMPLETION_IMAGES[Math.floor(Math.random() * COMPLETION_IMAGES.length)];
    puzzleBoard.style.setProperty('--completion-image', `url("${imagePath}")`);
}

// --- 4. ゲームボードの構築と初期化 ---

function updateHighScoreDisplay() {
    const currentHighScore = loadHighScore();
    const scoreText = currentHighScore === Infinity ? '-' : currentHighScore;
    bestScoreCount.textContent = scoreText;
    bestScoreDisplay.setAttribute('aria-label', `ベスト: ${scoreText}`);
}

function updateBestTimeDisplay() {
    const currentBestTime = loadBestTime();
    const timeText = currentBestTime === Infinity ? '-' : formatTime(currentBestTime);
    bestTimeCount.textContent = timeText;
    bestTimeDisplay.setAttribute('aria-label', `ベストタイム: ${timeText}`);
}

function updateModeButtons() {
    modeButtons.forEach(button => {
        const isActive = parseInt(button.dataset.size, 10) === currentBoardSize;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function updateNumberMode() {
    puzzleBoard.classList.toggle('hide-numbers', isNumberHidden);
    numberToggleInput.checked = !isNumberHidden;
}

function createBoard() {
    const tileCount = getTileCount();
    tiles = [];
    puzzleBoard.innerHTML = '';
    window.clearTimeout(completionTimer);
    window.clearTimeout(resetAnimationTimer);
    puzzleBoard.classList.remove('completed', 'resetting');
    hideShareLink();
    puzzleBoard.classList.toggle('hide-numbers', isNumberHidden);
    puzzleBoard.style.setProperty('--board-size', currentBoardSize);
    
    boardState = generateSolvableState();
    initialBoardState = [...boardState];
    
    boardState.forEach((value, index) => {
        const tile = document.createElement('div');
        tile.classList.add('tile');
        tile.textContent = value === tileCount ? '' : value; 
        tile.dataset.value = value;
        tile.dataset.currentPos = index + 1; 

        // 1枚の画像をタイルごとに切り出して表示するため、正解位置の背景座標を持たせる
        const correctCol = (value - 1) % currentBoardSize;
        const correctRow = Math.floor((value - 1) / currentBoardSize);
        tile.style.setProperty('--bg-x', `${(correctCol / (currentBoardSize - 1)) * 100}%`);
        tile.style.setProperty('--bg-y', `${(correctRow / (currentBoardSize - 1)) * 100}%`);
        tile.style.setProperty('--image-size', `${currentBoardSize * 100}%`);
        
        if (value === tileCount) {
            tile.classList.add('empty');
        } else {
            tile.addEventListener('click', handleTileClick);
        }

        puzzleBoard.appendChild(tile);
        tiles.push(tile);
    });
    
    isGameActive = true;
    updateTilePositions();
    updateCorrectTiles();
}

// --- 5. 移動ロジック ---

function updateTilePositions() {
    tiles.forEach((tile, index) => {
        const value = boardState[index];
        
        const actualTile = tiles.find(t => parseInt(t.dataset.value) === value);
        
        const row = Math.floor(index / currentBoardSize) + 1;
        const col = (index % currentBoardSize) + 1;
        
        actualTile.style.gridRowStart = row;
        actualTile.style.gridColumnStart = col;
        actualTile.dataset.currentPos = index + 1; 
    });
}

function updateCorrectTiles() {
    const tileCount = getTileCount();
    tiles.forEach(tile => {
        const currentValue = parseInt(tile.dataset.value);
        const currentPos = parseInt(tile.dataset.currentPos);

        // 正解位置に来たピースは数字とグレーを外し、イラストだけ見せる
        if (currentValue !== tileCount && currentValue === currentPos) {
            tile.classList.add('correct');
        } else {
            tile.classList.remove('correct');
        }
    });
}

function animateMovedTile(tile, startRect) {
    // CSS Grid の位置変更はそのままだと瞬間移動になるため、前後の差分でスライドさせる
    const endRect = tile.getBoundingClientRect();
    const diffX = startRect.left - endRect.left;
    const diffY = startRect.top - endRect.top;

    tile.style.transition = 'none';
    tile.style.transform = `translate(${diffX}px, ${diffY}px)`;

    requestAnimationFrame(() => {
        tile.style.transition = '';
        tile.style.transform = '';
    });
}

function animateCorrectTile(tile) {
    // 同じタイルが再び正解位置に入った時にもアニメーションを発火させる
    tile.classList.remove('pop');
    void tile.offsetWidth;
    tile.classList.add('pop');
    tile.addEventListener('animationend', () => {
        tile.classList.remove('pop');
    }, {once: true});
}

function tryMoveTile(tileIndex) {
    if (!isGameActive) return false;

    const emptyIndex = boardState.indexOf(getTileCount()); 
    
    const tileRow = Math.floor(tileIndex / currentBoardSize);
    const tileCol = tileIndex % currentBoardSize;
    const emptyRow = Math.floor(emptyIndex / currentBoardSize);
    const emptyCol = emptyIndex % currentBoardSize;

    const isAdjacent = Math.abs(tileRow - emptyRow) + Math.abs(tileCol - emptyCol) === 1;

    if (isAdjacent) {
        const movedTileValue = boardState[tileIndex];
        const movedTile = tiles.find(t => parseInt(t.dataset.value) === movedTileValue);
        const startRect = movedTile.getBoundingClientRect();
        const wasCorrect = movedTile.classList.contains('correct');

        [boardState[tileIndex], boardState[emptyIndex]] = 
        [boardState[emptyIndex], boardState[tileIndex]];

        startTimer();
        moves++;
        updateMovesDisplay();
        
        updateTilePositions();
        animateMovedTile(movedTile, startRect);
        updateCorrectTiles();
        const isWin = isCompletedState(boardState);

        // 完成時は全体フェードを優先し、最後のピースのポン演出は出さない
        if (!isWin && !wasCorrect && movedTile.classList.contains('correct')) {
            window.setTimeout(() => animateCorrectTile(movedTile), 220);
        }
        checkForWin(240);
        return true; 
    }
    return false; 
}

function getSwipeTargetIndex(tileIndex, diffX, diffY) {
    if (tileIndex === -1) return -1;

    const emptyIndex = boardState.indexOf(getTileCount());
    const tileRow = Math.floor(tileIndex / currentBoardSize);
    const isHorizontal = Math.abs(diffX) > Math.abs(diffY);

    let targetIndex;
    if (isHorizontal) {
        targetIndex = diffX > 0 ? tileIndex + 1 : tileIndex - 1;
        if (Math.floor(targetIndex / currentBoardSize) !== tileRow) return -1;
    } else {
        targetIndex = diffY > 0 ? tileIndex + currentBoardSize : tileIndex - currentBoardSize;
        if (targetIndex < 0 || targetIndex >= getTileCount()) return -1;
    }

    return targetIndex === emptyIndex ? tileIndex : -1;
}

// --- 6. イベントハンドラ ---

function handleTileClick(event) {
    if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        return;
    }

    const tile = event.currentTarget;
    const tileValue = parseInt(tile.dataset.value);
    const tileIndex = boardState.indexOf(tileValue);
    
    tryMoveTile(tileIndex);
}

function handleTouchStart(event) {
    const tile = event.target.closest('.tile:not(.empty)');
    if (!tile || !puzzleBoard.contains(tile)) {
        swipeStart = null;
        return;
    }

    const touch = event.changedTouches[0];
    swipeStart = {
        x: touch.clientX,
        y: touch.clientY,
        value: parseInt(tile.dataset.value)
    };
}

function handleTouchEnd(event) {
    if (!swipeStart) return;

    const touch = event.changedTouches[0];
    const diffX = touch.clientX - swipeStart.x;
    const diffY = touch.clientY - swipeStart.y;
    const swipeDistance = Math.hypot(diffX, diffY);
    const swipeThreshold = 28;

    if (swipeDistance < swipeThreshold) {
        swipeStart = null;
        return;
    }

    const tileIndex = boardState.indexOf(swipeStart.value);
    const targetTileIndex = getSwipeTargetIndex(tileIndex, diffX, diffY);

    if (targetTileIndex !== -1 && tryMoveTile(targetTileIndex)) {
        suppressNextClick = true;
        event.preventDefault();
    }

    swipeStart = null;
}

function handleTouchCancel() {
    swipeStart = null;
}

function handleKeydown(event) {
    const emptyIndex = boardState.indexOf(getTileCount());
    let targetIndex = -1; 
    
    switch (event.key) {
        case 'ArrowUp':
            targetIndex = emptyIndex + currentBoardSize; 
            break;
        case 'ArrowDown':
            targetIndex = emptyIndex - currentBoardSize; 
            break;
        case 'ArrowLeft':
            targetIndex = emptyIndex + 1;
            if ((emptyIndex % currentBoardSize) === currentBoardSize - 1) targetIndex = -1;
            break;
        case 'ArrowRight':
            targetIndex = emptyIndex - 1;
            if ((emptyIndex % currentBoardSize) === 0) targetIndex = -1;
            break;
        default:
            return; 
    }

    if (targetIndex >= 0 && targetIndex < getTileCount()) {
        if (tryMoveTile(targetIndex)) {
                event.preventDefault(); 
        }
    }
}

// --- 7. ゲーム終了と初期化 ---

function checkForWin(completionDelay = 0) {
    const isWin = isCompletedState(boardState);

    if (isWin) {
        isGameActive = false;
        stopTimer();
        // messageDisplay.textContent = `クリア！`;
        
        // ハイスコア更新
        const currentHighScore = loadHighScore();
        const currentBestTime = loadBestTime();
        let isNewRecord = false;

        if (moves < currentHighScore) {
            localStorage.setItem(getHighScoreKey(), moves);
            updateHighScoreDisplay();
            isNewRecord = true;
        }

        if (elapsedSeconds < currentBestTime) {
            localStorage.setItem(getBestTimeKey(), elapsedSeconds);
            updateBestTimeDisplay();
            isNewRecord = true;
        }

        if (isNewRecord) {
            // messageDisplay.textContent = `新記録！`;
        }

        window.clearTimeout(completionTimer);
        completionTimer = window.setTimeout(() => {
            // タイルを白に消したあと、完成イラストをゆっくりフェードインする
            setRandomCompletionImage();
            puzzleBoard.classList.add('completed');
            // showShareLink();
        }, completionDelay);
    }
}

function resetStats() {
    moves = 0;
    updateMovesDisplay();
    resetElapsedTime();
    hideShareLink();
    // messageDisplay.textContent = 'スタート！';
}

function startNewGame() {
    isGameActive = false;
    window.clearTimeout(completionTimer);
    window.clearTimeout(resetAnimationTimer);
    resetStats();

    // いきなり作り直さず、現在の盤面を白へフェードアウトしてからシャッフルする
    puzzleBoard.classList.add('resetting');
    resetAnimationTimer = window.setTimeout(() => {
        createBoard();
    }, 220);
}

function retryGame() {
    window.clearTimeout(completionTimer);
    window.clearTimeout(resetAnimationTimer);
    boardState = [...initialBoardState];
    isGameActive = true;
    resetStats();
    puzzleBoard.classList.remove('completed', 'resetting');
    hideShareLink();
    updateTilePositions();
    updateCorrectTiles();
}

function changeBoardSize(size) {
    currentBoardSize = size;
    resetStats();
    updateHighScoreDisplay();
    updateBestTimeDisplay();
    updateModeButtons();
    createBoard();
}

function toggleNumbers() {
    isNumberHidden = !numberToggleInput.checked;
    updateNumberMode();
}

// --- 8. 実行 ---

window.onload = () => {
    resetOldScoresOnce();
    updateHighScoreDisplay(); // 初期表示
    updateBestTimeDisplay();
    updateMovesDisplay();
    updateTimeDisplay();
    updateModeButtons();
    updateNumberMode();
    createBoard();
    newGameButton.addEventListener('click', startNewGame);
    retryButton.addEventListener('click', retryGame);
    numberToggleInput.addEventListener('change', toggleNumbers);
    puzzleBoard.addEventListener('touchstart', handleTouchStart, {passive: true});
    puzzleBoard.addEventListener('touchend', handleTouchEnd, {passive: false});
    puzzleBoard.addEventListener('touchcancel', handleTouchCancel);
    modeButtons.forEach(button => {
        button.addEventListener('click', () => {
            changeBoardSize(parseInt(button.dataset.size, 10));
        });
    });
    document.addEventListener('keydown', handleKeydown);
};
