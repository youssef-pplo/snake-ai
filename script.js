// --- Config ---
const CONFIG = {
    popSize: 200,
    mutationRate: 0.05,
    elitismCount: 4,
    speedMultiplier: 1,
    graphics: 'HIGH',
    gridSize: 20, // 20x20 grid cells
    tileCount: 20 // recalculated on resize
};

// --- Audio ---
const AudioSys = {
    ctx: null,
    init: function() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch (e) {
            console.warn('Audio context not available:', e);
        }
    },
    playTone: function(freq, type, duration, vol=0.1) {
        if (!this.ctx || game.mode === 'ai') return; 
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    eat: function() { 
        this.playTone(600, 'sine', 0.1, 0.1); 
        setTimeout(() => this.playTone(900, 'sine', 0.1, 0.1), 50); 
    },
    die: function() { 
        this.playTone(150, 'sawtooth', 0.3, 0.2); 
    },
    move: function() { /* too spammy */ }
};

// --- Neural Network (Simple Dense) ---
class NeuralNetwork {
    constructor(inputNodes, hiddenNodes, outputNodes) {
        this.inputNodes = inputNodes;
        this.hiddenNodes = hiddenNodes;
        this.outputNodes = outputNodes;
        this.weightsIH = new Float32Array(inputNodes * hiddenNodes);
        this.weightsHO = new Float32Array(hiddenNodes * outputNodes);
        this.randomize();
    }

    randomize() {
        for(let i=0; i<this.weightsIH.length; i++) this.weightsIH[i] = Math.random() * 2 - 1;
        for(let i=0; i<this.weightsHO.length; i++) this.weightsHO[i] = Math.random() * 2 - 1;
    }

    predict(inputs) {
        let hidden = new Float32Array(this.hiddenNodes);
        for(let j=0; j<this.hiddenNodes; j++) {
            let sum = 0;
            for(let i=0; i<this.inputNodes; i++) sum += inputs[i] * this.weightsIH[i * this.hiddenNodes + j];
            hidden[j] = Math.tanh(sum); 
        }
        let output = new Float32Array(this.outputNodes);
        // Softmax for Direction
        let sumExp = 0;
        for(let k=0; k<this.outputNodes; k++) {
            let sum = 0;
            for(let j=0; j<this.hiddenNodes; j++) sum += hidden[j] * this.weightsHO[j * this.outputNodes + k];
            output[k] = Math.exp(sum);
            sumExp += output[k];
        }
        for(let k=0; k<this.outputNodes; k++) output[k] /= sumExp;
        return output;
    }

    clone() {
        let nn = new NeuralNetwork(this.inputNodes, this.hiddenNodes, this.outputNodes);
        nn.weightsIH.set(this.weightsIH);
        nn.weightsHO.set(this.weightsHO);
        return nn;
    }

    mutate(rate) {
        for(let i=0; i<this.weightsIH.length; i++) if(Math.random()<rate) this.weightsIH[i] += (Math.random()*0.5-0.25);
        for(let i=0; i<this.weightsHO.length; i++) if(Math.random()<rate) this.weightsHO[i] += (Math.random()*0.5-0.25);
    }
}

// --- Game Logic ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Refs
const ui = {
    start: document.getElementById('start-screen'),
    over: document.getElementById('game-over-screen'),
    score: document.getElementById('score-display'),
    dashboard: document.getElementById('ai-dashboard'),
    settings: document.getElementById('settings-modal'),
    aiConfig: document.getElementById('ai-config-modal'),
    finalScore: document.getElementById('final-score'),
    bestScore: document.getElementById('best-score')
};

let gridSize = 20;
let tileCountX = 20;
let tileCountY = 20;

function resize() {
    let size = Math.min(window.innerWidth, window.innerHeight);
    if(size > 600) size = 600; // Max size
    
    // Ensure multiples of gridSize
    tileCountX = Math.floor((window.innerWidth > 600 ? 600 : window.innerWidth - 20) / gridSize);
    tileCountY = Math.floor((window.innerHeight > 800 ? 800 : window.innerHeight - 20) / gridSize);
    
    // Ensure minimum size
    if(tileCountX < 10) tileCountX = 10;
    if(tileCountY < 10) tileCountY = 10;
    
    canvas.width = tileCountX * gridSize;
    canvas.height = tileCountY * gridSize;
    
    // Show mobile controls if touch device
    if('ontouchstart' in window && window.innerWidth < 800) {
        document.getElementById('mobile-controls').style.display = 'flex';
    } else {
        document.getElementById('mobile-controls').style.display = 'none';
    }
}

