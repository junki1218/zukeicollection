// =========================
// ゲームデータ設定
// =========================
const ALL_SHAPES = ['circle', 'triangle', 'right-triangle', 'square', 'rectangle', 'rhombus'];

const SHAPE_NAMES = {
    'circle': 'まる',
    'triangle': 'せいさんかくけい',
    'right-triangle': 'ちょっかく<br>にとうへん<br>さんかくけい',
    'square': 'せいほうけい',
    'rectangle': 'ちょうほうけい',
    'rhombus': 'ひしがた'
};

const SHAPE_COLORS = [
    '#FF3B30', '#FF9500', '#FFCC00', '#4CD964',
    '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55'
];

const STAGES = [
    {
        id: 1,
        title: "きほんの かたち",
        targets: ['circle', 'triangle', 'square'],
        nextMsg: "つぎは すこし むずかしい かたちだよ！"
    },
    {
        id: 2,
        title: "いろんな しかくけい",
        targets: ['rectangle', 'rhombus', 'right-triangle'],
        nextMsg: "さいごは ぜんぶ みっくす！"
    },
    {
        id: 3,
        title: "ぜんぶ あつめよう",
        targets: ['circle', 'triangle', 'right-triangle', 'square', 'rectangle', 'rhombus'],
        nextMsg: "くりあ おめでとう！"
    }
];

const MAX_SHAPES = 12;

// =========================
// ゲーム状態管理
// =========================
const state = {
    // players配列は設定画面の値保持にも使うため初期値を入れておく
    players: [
        { id: 1, name: "プレイヤー1", iconDataUrl: null, isAlive: true },
        { id: 2, name: "プレイヤー2", iconDataUrl: null, isAlive: true }
    ],
    ojamaImageUrl: null,

    // ゲーム進行中の並び順 (初回の決定順序を維持)
    playerOrder: [],

    stageIndex: 0,
    turnQueue: [], // 今のステージをプレイする予定のプレイヤーのID配列
    currentPlayerId: null,

    playing: false,
    remaining: [], // 現在のターゲット（未取得）
    shapes: [],     // 画面上の図形オブジェクト
    animationFrameId: null
};

// =========================
// 音響
// =========================
let audioCtx;
function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function correctSound() {
    playTone(880, 'sine', 0.1);
    setTimeout(() => playTone(1760, 'sine', 0.4), 100);
}

function incorrectSound() {
    playTone(150, 'square', 0.2);
    setTimeout(() => playTone(100, 'sawtooth', 0.3), 150);
}

function victorySound() {
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'triangle', 0.5), i * 120);
    });
}

function fanfaleSound() {
    [523, 659, 783, 1046, 783, 1046, 1318, 1567].forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'sine', 0.6), i * 150);
    });
}

function explosionSound() {
    // 爆発音 (ノイズと低音の組み合わせ)
    if (!audioCtx) return;
    playTone(100, 'sawtooth', 1.0);
    playTone(50, 'square', 1.0);
}

// =========================
// SVG生成
// =========================
function getShapeSVG(shapeType, color) {
    let inner = '';
    switch (shapeType) {
        case 'circle': inner = `<circle cx="50" cy="50" r="45" fill="${color}" />`; break;
        case 'triangle': inner = `<polygon points="50,5 95,85 5,85" fill="${color}" />`; break;
        case 'right-triangle': inner = `<polygon points="10,10 10,90 90,90" fill="${color}" />`; break;
        case 'square': inner = `<rect x="10" y="10" width="80" height="80" fill="${color}" />`; break;
        case 'rectangle': inner = `<rect x="10" y="30" width="80" height="40" fill="${color}" />`; break;
        case 'rhombus': inner = `<polygon points="50,20 90,50 50,80 10,50" fill="${color}" />`; break;
    }
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

// =========================
// UI・設定画面機能
// =========================
function createBgShapes(count = 20) {
    const container = document.getElementById('bgContainer');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const shape = document.createElement('div');
        shape.className = 'bg-shape';
        shape.style.left = Math.random() * 100 + 'vw';
        shape.style.top = (Math.random() * 100) + 'vh';
        const size = 30 + Math.random() * 50;
        shape.style.width = size + 'px';
        shape.style.height = size + 'px';
        shape.style.borderRadius = Math.random() > 0.5 ? '50%' : '10%';
        shape.style.animationDuration = (8 + Math.random() * 10) + 's';
        shape.style.animationDelay = (Math.random() * 5) + 's';
        container.appendChild(shape);
    }
}