window.addEventListener('resize', resize);
// Initial size setup
resize();

class Snake {
    constructor(brain = null) {
        this.pos = {x: Math.floor(tileCountX / 2), y: Math.floor(tileCountY / 2)};
        this.dir = {x: 1, y: 0}; // Moving right
        this.trail = [];
        this.tail = 4;
        this.score = 0;
        this.health = 200; // Steps before starvation
        this.fitness = 0;
        this.dead = false;
        
        // Inputs: 
        // 4 directions (Up, Down, Left, Right):
        //   - Dist to Wall
        //   - Dist to Food
        //   - Dist to Self
        // Total: 12 Inputs OR simpler:
        // Simple Vision: 
        // [Blocked Up, Blocked Down, Blocked Left, Blocked Right, Food Angle X, Food Angle Y] -> 6 Inputs
        // Outputs: [Up, Down, Left, Right] -> 4 Outputs
        this.brain = brain ? brain.clone() : new NeuralNetwork(6, 12, 4);
    }

    update(food) {
        if(this.dead) return;

        // AI Logic
        if(game.mode === 'ai') {
            this.think(food);
        }

        // Move
        this.pos.x += this.dir.x;
        this.pos.y += this.dir.y;
        this.health--;

        // Walls (Die)
        if(this.pos.x < 0 || this.pos.x >= tileCountX || this.pos.y < 0 || this.pos.y >= tileCountY) {
            this.die();
            return;
        }

        // Self Collision
        for(let t of this.trail) {
            if(t.x === this.pos.x && t.y === this.pos.y) {
                this.die();
                return;
            }
        }
        
        // Starvation
        if(game.mode === 'ai' && this.health <= 0) {
            this.die();
            return;
        }

        // Eat
        if(this.pos.x === food.x && this.pos.y === food.y) {
            this.tail++;
            this.score++;
            this.health += 100; // Refill health
            if(this.health > 500) this.health = 500;
            if(game.mode === 'normal') AudioSys.eat();
            food.respawn(this);
        }

        // Update Tail
        this.trail.push({x: this.pos.x, y: this.pos.y});
        while(this.trail.length > this.tail) {
            this.trail.shift();
        }
    }

    think(food) {
        let inputs = [];
        
        // 1. Is Blocked Up?
        inputs.push(this.isBlocked(0, -1) ? 1 : 0);
        // 2. Is Blocked Down?
        inputs.push(this.isBlocked(0, 1) ? 1 : 0);
        // 3. Is Blocked Left?
        inputs.push(this.isBlocked(-1, 0) ? 1 : 0);
        // 4. Is Blocked Right?
        inputs.push(this.isBlocked(1, 0) ? 1 : 0);
        
        // 5. Food Direction X (normalized)
        inputs.push(Math.sign(food.x - this.pos.x));
        // 6. Food Direction Y (normalized)
        inputs.push(Math.sign(food.y - this.pos.y));

        let output = this.brain.predict(inputs);
        
        // Argmax
        let maxI = 0;
        for(let i=1; i<output.length; i++) if(output[i] > output[maxI]) maxI = i;

        // 0:Up, 1:Down, 2:Left, 3:Right
        // Prevent 180 turns
        if(maxI === 0 && this.dir.y !== 1) this.dir = {x: 0, y: -1};
        else if(maxI === 1 && this.dir.y !== -1) this.dir = {x: 0, y: 1};
        else if(maxI === 2 && this.dir.x !== 1) this.dir = {x: -1, y: 0};
        else if(maxI === 3 && this.dir.x !== -1) this.dir = {x: 1, y: 0};
    }

    isBlocked(dx, dy) {
        let nx = this.pos.x + dx;
        let ny = this.pos.y + dy;
        // Wall
        if(nx < 0 || nx >= tileCountX || ny < 0 || ny >= tileCountY) return true;
        // Body
        for(let t of this.trail) if(t.x === nx && t.y === ny) return true;
        return false;
    }