function goToSettings() {
    initAudio();
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('settingsScreen').classList.remove('hidden');
    updatePlayerInputs();
}

function updatePlayerInputs() {
    const count = parseInt(document.getElementById('playerCountSelect').value, 10);
    const container = document.getElementById('playerSettingsContainer');

    // 既存の入力値をstate.playersに保存
    Array.from(container.querySelectorAll('.player-input-row')).forEach((row, idx) => {
        if (state.players[idx]) {
            state.players[idx].name = row.querySelector('input[type="text"]').value;
            const bgImg = row.querySelector('.icon-preview').style.backgroundImage;
            state.players[idx].iconDataUrl = bgImg && bgImg !== 'none' ? bgImg.slice(4, -1).replace(/"/g, "") : null;
        }
    });

    // 足りないプレイヤー要素を補完
    while (state.players.length < count) {
        state.players.push({
            id: state.players.length + 1,
            name: `プレイヤー${state.players.length + 1}`,
            iconDataUrl: null,
            isAlive: true
        });
    }
    // 多い場合はカット（必要なら）
    if (state.players.length > count) {
        state.players.splice(count);
    }

    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'player-input-row';

        const p = state.players[i];
        const bgImgStyle = p.iconDataUrl ? `background-image:url(${p.iconDataUrl})` : '';

        row.innerHTML = `
            <span style="font-weight:bold; color:#4169E1;">P${i + 1}</span>
            <input type="text" id="p${i + 1}-name" placeholder="なまえ（任意）" value="${p.name}">
            <label class="icon-upload-lbl">
                <input type="file" accept="image/*" onchange="previewImage(this, 'p${i + 1}-icon')">
                <div class="icon-preview" id="p${i + 1}-icon" tabindex="0" style="${bgImgStyle}">${p.iconDataUrl ? '' : '画像'}</div>
            </label>
        `;
        container.appendChild(row);
    }
}

function previewImage(inputElem, previewId) {
    if (inputElem.files && inputElem.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById(previewId);
            preview.style.backgroundImage = `url(${e.target.result})`;
            preview.textContent = ''; // 文字を消す

            if (previewId === 'ojamaPreview') {
                state.ojamaImageUrl = e.target.result;
            }
        }
        reader.readAsDataURL(inputElem.files[0]);
    }
}

// =========================
// ゲーム開始・フロー制御
// =========================
function startGameFromSettings() {
    const count = parseInt(document.getElementById('playerCountSelect').value, 10);

    // 入力値の最新状態を保存して、ゲーム用の状態をリセット
    for (let i = 0; i < count; i++) {
        const nameInput = document.getElementById(`p${i + 1}-name`).value;
        state.players[i].name = nameInput.trim() !== '' ? nameInput.trim() : `プレイヤー${i + 1}`;

        const iconDiv = document.getElementById(`p${i + 1}-icon`);
        if (iconDiv.style.backgroundImage && iconDiv.style.backgroundImage !== 'none') {
            state.players[i].iconDataUrl = iconDiv.style.backgroundImage.slice(4, -1).replace(/"/g, "");
        }

        // isAliveをリセット
        state.players[i].isAlive = true;
    }

    // ゲーム順序をランダムに決定
    let ids = state.players.map(p => p.id);
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    state.playerOrder = ids;

    document.getElementById('settingsScreen').classList.add('hidden');
    createBgShapes();

    state.stageIndex = 0;

    // ゲームループ開始
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = requestAnimationFrame(updateGameLoop);

    prepareStage(0);
}

function prepareStage(index) {
    // 決定した最初のランダム順序（playerOrder）に沿って、生きているプレイヤーをキューに入れる
    state.turnQueue = [];
    state.playerOrder.forEach(id => {
        const p = state.players.find(player => player.id === id);
        if (p && p.isAlive) {
            state.turnQueue.push(id);
        }
    });

    if (state.turnQueue.length === 0) {
        showAllClear(); // 全滅か全クリア
        return;
    }

    nextPlayerTurn();
}

function nextPlayerOrStage() {
    document.getElementById('stageClearScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');

    nextPlayerTurn();
}

function nextPlayerTurn() {
    // キューが空なら、このステージは全員終わったので次のステージへ
    if (state.turnQueue.length === 0) {
        state.stageIndex++;
        if (state.stageIndex < STAGES.length) {
            prepareStage(state.stageIndex);
        } else {
            showAllClear();
        }
        return;
    }

    state.currentPlayerId = state.turnQueue.shift();
    const player = state.players.find(p => p.id === state.currentPlayerId);

    // ターンスクリーンを表示
    showTurnScreen(player);
}

function showTurnScreen(player) {
    const turnScreen = document.getElementById('turnScreen');
    const nameEl = document.getElementById('turnPlayerName');
    const iconEl = document.getElementById('turnPlayerIcon');

    nameEl.textContent = player.name;
    if (player.iconDataUrl) {
        iconEl.style.backgroundImage = `url(${player.iconDataUrl})`;
        iconEl.style.backgroundColor = 'transparent';
    } else {
        iconEl.style.backgroundImage = 'none';
        iconEl.style.backgroundColor = '#ddd';
        iconEl.innerHTML = `<span style="display:flex;align-items:center;justify-content:center;height:100%;font-size:30px;color:#888;">👤</span>`;
    }

    turnScreen.classList.remove('hidden');

    setTimeout(() => {
        turnScreen.classList.add('hidden');
        startGameplayForCurrentPlayer();
    }, 2500);
}

function startGameplayForCurrentPlayer() {
    const stageData = STAGES[state.stageIndex];
    const player = state.players.find(p => p.id === state.currentPlayerId);

    state.playing = true;
    state.remaining = [...stageData.targets];

    // 既存図形削除
    state.shapes.forEach(s => { if (s.el.parentNode) s.el.remove(); });
    state.shapes = [];

    document.getElementById('gameContainer').classList.remove('blur');

    // ヘッダーUI更新
    const pIconData = player.iconDataUrl ? `background-image:url(${player.iconDataUrl})` : '';
    document.getElementById('playerIndicator').innerHTML = `
        <div class="mini-icon" style="${pIconData}"></div>
        ${player.name}
    `;

    document.getElementById('stageIndicator').textContent = `すてーじ ${state.stageIndex + 1}`;
    document.getElementById('headerText').textContent = stageData.title;

    const progressArea = document.getElementById('progressArea');
    progressArea.innerHTML = '';

    if (stageData.targets.length > 5) {
        progressArea.classList.add('small-mode');
    } else {
        progressArea.classList.remove('small-mode');
    }

    stageData.targets.forEach((shapeType, i) => {
        const item = document.createElement('div');
        item.className = 'progressItem';
        item.id = `item-${i}`;
        item.innerHTML = `
            <div class="checkbox" id="check-${i}" data-shape="${shapeType}">
                ${getShapeSVG(shapeType, '#aaa')}
            </div>
            <div class="shapeLabel">${SHAPE_NAMES[shapeType]}</div>
        `;
        progressArea.appendChild(item);
    });
}

// =========================
// 図形・お邪魔図形 スポーン
// =========================
function spawnShape() {
    const area = document.getElementById('mainArea');
    const w = area.offsetWidth;
    const currentStage = STAGES[state.stageIndex];

    let shapeType;
    let isOjama = false;

    const rand = Math.random();

    // お邪魔図形が出る確率 (20%程度)
    if (rand < 0.2) {
        shapeType = 'ojama';
        isOjama = true;
    } else {
        const correctInScene = state.shapes.some(s => state.remaining.includes(s.shapeType));
        if (!correctInScene && state.remaining.length > 0 && Math.random() < 0.7) {
            shapeType = state.remaining[Math.floor(Math.random() * state.remaining.length)];
        } else {
            if (state.remaining.length > 0 && Math.random() < 0.3) {
                shapeType = state.remaining[Math.floor(Math.random() * state.remaining.length)];
            } else {
                const distractions = ALL_SHAPES.filter(s => !currentStage.targets.includes(s));
                if (distractions.length > 0) {
                    shapeType = distractions[Math.floor(Math.random() * distractions.length)];
                } else {
                    shapeType = ALL_SHAPES[Math.floor(Math.random() * ALL_SHAPES.length)];
                }
            }
        }
    }

    const div = document.createElement('div');
    div.className = 'floatingShape';

    const color = SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)];

    if (isOjama) {
        if (state.ojamaImageUrl) {
            div.innerHTML = `<div class="ojama-img-view" style="background-image:url(${state.ojamaImageUrl})"></div>`;
        } else {
            // デフォルトのドクロ等
            div.innerHTML = `<div class="ojama-img-view" style="background-color:#333; display:flex; align-items:center; justify-content:center; font-size:40px;">☠️</div>`;
        }
    } else {
        div.innerHTML = getShapeSVG(shapeType, color);
    }

    const padding = 50;
    let x = padding + Math.random() * (w - padding * 2);
    let y = -90;

    // ステージが進むほど少し速く
    const speedMult = 1.0 + (state.stageIndex * 0.2);
    const vx = (Math.random() - 0.5) * 4 * speedMult;
    const vy = (2.0 + Math.random() * 2.5) * speedMult;
    const vRot = (Math.random() - 0.5) * 6 * speedMult;

    const obj = {
        shapeType: shapeType,
        color: color,
        isOjama: isOjama,
        x, y,
        vx, vy, vRot,
        rotation: Math.random() * 360,
        el: div,
        isDead: false
    };

    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.style.transform = `rotate(${obj.rotation}deg)`;

    const handleTap = (e) => {
        e.stopPropagation();
        e.preventDefault();
        clickShape(obj, e.clientX || e.touches[0].clientX, e.clientY || e.touches[0].clientY);
    };

    div.onmousedown = handleTap;
    div.ontouchstart = handleTap;

    area.appendChild(div);
    state.shapes.push(obj);
}