    die() {
        this.dead = true;
        if(game.mode === 'normal') AudioSys.die();
        // Calculate Fitness for AI
        // Bonus for length, penalty for starvation vs wall?
        // Simple: Score * Score + lifetime
        this.fitness = (this.score * this.score * 10) + this.trail.length; 
    }

    draw(ctx, isBest) {
        if(this.dead && !isBest) return;

        let baseColor = isBest ? '#00ff88' : (game.mode === 'ai' ? 'rgba(255, 255, 255, 0.1)' : '#00ff88');
        let headColor = isBest ? '#fff' : (game.mode === 'ai' ? 'rgba(255, 255, 255, 0.3)' : '#fff');

        ctx.fillStyle = baseColor;
        for(let i=0; i<this.trail.length; i++) {
            let t = this.trail[i];
            // Scale slightly down for grid effect
            ctx.fillRect(t.x*gridSize + 1, t.y*gridSize + 1, gridSize - 2, gridSize - 2);
        }
        // Head
        ctx.fillStyle = headColor;
        ctx.fillRect(this.pos.x*gridSize + 1, this.pos.y*gridSize + 1, gridSize - 2, gridSize - 2);
    }
}

class Food {
    constructor() {
        this.x = 15;
        this.y = 15;
    }
    
    respawn(snake = null) {
        let attempts = 0;
        do {
            this.x = Math.floor(Math.random() * tileCountX);
            this.y = Math.floor(Math.random() * tileCountY);
            attempts++;
        } while(snake && this.isOnSnake(snake) && attempts < 100);
    }
    
    isOnSnake(snake) {
        if(snake.pos.x === this.x && snake.pos.y === this.y) return true;
        for(let t of snake.trail) {
            if(t.x === this.x && t.y === this.y) return true;
        }
        return false;
    }
    
    draw(ctx) {
        ctx.fillStyle = '#ff3333';
        if(CONFIG.graphics === 'HIGH') {
            ctx.shadowColor = '#ff3333';
            ctx.shadowBlur = 15;
        }
        ctx.fillRect(this.x*gridSize+2, this.y*gridSize+2, gridSize-4, gridSize-4);
        ctx.shadowBlur = 0;
    }
}