function clickShape(obj, clickX, clickY) {
    if (!state.playing || obj.isDead) return;

    if (obj.isOjama) {
        handleOjamaExplosion(obj);
        return;
    }

    const matchIndex = state.remaining.indexOf(obj.shapeType);

    if (matchIndex !== -1) {
        correctSound();
        obj.isDead = true;

        obj.el.style.transition = "all 0.3s cubic-bezier(0,0,0.2,1)";
        obj.el.style.transform = `scale(2) rotate(${obj.rotation + 180}deg)`;
        obj.el.style.opacity = "0";

        showPopupEffect(clickX, clickY, "⭕️", obj.color);
        spawnParticles(clickX, clickY, obj.color);

        state.remaining.splice(matchIndex, 1);
        updateUIProgress(obj.shapeType, obj.color);

        setTimeout(() => removeShape(obj), 300);

        if (state.remaining.length === 0) {
            setTimeout(handleStageClearByPlayer, 1000);
        }
    } else {
        incorrectSound();
        showPopupEffect(clickX, clickY, "✖", "#555");

        let shake = 0;
        const interval = setInterval(() => {
            shake = (shake + 1) % 6;
            const offset = (shake % 2 === 0 ? 15 : -15);
            obj.el.style.left = (obj.x + offset) + 'px';
        }, 40);
        setTimeout(() => {
            clearInterval(interval);
            obj.el.style.left = obj.x + 'px';
        }, 300);
    }
}

function handleOjamaExplosion(obj) {
    state.playing = false; // ゲーム停止
    obj.isDead = true;

    incorrectSound();
    explosionSound();

    // 前面の他の要素より上にするため再配置
    document.body.appendChild(obj.el);
    obj.el.style.left = obj.x + 'px';
    obj.el.style.top = obj.y + 'px';

    // 巨大化アニメーション
    obj.el.classList.add('explode-anim');

    // 画面揺れ
    document.getElementById('gameContainer').style.animation = "pulse 0.1s infinite alternate";

    setTimeout(() => {
        document.getElementById('gameContainer').style.animation = "";
        removeShape(obj);
        handlePlayerGameOver();
    }, 1200);
}

function updateUIProgress(shapeType, collectedColor) {
    const targets = STAGES[state.stageIndex].targets;
    for (let i = 0; i < targets.length; i++) {
        if (targets[i] === shapeType) {
            const el = document.getElementById(`check-${i}`);
            if (el && !el.classList.contains('collected')) {
                el.classList.add('collected');
                el.innerHTML = getShapeSVG(shapeType, collectedColor);
                document.getElementById(`item-${i}`).classList.add('collected');
                return;
            }
        }
    }
}