const game = {
    mode: 'normal',
    state: 'start',
    score: 0,
    highScore: parseInt(localStorage.getItem('snake_highscore') || '0', 10),
    snakes: [],
    food: null,
    generation: 0,
    bestAIScore: 0,
    tick: 0,
    frameId: null,

    start: function() {
        ui.start.style.display = 'none';
        ui.over.style.display = 'none';
        ui.score.style.display = 'block';
        AudioSys.init();
        
        this.resetGameData();
        this.state = 'playing';
        this.loop();
    },

    resetGameData: function() {
        this.food = new Food();
        this.score = 0;
        ui.score.innerText = '0';
        
        if (this.mode === 'normal') {
            this.snakes = [new Snake()];
            ui.dashboard.style.display = 'none';
        } else {
            ui.dashboard.style.display = 'block';
            if (this.generation === 0) this.createInitialPopulation();
        }
        
        // Respawn food after snakes are created
        if(this.snakes.length > 0) {
            this.food.respawn(this.snakes[0]);
        }
    },

    createInitialPopulation: function() {
        this.snakes = [];
        for(let i=0; i<CONFIG.popSize; i++) this.snakes.push(new Snake());
        this.generation = 1;
        this.updateDashboard();
    },

    evolve: function() {
        let bestSnake = this.snakes[0];
        let maxFit = 0;
        let sumFit = 0;
        
        for(let s of this.snakes) {
            if(s.score > this.bestAIScore) this.bestAIScore = s.score;
            if(s.fitness > maxFit) { maxFit = s.fitness; bestSnake = s; }
            sumFit += s.fitness;
        }

        let newSnakes = [];
        // Elitism
        for(let i=0; i<CONFIG.elitismCount; i++) {
            newSnakes.push(new Snake(bestSnake.brain));
        }

        // Selection
        while(newSnakes.length < CONFIG.popSize) {
            let parent = this.pickOne(this.snakes, sumFit);
            let child = new Snake(parent.brain);
            child.brain.mutate(CONFIG.mutationRate);
            newSnakes.push(child);
        }

        this.snakes = newSnakes;
        this.generation++;
        this.resetGameData();
    },

    pickOne: function(list, sum) {
        if(sum <= 0) return list[0]; // Safety check
        let r = Math.random() * sum;
        for(let i=0; i<list.length; i++) {
            r -= list[i].fitness;
            if(r <= 0) return list[i];
        }
        return list[0];
    },

    updateDashboard: function() {
        if(this.mode !== 'ai') return;
        let alive = this.snakes.filter(s => !s.dead).length;
        document.getElementById('dash-gen').innerText = this.generation;
        document.getElementById('dash-alive').innerText = alive + '/' + CONFIG.popSize;
        document.getElementById('dash-best').innerText = this.bestAIScore;
        
        let curr = 0;
        this.snakes.forEach(s => { if(s.score > curr) curr = s.score; });
        document.getElementById('dash-curr').innerText = curr;
    },

    reset: function() {
        ui.over.style.display = 'none';
        this.start();
    },

    endGame: function() {
        this.state = 'start';
        if(this.frameId) cancelAnimationFrame(this.frameId);
        ui.dashboard.style.display = 'none';
        ui.score.style.display = 'none';
        ui.over.style.display = 'none';
        ui.start.style.display = 'block';
        this.generation = 0;
        this.bestAIScore = 0;
    },

    gameOver: function() {
        if(this.mode === 'normal') {
            this.state = 'gameover';
            if(this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('snake_highscore', this.highScore.toString());
            }
            ui.finalScore.innerText = this.score;
            ui.bestScore.innerText = this.highScore;
            setTimeout(() => {
                ui.score.style.display = 'none';
                ui.over.style.display = 'block';
            }, 500);
        } else {
            // All AI died, next gen
            this.evolve();
        }
    },

    loop: function() {
        if(this.state !== 'playing') return;

        // Logic Speed Control
        let speed = (this.mode === 'ai') ? CONFIG.speedMultiplier : 1;
        // Human speed is limited
        let ticksPerFrame = (this.mode === 'normal') ? 1 : speed;
        
        // Human Game Loop Limiter (Snake moves slower than 60fps)
        this.tick++;
        if(this.mode === 'normal') {
            if(this.tick % 5 !== 0) { // Move every 5 frames
                this.frameId = requestAnimationFrame(() => this.loop());
                return;
            }
        }

        // Update Loop
        for(let k=0; k<ticksPerFrame; k++) {
            let allDead = true;
            for(let s of this.snakes) {
                s.update(this.food);
                if(!s.dead) allDead = false;
            }
            
            if(allDead) {
                this.gameOver();
                if(this.mode === 'ai') {
                     // Don't draw, just restart loop immediately for speed
                     this.frameId = requestAnimationFrame(() => this.loop());
                     return;
                }
            }
        }
        
        // Render
        // Grid Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0,0,canvas.width, canvas.height);
        
        if(CONFIG.graphics === 'HIGH') {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            for(let x=0; x<=canvas.width; x+=gridSize) { 
                ctx.beginPath(); 
                ctx.moveTo(x,0); 
                ctx.lineTo(x,canvas.height); 
                ctx.stroke(); 
            }
            for(let y=0; y<=canvas.height; y+=gridSize) { 
                ctx.beginPath(); 
                ctx.moveTo(0,y); 
                ctx.lineTo(canvas.width,y); 
                ctx.stroke(); 
            }
        }

        this.food.draw(ctx);
        
        // Find leader to draw on top
        let leader = this.snakes[0];
        let maxS = -1;
        for(let s of this.snakes) {
            if(!s.dead && s.score > maxS) { maxS = s.score; leader = s; }
            // Draw non-leaders faintly
            if(game.mode === 'ai' && !s.dead) s.draw(ctx, false);
        }
        
        // Draw leader or human
        if(leader && !leader.dead) {
             leader.draw(ctx, true);
             if(game.mode === 'ai') ui.score.innerText = leader.score;
        } else if(game.mode === 'normal' && this.snakes[0] && !this.snakes[0].dead) {
            this.snakes[0].draw(ctx, true);
            ui.score.innerText = this.snakes[0].score;
        }

        if(this.mode === 'ai') this.updateDashboard();

        this.frameId = requestAnimationFrame(() => this.loop());
    }
};