function handleStageClearByPlayer() {
    state.playing = false;
    clearShapesFromScreen();

    victorySound();
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            spawnParticles(window.innerWidth / 2, window.innerHeight / 2, SHAPE_COLORS[Math.floor(Math.random() * SHAPE_COLORS.length)]);
        }, i * 200);
    }

    const isStageLastPlayer = (state.turnQueue.length === 0);
    const msg = isStageLastPlayer ? STAGES[state.stageIndex].nextMsg : "つぎのひとの ばん だよ！";

    document.getElementById('nextStageMsg').textContent = msg;
    document.getElementById('stageClearScreen').classList.remove('hidden');
    document.getElementById('gameContainer').classList.add('blur');
}

function handlePlayerGameOver() {
    clearShapesFromScreen();

    // プレイヤー脱落処理
    const player = state.players.find(p => p.id === state.currentPlayerId);
    player.isAlive = false;

    document.getElementById('loserNameMsg').textContent = `${player.name} さん 脱落…`;
    document.getElementById('gameOverScreen').classList.remove('hidden');
    document.getElementById('gameContainer').classList.add('blur');
}

function clearShapesFromScreen() {
    state.shapes.forEach(s => {
        if (s.el && s.el.parentNode) {
            s.el.style.transition = "top 0.8s ease-in, transform 0.8s ease-in, opacity 0.5s";
            s.el.style.top = (window.innerHeight + 200) + "px";
            s.el.style.opacity = "0";
            setTimeout(() => { if (s.el.parentNode) s.el.remove(); }, 800);
        }
    });
    state.shapes = [];
}

function showAllClear() {
    fanfaleSound();

    // 全員死んだか、クリアしたか確認
    const survivors = state.players.filter(p => p.isAlive);
    const resultMsgEl = document.getElementById('survivalResultMsg');

    if (survivors.length > 0) {
        const survivorNames = survivors.map(p => p.name).join('、');
        resultMsgEl.innerHTML = `さいごまで のこったのは<br><span style="color:#4169E1;">${survivorNames}</span><br>おめでとう！`;
    } else {
        resultMsgEl.innerHTML = `ざんねん…<br>ぜんいん だっらく！`;
        resultMsgEl.style.color = "#FF3B30";
    }

    document.getElementById('allClearScreen').classList.remove('hidden');
    document.getElementById('gameContainer').classList.add('blur');
}

function returnToTitle() {
    document.getElementById('allClearScreen').classList.add('hidden');
    document.getElementById('gameContainer').classList.add('blur');
    document.getElementById('startScreen').classList.remove('hidden');
    state.playing = false;
}

// =========================
// エフェクト
// =========================
function showPopupEffect(x, y, text, color) {
    const el = document.createElement('div');
    el.className = 'popEffect';
    el.textContent = text;
    el.style.color = color;
    el.style.left = (x - 40) + 'px';
    el.style.top = (y - 40) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 600);
}

function spawnParticles(x, y, baseColor) {
    const colors = [baseColor, '#FFF', '#FFD700'];
    for (let i = 0; i < 15; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.left = x + 'px';
        p.style.top = y + 'px';

        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 120;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;

        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);

        document.body.appendChild(p);
        setTimeout(() => p.remove(), 800);
    }
}

function removeShape(obj) {
    if (obj.el && obj.el.parentNode) obj.el.remove();
    state.shapes = state.shapes.filter(s => s !== obj);
}

// =========================
// アニメーションループ
// =========================
function updateGameLoop() {
    if (state.playing) {
        const area = document.getElementById('mainArea');
        if (area) {
            const h = area.offsetHeight;
            const w = area.offsetWidth;

            for (let i = state.shapes.length - 1; i >= 0; i--) {
                const s = state.shapes[i];
                if (s.isDead) continue;

                s.x += s.vx;
                s.y += s.vy;
                s.rotation += s.vRot;

                if (s.y > h + 100) {
                    removeShape(s);
                    continue;
                }

                if (s.x < 0 || s.x > w - 80) {
                    s.vx *= -1;
                }

                s.el.style.left = s.x + 'px';
                s.el.style.top = s.y + 'px';
                s.el.style.transform = `rotate(${s.rotation}deg)`;
            }

            if (state.shapes.length < MAX_SHAPES && Math.random() < 0.05) {
                spawnShape();
            }
        }
    }
    state.animationFrameId = requestAnimationFrame(updateGameLoop);
}

// DOM読み込み完了時に背景を初期化
window.onload = () => {
    createBgShapes();
};