// --- Controls ---
function handleInput(key) {
    if(game.mode !== 'normal' || game.state !== 'playing') return;
    let snake = game.snakes[0];
    if(!snake || snake.dead) return;
    
    if(key === 'ArrowUp' && snake.dir.y !== 1) snake.dir = {x: 0, y: -1};
    else if(key === 'ArrowDown' && snake.dir.y !== -1) snake.dir = {x: 0, y: 1};
    else if(key === 'ArrowLeft' && snake.dir.x !== 1) snake.dir = {x: -1, y: 0};
    else if(key === 'ArrowRight' && snake.dir.x !== -1) snake.dir = {x: 1, y: 0};
}

// Virtual Keys for Mobile
window.handleMobileInput = function(dir) {
    if(dir === 'up') handleInput('ArrowUp');
    if(dir === 'down') handleInput('ArrowDown');
    if(dir === 'left') handleInput('ArrowLeft');
    if(dir === 'right') handleInput('ArrowRight');
};

window.addEventListener('keydown', e => handleInput(e.code));

// UI Helpers
function startGame(mode) { 
    game.mode = mode; 
    game.start(); 
}

function showMainMenu() { 
    ui.start.style.display = 'block'; 
    ui.over.style.display = 'none'; 
    ui.score.style.display = 'none'; 
}

function updateSpeed(val) { 
    CONFIG.speedMultiplier = parseInt(val, 10); 
    document.getElementById('speed-val').innerText = val + 'x'; 
}

function showSettings() { 
    ui.settings.style.display = 'block'; 
    ui.start.style.display = 'none'; 
}

function closeSettings() { 
    ui.settings.style.display = 'none'; 
    ui.start.style.display = 'block'; 
}

function showAiConfig() { 
    ui.aiConfig.style.display = 'block'; 
}

function closeAiConfig() { 
    ui.aiConfig.style.display = 'none'; 
}

function toggleGraphics() { 
    CONFIG.graphics = CONFIG.graphics === 'HIGH' ? 'LOW' : 'HIGH';
    document.getElementById('gfx-btn').innerText = 'Graphics: ' + CONFIG.graphics;
}

function saveAiSettings() {
    let pop = parseInt(document.getElementById('cfg-pop').value, 10);
    let mut = parseFloat(document.getElementById('cfg-mut').value);
    
    CONFIG.popSize = Math.max(50, Math.min(1000, pop));
    CONFIG.mutationRate = Math.max(0.01, Math.min(0.5, mut));
    
    closeAiConfig();
    game.generation = 0; 
    game.bestAIScore = 0; 
    game.resetGameData();
}

// Draggable Dashboard
(function() {
    const d = document.getElementById('ai-dashboard');
    let isD = false, sx, sy, il, it;
    
    d.addEventListener('mousedown', e => {
        if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;
        isD=true; sx=e.clientX; sy=e.clientY;
        let st = window.getComputedStyle(d); il=parseInt(st.left, 10); it=parseInt(st.top, 10);
        d.style.cursor='grabbing';
    });
    
    window.addEventListener('mousemove', e => {
        if(!isD)return; e.preventDefault();
        d.style.left = (il + e.clientX - sx) + 'px';
        d.style.top = (it + e.clientY - sy) + 'px';
    });
    
    window.addEventListener('mouseup', () => { isD=false; d.style.cursor='move'; });
    
    // Touch support for drag
    d.addEventListener('touchstart', e => {
         if(e.target.tagName==='INPUT'||e.target.tagName==='BUTTON')return;
         isD=true; sx=e.touches[0].clientX; sy=e.touches[0].clientY;
         let st = window.getComputedStyle(d); il=parseInt(st.left, 10); it=parseInt(st.top, 10);
    });
    
    window.addEventListener('touchmove', e => {
         if(!isD)return; e.preventDefault();
         d.style.left = (il + e.touches[0].clientX - sx) + 'px';
         d.style.top = (it + e.touches[0].clientY - sy) + 'px';
    });
    
    window.addEventListener('touchend', () => isD=false);
})();

