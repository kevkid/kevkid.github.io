// main.js

import *:// main.js

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

// --- Core THREE components ---
let scene, camera, renderer, controls;
let controller1, controller2;
let raycaster;
let loadingManager;
let audioListener, shootSoundBuffer, playerHitSoundBuffer, enemyHitSoundBuffer, enemyShootSoundBuffer, explosionSoundBuffer; // Added explosionSoundBuffer
let clock;
let xrSession = null;

// --- Game State ---
// NEW Game States
const GAME_STATE = {
    LOADING: 'loading',
    AWAITING_START: 'awaiting_start', // New state for before game starts
    PLAYING: 'playing',
    PAUSED: 'paused',
    INTERMISSION: 'intermission',
    GAME_OVER: 'game_over'
};
let currentGameState = GAME_STATE.LOADING;

// let isPaused = false; // Replaced by currentGameState
// let isGameOver = false; // Replaced by currentGameState
let score = 0;
let playerHealth = 100;
const MAX_PLAYER_HEALTH = 100;
let activeHand = 'right';
let currentGunIndex = 0;
let activeGunObject = null;
const gameDuration = 180; // Example duration, might not be used if round-based is primary
let gameTimeRemaining = gameDuration; // Can be repurposed or removed if pure round based
let currentRound = 0;
let enemiesRemainingInRound = 0;
// let isIntermission = false; // Replaced by currentGameState
const intermissionDuration = 5.0;
let timeUntilNextRound = 0;
let spawnMode = 'spread'; // 'spread' or 'frontal'

// --- Debug/Pause State ---
let debugModeActive = false;
const ROTATION_INCREMENT = THREE.MathUtils.degToRad(5);
const POSITION_INCREMENT = 0.005; // For debug position adjustment
const SCALE_INCREMENT = 0.001;
let selectedPauseMenuItem = 'logOffsets';
// --- UPDATED Debug Menu Items (Properties to adjust) ---
const DEBUG_MENU_ITEMS = [
    'posX', 'posY', 'posZ',
    'rotX', 'rotY', 'rotZ',
    'scale',
    'exitDebug'
];
let selectedDebugItem = DEBUG_MENU_ITEMS[0];

// --- UI Elements ---
const scoreDisplay = document.getElementById('score');
const gunDisplay = document.getElementById('current-gun');
const pauseMenu = document.getElementById('pause-menu'); // Might be redundant with wrist UI
const loadingScreen = document.getElementById('loading-screen');
const playerHitOverlay = document.getElementById('player-hit-overlay');

// Wrist UI
let wristUiGroup, wristUiCanvas, wristUiContext, wristUiTexture, wristUiMaterial, wristUiPlane;
const WRIST_UI_WIDTH = 384; const WRIST_UI_HEIGHT = 320; const WRIST_UI_ASPECT = WRIST_UI_WIDTH / WRIST_UI_HEIGHT;
const WRIST_UI_PLANE_HEIGHT = 0.10; const WRIST_UI_PLANE_WIDTH = WRIST_UI_PLANE_HEIGHT * WRIST_UI_ASPECT;

// --- Enemy Definitions ---
// UPDATED: Added geometry type
const ENEMY_TYPES = {
    'grunt': { health: 30, points: 10, color: 0x00ff00, size: 0.15, speedFactor: 0.8, shootIntervalFactor: 1.2, projectileSpeed: 4.0, name: 'Grunt', geometryType: 'box' },
    'shooter': { health: 50, points: 20, color: 0xffff00, size: 0.18, speedFactor: 1.0, shootIntervalFactor: 1.0, projectileSpeed: 5.0, name: 'Shooter', geometryType: 'cylinder' },
    'brute': { health: 100, points: 30, color: 0xff0000, size: 0.22, speedFactor: 0.6, shootIntervalFactor: 1.5, projectileSpeed: 6.0, name: 'Brute', geometryType: 'icosahedron' }
};
const enemies = []; const MAX_ENEMIES_ON_SCREEN = 20;

// --- Gun Configuration ---
// !! Copy logged offsets here after tuning !!
const guns = [
    { name: 'Pistol', modelPath: 'assets/models/pistol/pistol', scale: 0.035, damage: 15, positionOffset: new THREE.Vector3(0, -0.01, -0.05), rotationOffset: new THREE.Euler(0, 0, 0, 'XYZ'), model: null },
    { name: 'Shotgun', modelPath: 'assets/models/shotgun/shotgun', scale: 0.035, damage: 40, positionOffset: new THREE.Vector3(0, -0.02, -0.08), rotationOffset: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'), model: null },
    { name: 'Rifle', modelPath: 'assets/models/rifle/rifle', scale: 0.035, damage: 25, positionOffset: new THREE.Vector3(0, -0.02, -0.1), rotationOffset: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'), model: null }
];

// Projectile Config
const projectiles = []; const PROJECTILE_SPEED = 5.0; const PROJECTILE_RADIUS = 0.05; const PLAYER_HIT_RADIUS = 0.25; const PROJECTILE_MAX_DIST = 50.0; const ENEMY_SHOOT_OFFSET = 0.2;

// Target Config (Movement bounds etc)
const TARGET_AREA_RADIUS = 7; const TARGET_AREA_HEIGHT = 4; const TARGET_BOUNDS = { x: TARGET_AREA_RADIUS, yMin: 0.2, yMax: TARGET_AREA_HEIGHT, zMin: -TARGET_AREA_RADIUS, zMax: -2 }; const TARGET_BASE_SPEED = 0.08; const TARGET_MIN_SHOOT_INTERVAL = 4.0; const TARGET_MAX_SHOOT_INTERVAL = 8.0;

// --- Cover ---
const coverObjects = [];
const COVER_HEALTH_MAX = 50;

// --- Explosions ---
const explosions = [];
const EXPLOSION_PARTICLE_COUNT = 30;
const EXPLOSION_DURATION = 0.7;
const EXPLOSION_PARTICLE_SPEED = 2.0;
const EXPLOSION_PARTICLE_SIZE = 0.03;

// --- Helper Functions ---
function getGunController() { return activeHand === 'right' ? controller1 : controller2; }
function getUiController() { return activeHand === 'right' ? controller2 : controller1; }
function radToDeg(rad) { return THREE.MathUtils.radToDeg(rad).toFixed(1); }
function formatTime(seconds) { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs < 10 ? '0' : ''}${secs}`; }

// --- Initialization ---
function startExperience() {
    loadingScreen.style.display = 'none';
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 1); // Player start position slightly behind origin

    audioListener = new THREE.AudioListener();
    camera.add(audioListener);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    const vrButton = VRButton.createButton(renderer);
    vrButton.addEventListener('sessionstart', () => {
        xrSession = renderer.xr.getSession();
        console.log("XR Session Started:", xrSession);
        resetGameState(false); // Reset state but don't start timer/round yet
        currentGameState = GAME_STATE.AWAITING_START; // Set state to wait for start
        updateWristUiDisplay(); // Show the "Press Trigger to Start" message
    });
    vrButton.addEventListener('sessionend', () => {
        xrSession = null;
        console.log("XR Session Ended");
        resetGameState(false);
        currentGameState = GAME_STATE.LOADING; // Or some other non-playing state
    });
    document.body.appendChild(vrButton);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Floor
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Raycaster
    raycaster = new THREE.Raycaster();

    // Controllers
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('selectstart', onSelectStart);
    controller1.addEventListener('squeezestart', onSqueezeStart);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('selectstart', onSelectStart);
    controller2.addEventListener('squeezestart', onSqueezeStart);
    scene.add(controller2);

    // Wrist UI
    createWristUi();

    // Cover Objects
    createCoverObjects();

    // Initial Setup (without starting game logic yet)
    resetGameState(false); // Reset vars, don't start clock
    updateGunModel(getGunController());
    attachWristUi(getUiController());
    updateGunDisplay();

    window.addEventListener('resize', onWindowResize, false);
    renderer.setAnimationLoop(render);
}

// --- Reset Game State ---
function resetGameState(startTimerAndRound = false) {
    console.log("Resetting Game State");
    score = 0;
    playerHealth = MAX_PLAYER_HEALTH;
    gameTimeRemaining = gameDuration; // Reset timer if used
    currentRound = 0;
    enemiesRemainingInRound = 0;
    // isGameOver = false; // Handled by currentGameState
    // isPaused = false; // Handled by currentGameState
    // isIntermission = false; // Handled by currentGameState
    timeUntilNextRound = 0;
    debugModeActive = false;
    selectedPauseMenuItem = 'logOffsets'; // Reset pause menu selection

    cleanupAllEnemies();
    cleanupAllProjectiles();
    cleanupAllExplosions(); // Clean up any lingering explosion particles
    resetCoverObjects(); // Reset health of breakable cover

    updateScoreDisplay(); // Updates HTML and Wrist UI

    if (startTimerAndRound) {
        if (!clock) clock = new THREE.Clock();
        if (!clock.running) clock.start();
        currentGameState = GAME_STATE.PLAYING; // Set state to playing
        startNextRound(); // Start the first round
    } else {
        if (clock && clock.running) clock.stop();
        // Don't change game state here, it's handled by the caller (e.g., session start sets AWAITING_START)
    }
}

// --- Loading ---
function loadAssets() {
    currentGameState = GAME_STATE.LOADING;
    loadingManager = new THREE.LoadingManager();
    const objLoader = new OBJLoader(loadingManager);
    const mtlLoader = new MTLLoader(loadingManager);
    const audioLoader = new THREE.AudioLoader(loadingManager);

    let assetsToLoad = guns.length + 4; // Guns + 4 sounds
    let assetsLoadedCount = 0;

    loadingManager.onLoad = () => {
        console.log('Loading complete!');
        startExperience(); // Setup scene etc., but don't start game logic yet
    };
    loadingManager.onError = (url) => {
        console.error(`Error loading ${url}`);
        loadingScreen.textContent = `Error loading ${url}. Check paths & console.`;
    };
    loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
        console.log(`Loading: ${url}`);
        assetsLoadedCount++;
        // Use a fixed total count for better progress display
        loadingScreen.textContent = `Loading ${assetsLoadedCount}/${assetsToLoad}...`;
    };

    // Load Sounds
    audioLoader.load('assets/sounds/shoot.mp3', (buffer) => { shootSoundBuffer = buffer; console.log("Shoot Sound loaded"); }, undefined, (err) => { console.error("Shoot Sound load failed", err); });
    audioLoader.load('assets/sounds/player_hit.mp3', (buffer) => { playerHitSoundBuffer = buffer; console.log("Player Hit Sound loaded"); }, undefined, (err) => { console.error("Player Hit Sound load failed", err); }); // Assuming you have this sound
    audioLoader.load('assets/sounds/enemy_hit.mp3', (buffer) => { enemyHitSoundBuffer = buffer; console.log("Enemy Hit Sound loaded"); }, undefined, (err) => { console.error("Enemy Hit Sound load failed", err); }); // Assuming you have this sound
    audioLoader.load('assets/sounds/enemy_shoot.mp3', (buffer) => { enemyShootSoundBuffer = buffer; console.log("Enemy Shoot Sound loaded"); }, undefined, (err) => { console.error("Enemy Shoot Sound load failed", err); }); // Assuming you have this sound
    audioLoader.load('assets/sounds/explosion.mp3', (buffer) => { explosionSoundBuffer = buffer; console.log("Explosion Sound loaded"); }, undefined, (err) => { console.error("Explosion Sound load failed", err); }); // Load explosion sound

    // Load Gun Models (Identical logic)
    guns.forEach(gun => { /* ... (Identical gun loading logic) ... */ const mtlPath = gun.modelPath + '.mtl'; const objPath = gun.modelPath + '.obj'; const basePath = gun.modelPath.substring(0, gun.modelPath.lastIndexOf('/') + 1); mtlLoader.setPath(basePath); mtlLoader.load(mtlPath.split('/').pop(), (materials) => { materials.preload(); objLoader.setMaterials(materials); objLoader.setPath(basePath); objLoader.load(objPath.split('/').pop(), (object) => { gun.model = object; console.log(`${gun.name} loaded.`); }, undefined, (err) => { console.error(`OBJ load error for ${gun.name} (after MTL success):`, err); handleLoadError(gun); }); }, undefined, (error) => { console.warn(`MTL load failed for ${gun.name}: ${error}. Trying OBJ only.`); objLoader.setPath(basePath); objLoader.load(objPath.split('/').pop(), (object) => { gun.model = object; console.log(`${gun.name} loaded (no MTL).`); }, undefined, (objError) => { console.error(`OBJ load failed for ${gun.name} too: ${objError}`); handleLoadError(gun); }); }); }); function handleLoadError(gun) { console.log(`Using fallback for ${gun.name}`); gun.model = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), new THREE.MeshStandardMaterial({ color: 0xcccccc })); }
}

// --- Input Handling ---
function onSelectStart(event) { // Trigger
    const controller = event.target;

    switch (currentGameState) {
        case GAME_STATE.AWAITING_START:
            if (controller === getUiController()) { // Use UI hand trigger to start
                console.log("Starting game from AWAITING_START state");
                resetGameState(true); // This will set state to PLAYING and start round 1
            }
            break;
        case GAME_STATE.PLAYING:
        case GAME_STATE.INTERMISSION: // Allow shooting/switching during intermission? Maybe not.
             if (controller === getGunController()) {
                 shoot(controller);
             } else if (controller === getUiController()) {
                 switchHands();
             }
            break;
        case GAME_STATE.PAUSED:
            handlePauseMenuInput(controller, 'trigger');
            break;
        case GAME_STATE.GAME_OVER:
            handleGameOverInput(controller, 'trigger');
            break;
    }
}

function onSqueezeStart(event) { // Squeeze
    const controller = event.target;

     switch (currentGameState) {
        case GAME_STATE.AWAITING_START:
            // No action on squeeze while waiting to start
            break;
        case GAME_STATE.PLAYING:
        case GAME_STATE.INTERMISSION:
             if (controller === getGunController()) {
                 cycleGun(controller);
             } else if (controller === getUiController()) {
                 togglePause();
             }
            break;
        case GAME_STATE.PAUSED:
            handlePauseMenuInput(controller, 'squeeze');
            break;
        case GAME_STATE.GAME_OVER:
            handleGameOverInput(controller, 'squeeze');
            break;
    }
}

// --- Game Over Input ---
function handleGameOverInput(controller, buttonType) {
    // Currently, only implementing restart via UI Trigger
    if (controller === getUiController() && buttonType === 'trigger') {
        console.log("Restarting game from Game Over screen.");
        restartGame();
    }
}


// --- Pause Menu Input Logic (REVISED Debug Controls) ---
function handlePauseMenuInput(controller, buttonType) {
    if (currentGameState !== GAME_STATE.PAUSED) return;

    // --- Resume ---
    if (controller === getUiController() && buttonType === 'squeeze') {
        togglePause(); // Resume game
        return;
    }

    const gunData = guns[currentGunIndex];
    const uiController = getUiController();
    const gunController = getGunController();

    // --- Input handling when GUN ADJUSTMENT (DEBUG) UI is ACTIVE ---
    if (debugModeActive) {
        let currentIndex = DEBUG_MENU_ITEMS.indexOf(selectedDebugItem);

        if (controller === gunController) { // Use GUN controller to CYCLE through debug PROPERTIES
            if (buttonType === 'trigger') { // Cycle Down
                currentIndex = (currentIndex + 1) % DEBUG_MENU_ITEMS.length;
            } else if (buttonType === 'squeeze') { // Cycle Up
                currentIndex = (currentIndex - 1 + DEBUG_MENU_ITEMS.length) % DEBUG_MENU_ITEMS.length;
            }
            selectedDebugItem = DEBUG_MENU_ITEMS[currentIndex];
            console.log("Selected debug item:", selectedDebugItem);

        } else if (controller === uiController) { // Use UI controller to ADJUST VALUE of selected property
            console.log("Adjusting debug item:", selectedDebugItem, "with button:", buttonType);
            let currentScale = activeGunObject.scale.x;
            const adjustmentSign = (buttonType === 'trigger') ? 1 : -1; // Trigger increases, Squeeze decreases

            switch (selectedDebugItem) {
                case 'posX':
                    activeGunObject.position.x += POSITION_INCREMENT * adjustmentSign;
                    gunData.positionOffset.x = activeGunObject.position.x;
                    break;
                case 'posY':
                    activeGunObject.position.y += POSITION_INCREMENT * adjustmentSign;
                    gunData.positionOffset.y = activeGunObject.position.y;
                    break;
                case 'posZ':
                    activeGunObject.position.z += POSITION_INCREMENT * adjustmentSign;
                    gunData.positionOffset.z = activeGunObject.position.z;
                    break;
                case 'rotX':
                    activeGunObject.rotation.x += ROTATION_INCREMENT * adjustmentSign;
                    gunData.rotationOffset.x = activeGunObject.rotation.x;
                    break;
                case 'rotY':
                    activeGunObject.rotation.y += ROTATION_INCREMENT * adjustmentSign;
                    gunData.rotationOffset.y = activeGunObject.rotation.y;
                    break;
                case 'rotZ':
                    activeGunObject.rotation.z += ROTATION_INCREMENT * adjustmentSign;
                    gunData.rotationOffset.z = activeGunObject.rotation.z;
                    break;
                case 'scale':
                    currentScale += SCALE_INCREMENT * adjustmentSign;
                    currentScale = Math.max(0.001, currentScale); // Prevent negative scale
                    activeGunObject.scale.set(currentScale, currentScale, currentScale);
                    gunData.scale = currentScale;
                    break;
                case 'exitDebug':
                    if (buttonType === 'trigger') { // Only exit on trigger
                         debugModeActive = false;
                         selectedPauseMenuItem = 'logOffsets'; // Go back to main pause menu selection
                         console.log("Exiting Debug Tools");
                    }
                    break;
            }
        }
        updateWristUiDisplay(); // Update UI after any action
        return; // Exit handler after processing debug input
    }

    // --- Input handling for MAIN PAUSE MENU ---
    if (!debugModeActive) {
        // Added 'spawnModeToggle'
        const menuItems = ['logOffsets', 'debug', 'spawnModeToggle', 'restart', 'quit'];
        let currentIndex = menuItems.indexOf(selectedPauseMenuItem);

        if (controller === gunController) { // Cycle main menu items with Gun Trig/Squeeze
             if (buttonType === 'trigger') { currentIndex = (currentIndex + 1) % menuItems.length; }
             else if (buttonType === 'squeeze') { currentIndex = (currentIndex - 1 + menuItems.length) % menuItems.length; }
             selectedPauseMenuItem = menuItems[currentIndex];
             console.log("Selected pause menu item:", selectedPauseMenuItem);

        } else if (controller === uiController && buttonType === 'trigger') { // Select main menu item with UI Trigger
            console.log("Activating pause menu item:", selectedPauseMenuItem);
            if (selectedPauseMenuItem === 'logOffsets') { logCurrentGunOffsets(); }
            else if (selectedPauseMenuItem === 'debug') {
                debugModeActive = true;
                selectedDebugItem = DEBUG_MENU_ITEMS[0]; // Select first debug property
                console.log("Entering Debug Tools");
            }
            else if (selectedPauseMenuItem === 'spawnModeToggle') {
                spawnMode = (spawnMode === 'spread') ? 'frontal' : 'spread';
                console.log("Toggled spawn mode to:", spawnMode);
            }
            else if (selectedPauseMenuItem === 'restart') { restartGame(); return; } // Return because restart changes state
            else if (selectedPauseMenuItem === 'quit') { quitSession(); }
        }
        updateWristUiDisplay(); // Update UI after action
    }
}


// --- Game Actions ---
function startGame() {
    if (currentGameState === GAME_STATE.AWAITING_START) {
        console.log("Starting game...");
        resetGameState(true); // Resets state, starts timer, starts round 1
    }
}

function restartGame() {
    console.log("Restarting game...");
    // Cleanup is handled by resetGameState
    resetGameState(true); // Reset state, start timer, start round 1
    // No need to update wrist UI here, resetGameState calls updateScoreDisplay which calls updateWristUiDisplay
}

function quitSession() { /* ... (Identical) ... */ console.log("Attempting to quit XR session..."); if (xrSession && xrSession.end) { xrSession.end().then(() => { console.log("XR Session ended via quit button."); currentGameState = GAME_STATE.LOADING; // Or similar non-active state }).catch(err => { console.error("Failed to end XR session:", err); }); } else { console.warn("No active XR session or session.end not supported."); if (currentGameState === GAME_STATE.PAUSED) togglePause(); } }
function logCurrentGunOffsets() { /* ... (Identical - but ensure activeGunObject exists) ... */ if (!activeGunObject) { console.warn("Cannot log offsets: No active gun object."); return; } const gunData = guns[currentGunIndex]; const currentScale = activeGunObject.scale.x; const currentPos = activeGunObject.position; // Use actual object position in debug
    const currentRot = activeGunObject.rotation; console.log(`\n--- Offsets for: ${gunData.name} ---`); console.log(`// Copy these values back into the 'guns' array definition`); console.log(`scale: ${currentScale.toFixed(4)},`); console.log(`positionOffset: new THREE.Vector3(${currentPos.x.toFixed(4)}, ${currentPos.y.toFixed(4)}, ${currentPos.z.toFixed(4)}),`); console.log(`rotationOffset: new THREE.Euler(${currentRot.x.toFixed(4)}, ${currentRot.y.toFixed(4)}, ${currentRot.z.toFixed(4)}, 'XYZ'),`); console.log(`--------------------------------------\n`); }

// --- Player Hit Logic ---
function playerHit() {
    if (currentGameState !== GAME_STATE.PLAYING || currentGameState === GAME_STATE.INTERMISSION) return; // Don't take damage if not actively playing

    console.log("Player Hit!");
    playerHealth = Math.max(0, playerHealth - 10); // Example damage
    updateScoreDisplay(); // Update UI

    if (playerHealth <= 0) {
        currentGameState = GAME_STATE.GAME_OVER;
        console.log("Game Over - Player health depleted!");
        if (clock && clock.running) clock.stop();
        updateWristUiDisplay(); // Show Game Over screen
    }

    // Visual Feedback (Identical)
    if (playerHitOverlay) { /* ... (Identical overlay flash) ... */ playerHitOverlay.style.display = 'block'; playerHitOverlay.style.opacity = '1'; setTimeout(() => { if (playerHitOverlay) playerHitOverlay.style.opacity = '0'; }, 100); }
    // Sound Feedback (Identical)
    if (playerHitSoundBuffer && audioListener) { /* ... (Identical sound playback) ... */ const sound = new THREE.Audio(audioListener); sound.setBuffer(playerHitSoundBuffer); sound.setVolume(0.7); sound.play(); }
}

// --- Hand Switching Logic --- (Identical)
function switchHands() {
    if (currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GAME_OVER) return;
    console.log("Switching hands");
    // ... (rest of the identical logic)
    const oldGunController = getGunController(); const oldUiController = getUiController(); if (activeGunObject && activeGunObject.parent === oldGunController) { oldGunController.remove(activeGunObject); } if (wristUiGroup && wristUiGroup.parent === oldUiController) { oldUiController.remove(wristUiGroup); } activeHand = (activeHand === 'right') ? 'left' : 'right'; const newGunController = getGunController(); const newUiController = getUiController(); if (activeGunObject) { newGunController.add(activeGunObject); } if (wristUiGroup) { attachWristUi(newUiController); } updateGunDisplay();
}

// --- Pause Logic ---
function togglePause() {
    if (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.INTERMISSION) {
        currentGameState = GAME_STATE.PAUSED;
        // pauseMenu.style.display = 'block'; // Redundant?
        debugModeActive = false; // Reset debug mode on pause
        selectedPauseMenuItem = 'logOffsets'; // Reset menu selection
        updateWristUiDisplay();
        if (clock && clock.running) clock.stop(); // Pause the clock
        console.log("Game Paused.");
    } else if (currentGameState === GAME_STATE.PAUSED) {
        // Determine previous state to return to (Playing or Intermission)
        currentGameState = (timeUntilNextRound > 0) ? GAME_STATE.INTERMISSION : GAME_STATE.PLAYING;
        // pauseMenu.style.display = 'none'; // Redundant?
        debugModeActive = false; // Ensure debug is off when resuming
        updateWristUiDisplay();
        if (clock && !clock.running) clock.start(); // Resume the clock
        console.log("Game Resumed.");
    }
}

// --- Gun Logic ---
function cycleGun(controller) {
    if (!activeGunObject || currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GAME_OVER) return;
    currentGunIndex = (currentGunIndex + 1) % guns.length;
    console.log("Switched to:", guns[currentGunIndex].name);
    updateGunModel(controller);
    updateGunDisplay();
}
function updateGunModel(controller) { /* ... (Identical logic, but ensure it works when paused for debug) ... */ if (activeGunObject && activeGunObject.parent) { activeGunObject.parent.remove(activeGunObject); activeGunObject.traverse(child => { if (child.isMesh) { child.geometry?.dispose(); if (Array.isArray(child.material)) { child.material.forEach(m => m.dispose()); } else { child.material?.dispose(); } } }); activeGunObject = null; } const gunData = guns[currentGunIndex]; if (!gunData.model) { console.error(`Model for ${gunData.name} not loaded! Using fallback.`); activeGunObject = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.15), new THREE.MeshStandardMaterial({color:0xff0000})); activeGunObject.position.copy(gunData.positionOffset); activeGunObject.rotation.copy(gunData.rotationOffset); activeGunObject.scale.set(gunData.scale, gunData.scale, gunData.scale); } else { activeGunObject = gunData.model.clone(); activeGunObject.scale.set(gunData.scale, gunData.scale, gunData.scale); activeGunObject.position.copy(gunData.positionOffset); activeGunObject.rotation.copy(gunData.rotationOffset); } controller.add(activeGunObject); if (currentGameState === GAME_STATE.PAUSED) { updateWristUiDisplay(); } } // Update UI if paused
function updateGunDisplay() { gunDisplay.textContent = `Gun: ${guns[currentGunIndex].name} (${activeHand})`; }

// --- Shooting Logic (Player -> Enemy) ---
function shoot(controller) {
    if (!activeGunObject || activeGunObject.parent !== controller || currentGameState !== GAME_STATE.PLAYING) return; // Only shoot when playing

    const gunData = guns[currentGunIndex];
    const tempMatrix = new THREE.Matrix4();
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();

    // Check intersections with enemies
    const intersects = raycaster.intersectObjects(enemies, true); // Check enemy array

    if (intersects.length > 0) {
        let hitObject = intersects[0].object;
        // Traverse up to find the enemy root group
        while (hitObject.parent && !hitObject.userData.isEnemyRoot) {
            hitObject = hitObject.parent;
        }

        if (hitObject.userData.isEnemyRoot && enemies.includes(hitObject)) {
            const enemy = hitObject;
            const damage = gunData.damage || 10; // Use gun's damage
            enemy.userData.currentHealth -= damage;
            console.log(`Hit ${enemy.userData.type.name}! Health: ${enemy.userData.currentHealth}/${enemy.userData.type.health}`);

            // --- Enemy Hit Flash (Identical) ---
            const originalColor = enemy.userData.originalColor || enemy.userData.type.color;
            enemy.traverse((child) => { if (child.isMesh && child.material) { child.userData.originalColor = child.material.color.getHex(); child.material.color.set(0xffffff); child.material.needsUpdate = true; } });
            setTimeout(() => { enemy.traverse((child) => { if (child.isMesh && child.material && child.userData.originalColor !== undefined) { child.material.color.setHex(child.userData.originalColor); child.material.needsUpdate = true; delete child.userData.originalColor; } }); }, 100);

            // --- Enemy Hit Sound (Identical) ---
            if (enemyHitSoundBuffer && audioListener) { /* ... (Identical sound playback) ... */ const sound = new THREE.PositionalAudio(audioListener); sound.setBuffer(enemyHitSoundBuffer); sound.setRefDistance(8); sound.setVolume(0.5); enemy.add(sound); sound.play(); sound.onEnded = () => { if (sound.parent === enemy) enemy.remove(sound); sound.disconnect(); }; }

            // --- Enemy Defeated ---
            if (enemy.userData.currentHealth <= 0) {
                console.log(`${enemy.userData.type.name} defeated!`);
                score += enemy.userData.type.points;
                enemiesRemainingInRound--;
                updateScoreDisplay();

                // *** Create Explosion ***
                createExplosion(enemy.position, enemy.userData.type.color);

                // Remove enemy from array and scene
                const index = enemies.indexOf(enemy);
                if (index > -1) enemies.splice(index, 1);
                cleanupEnemy(enemy); // Dispose geometry/material

                // Check if round ended
                if (enemiesRemainingInRound <= 0 && currentGameState === GAME_STATE.PLAYING) {
                    startIntermission();
                }
            }
        } else {
            console.log("Raycast hit something, but not a recognized enemy root.");
        }
    } else {
        console.log("Miss!");
    }

    // --- Shoot Sound (Identical) ---
    if (shootSoundBuffer && audioListener && activeGunObject) { /* ... (Identical sound playback) ... */ const sound = new THREE.PositionalAudio(audioListener); sound.setBuffer(shootSoundBuffer); sound.setRefDistance(5); sound.setRolloffFactor(2); sound.setVolume(0.8); activeGunObject.add(sound); sound.play(); sound.onEnded = () => { if (activeGunObject && sound.parent === activeGunObject) { activeGunObject.remove(sound); } sound.disconnect(); }; }

    // --- Shoot Visual Tracer (Identical) ---
    const beamMaterial = new THREE.LineBasicMaterial({ color: 0xffa500, linewidth: 2 }); /* ... (Identical beam logic) ... */ const beamPoints = []; const startPoint = new THREE.Vector3(); const endPoint = new THREE.Vector3(); activeGunObject.getWorldPosition(startPoint); endPoint.copy(raycaster.ray.origin).add(raycaster.ray.direction.multiplyScalar(50)); beamPoints.push(startPoint); beamPoints.push(endPoint); const beamGeometry = new THREE.BufferGeometry().setFromPoints(beamPoints); const beamLine = new THREE.Line(beamGeometry, beamMaterial); scene.add(beamLine); setTimeout(() => { scene.remove(beamLine); if (beamLine.geometry) beamLine.geometry.dispose(); if (beamLine.material) beamLine.material.dispose(); }, 100);
}


// --- Enemy Logic ---
// UPDATED: createEnemy uses different geometries
function createEnemy(enemyTypeKey) {
    const type = ENEMY_TYPES[enemyTypeKey];
    if (!type) {
        console.error("Unknown enemy type:", enemyTypeKey);
        return null;
    }

    const enemyGroup = new THREE.Group();
    enemyGroup.userData.isEnemyRoot = true; // Flag for raycasting hits
    enemyGroup.userData.type = type;
    enemyGroup.userData.currentHealth = type.health;
    enemyGroup.userData.originalColor = type.color; // Store original color

    const bodyMat = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.7, metalness: 0.1 });
    let bodyGeo;

    // --- Select Geometry based on Type ---
    switch (type.geometryType) {
        case 'box':
            bodyGeo = new THREE.BoxGeometry(type.size * 1.5, type.size * 1.5, type.size * 1.5); // Grunt is a cube
            break;
        case 'cylinder':
            bodyGeo = new THREE.CylinderGeometry(type.size * 0.8, type.size * 0.8, type.size * 2, 16); // Shooter is a cylinder
            break;
        case 'icosahedron':
            bodyGeo = new THREE.IcosahedronGeometry(type.size, 0); // Brute is a chunky icosahedron
            break;
        default: // Fallback to sphere
            console.warn(`Unknown geometry type ${type.geometryType} for ${type.name}, using Sphere.`);
            bodyGeo = new THREE.SphereGeometry(type.size, 16, 12);
            break;
    }

    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    enemyGroup.add(bodyMesh);

    // --- Eyes (Adjust placement based on shape if needed) ---
    // Simple cone eyes, might need tweaking for non-spheres
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.ConeGeometry(type.size * 0.15, type.size * 0.3, 8);

    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    // Adjust eye position slightly based on geometry type if desired
    let eyeOffsetZ = type.size * 0.7;
    if (type.geometryType === 'box') eyeOffsetZ = type.size * 0.75;
    if (type.geometryType === 'cylinder') eyeOffsetZ = type.size * 0.4;

    eye1.position.set(type.size * 0.6, type.size * 0.3, eyeOffsetZ);
    eye1.rotation.x = Math.PI / 2; // Pointing forward-ish
    enemyGroup.add(eye1);

    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye2.position.set(-type.size * 0.6, type.size * 0.3, eyeOffsetZ);
    eye2.rotation.x = Math.PI / 2;
    enemyGroup.add(eye2);

    // --- Movement/Shooting Data (Identical) ---
    enemyGroup.userData.initialPosition = new THREE.Vector3();
    enemyGroup.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, 0); // Sideways/vertical drift
    enemyGroup.userData.oscillationSpeed = TARGET_BASE_SPEED * type.speedFactor;
    enemyGroup.userData.oscillationAmplitude = 0.1 + type.points * 0.005; // More points = wider oscillation
    enemyGroup.userData.shootInterval = THREE.MathUtils.randFloat(TARGET_MIN_SHOOT_INTERVAL, TARGET_MAX_SHOOT_INTERVAL) / type.shootIntervalFactor;
    enemyGroup.userData.timeSinceLastShot = Math.random() * enemyGroup.userData.shootInterval; // Stagger initial shots

    return enemyGroup;
}

function getEnemySpawnList(round) { /* ... (Identical spawn list generation) ... */ console.log(`Calculating spawns for round ${round}`); const spawnList = []; const baseGruntCount = 3 + round * 2; const baseShooterCount = 1 + Math.floor(round * 1.5); const baseBruteCount = Math.floor(round / 2); for (let i = 0; i < baseGruntCount; i++) spawnList.push('grunt'); for (let i = 0; i < baseShooterCount; i++) spawnList.push('shooter'); if (round >= 2) { for (let i = 0; i < baseBruteCount; i++) spawnList.push('brute'); } console.log(`Spawn list: ${spawnList.join(', ')}`); return spawnList.slice(0, MAX_ENEMIES_ON_SCREEN); }

// UPDATED: spawnEnemies respects spawnMode
function spawnEnemies(spawnList) {
    console.log(`Spawning ${spawnList.length} enemies for round ${currentRound} (Mode: ${spawnMode})`);
    enemiesRemainingInRound = spawnList.length;
    if (enemiesRemainingInRound === 0) {
        console.warn("Spawn list is empty, starting intermission immediately.");
        startIntermission();
        return;
    }

    spawnList.forEach((enemyTypeKey, index) => {
        const enemy = createEnemy(enemyTypeKey);
        if (enemy) {
            let x, y, z, angle, radius;

            if (spawnMode === 'frontal') {
                // Spawn in a narrower cone directly in front
                const maxAngleSpread = Math.PI * 0.4; // Narrower spread (e.g., 72 degrees total)
                angle = (index / Math.max(1, enemiesRemainingInRound -1)) * maxAngleSpread - (maxAngleSpread / 2); // Center around 0 angle
                radius = 4 + Math.random() * (TARGET_AREA_RADIUS - 4); // Slightly closer range
                x = Math.sin(angle) * radius;
                z = -Math.cos(angle) * radius - 1.5; // Ensure in front, slightly further base Z
                y = THREE.MathUtils.clamp(1.0 + Math.random() * (TARGET_AREA_HEIGHT - 1.5), TARGET_BOUNDS.yMin, TARGET_BOUNDS.yMax);

            } else { // Default 'spread' mode
                angle = (index / enemiesRemainingInRound) * Math.PI * 1.8 - Math.PI * 0.9; // Wider spread
                radius = 5 + Math.random() * (TARGET_AREA_RADIUS - 5);
                x = Math.sin(angle) * radius;
                z = -Math.cos(angle) * radius; // Ensure in front
                y = THREE.MathUtils.clamp(1.0 + Math.random() * (TARGET_AREA_HEIGHT - 1.5), TARGET_BOUNDS.yMin, TARGET_BOUNDS.yMax);
            }


            enemy.position.set(x, y, z);
            enemy.userData.initialPosition.copy(enemy.position); // Store initial spawn point for oscillation base
            enemy.lookAt(camera.position); // Initial look at player
            scene.add(enemy);
            enemies.push(enemy);
            console.log(`Spawned ${enemyTypeKey} at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        } else {
            console.error(`Failed to create enemy of type: ${enemyTypeKey}`);
            enemiesRemainingInRound--; // Decrement count if creation failed
        }
    });

    // Check again if all creations failed (unlikely but possible)
    if (enemiesRemainingInRound <= 0) {
         console.warn("All enemy creations failed for the round.");
         startIntermission();
    }
    updateScoreDisplay(); // Update UI with initial enemy count
}

function cleanupEnemy(enemy) { /* ... (Identical cleanup) ... */ if (!enemy) return; scene.remove(enemy); enemy.traverse(child => { if (child.isMesh) { child.geometry?.dispose(); if (Array.isArray(child.material)) { child.material.forEach(m => m.map?.dispose()); child.material.forEach(m => m.dispose()); } else if (child.material) { child.material.map?.dispose(); child.material.dispose(); } } if (child.isPositionalAudio) { child.stop(); if (child.parent) child.parent.remove(child); child.disconnect(); } }); /* console.log("Cleaned up enemy:", enemy.uuid); */ }
function cleanupAllEnemies() { /* ... (Identical) ... */ console.log("Cleaning up all enemies..."); for (let i = enemies.length - 1; i >= 0; i--) { cleanupEnemy(enemies[i]); } enemies.length = 0; }
function cleanupAllProjectiles() { /* ... (Identical) ... */ console.log("Cleaning up all projectiles..."); projectiles.forEach(p => { scene.remove(p); p.geometry?.dispose(); p.material?.dispose(); }); projectiles.length = 0; }

// --- Enemy Update & Shooting Logic ---
function updateEnemies(deltaTime) {
    if (currentGameState !== GAME_STATE.PLAYING) return; // Only update if playing

    const cameraPosition = camera.position; // Get player position once per frame

    enemies.forEach(enemy => {
        // Movement Logic (Identical oscillation + drift)
        const speed = enemy.userData.oscillationSpeed;
        const amplitude = enemy.userData.oscillationAmplitude;
        const time = clock.getElapsedTime(); // Use global clock time for consistent oscillation

        // Calculate oscillation offsets
        const offsetX = Math.sin(time * speed) * amplitude;
        const offsetY = Math.cos(time * speed * 0.8) * amplitude * 0.5; // Slightly different vertical oscillation

        // Apply drift velocity to the base position
        enemy.userData.initialPosition.add(enemy.userData.velocity.clone().multiplyScalar(deltaTime));

        // Apply oscillation to the drifted base position
        enemy.position.x = enemy.userData.initialPosition.x + offsetX;
        enemy.position.y = enemy.userData.initialPosition.y + offsetY;
        enemy.position.z = enemy.userData.initialPosition.z; // Z drift can be added if desired

        // Boundary checks (Identical)
        if (enemy.position.x > TARGET_BOUNDS.x || enemy.position.x < -TARGET_BOUNDS.x) { enemy.userData.velocity.x *= -1; enemy.position.x = THREE.MathUtils.clamp(enemy.position.x, -TARGET_BOUNDS.x, TARGET_BOUNDS.x); enemy.userData.initialPosition.x = enemy.position.x - offsetX; }
        if (enemy.position.y > TARGET_BOUNDS.yMax || enemy.position.y < TARGET_BOUNDS.yMin) { enemy.userData.velocity.y *= -1; enemy.position.y = THREE.MathUtils.clamp(enemy.position.y, TARGET_BOUNDS.yMin, TARGET_BOUNDS.yMax); enemy.userData.initialPosition.y = enemy.position.y - offsetY; }
        // Add Z boundary check if Z drift is implemented
        // if (enemy.position.z > TARGET_BOUNDS.zMax || enemy.position.z < TARGET_BOUNDS.zMin) { enemy.userData.velocity.z *= -1; ... }

        // Make enemies always face player (Identical)
        enemy.lookAt(cameraPosition);

        // Shooting Logic (Identical)
        enemy.userData.timeSinceLastShot += deltaTime;
        if (enemy.userData.timeSinceLastShot >= enemy.userData.shootInterval) {
            enemyShoot(enemy, cameraPosition);
            enemy.userData.timeSinceLastShot = 0; // Reset timer
            // Randomize next shot interval slightly (Identical)
            enemy.userData.shootInterval = THREE.MathUtils.randFloat(TARGET_MIN_SHOOT_INTERVAL, TARGET_MAX_SHOOT_INTERVAL) / enemy.userData.type.shootIntervalFactor;
        }
    });
}

function enemyShoot(enemy, playerPosition) { /* ... (Identical projectile creation and sound) ... */ const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 8, 8); const projectileMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 }); const projectile = new THREE.Mesh(projectileGeo, projectileMat); const startPos = new THREE.Vector3(); enemy.getWorldPosition(startPos); const direction = playerPosition.clone().sub(startPos).normalize(); startPos.addScaledVector(direction, ENEMY_SHOOT_OFFSET); projectile.position.copy(startPos); projectile.userData = { direction: direction, speed: enemy.userData.type.projectileSpeed || PROJECTILE_SPEED, originTime: clock.getElapsedTime() }; projectiles.push(projectile); scene.add(projectile); if (enemyShootSoundBuffer && audioListener) { const sound = new THREE.PositionalAudio(audioListener); sound.setBuffer(enemyShootSoundBuffer); sound.setRefDistance(10); sound.setVolume(0.4); enemy.add(sound); sound.play(); sound.onEnded = () => { if (sound.parent === enemy) enemy.remove(sound); sound.disconnect(); }; } }

// --- Projectile Update & Hit Detection ---
// UPDATED: Check cover collision first
function updateProjectiles(deltaTime) {
    if (currentGameState !== GAME_STATE.PLAYING && currentGameState !== GAME_STATE.INTERMISSION) return; // Projectiles can fly during intermission

    const cameraPosition = camera.position;
    const origin = new THREE.Vector3(0, 0, 0); // Scene origin for max distance check

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        const moveDistance = projectile.userData.speed * deltaTime;
        const nextPosition = projectile.position.clone().addScaledVector(projectile.userData.direction, moveDistance);

        // --- 1. Check Collision with Cover ---
        // Use a ray from current pos to next pos for better collision detection
        const projectileRay = new THREE.Ray(projectile.position, projectile.userData.direction);
        const coverIntersects = projectileRay.intersectObjects(coverObjects, false); // Don't check children

        let hitCover = false;
        if (coverIntersects.length > 0 && coverIntersects[0].distance <= moveDistance) {
            const hitObject = coverIntersects[0].object;
            if (hitObject.userData.isBreakable) {
                hitObject.userData.health -= 10; // Example damage to cover
                console.log(`Cover hit! Health: ${hitObject.userData.health}/${COVER_HEALTH_MAX}`);
                // Add visual feedback for cover hit (e.g., change color briefly)
                const originalCoverColor = hitObject.userData.originalColor || 0xaaaaaa;
                hitObject.material.color.set(0xffffff);
                setTimeout(() => {
                    // Fade back or set based on health %
                    const healthPercent = Math.max(0, hitObject.userData.health / COVER_HEALTH_MAX);
                    hitObject.material.color.setHex(originalCoverColor).lerp(new THREE.Color(0x333333), 1.0 - healthPercent); // Lerp towards dark grey as health drops
                }, 50);

                if (hitObject.userData.health <= 0) {
                    console.log("Cover destroyed!");
                    scene.remove(hitObject);
                    const coverIndex = coverObjects.indexOf(hitObject);
                    if (coverIndex > -1) coverObjects.splice(coverIndex, 1);
                    // Optionally dispose geometry/material if not reused
                    // hitObject.geometry.dispose();
                    // hitObject.material.dispose();
                }
            } else {
                // Hit indestructible cover
                console.log("Indestructible cover hit!");
                 // Optional: Add visual/audio feedback for hitting indestructible cover
            }

            // Remove projectile
            scene.remove(projectile);
            projectile.geometry?.dispose();
            projectile.material?.dispose();
            projectiles.splice(i, 1);
            hitCover = true; // Mark that we hit cover
            continue; // Move to next projectile
        }

        // --- 2. Check Collision with Player (only if cover wasn't hit) ---
        if (!hitCover) {
             // Update position *after* cover check
             projectile.position.copy(nextPosition);

            if (projectile.position.distanceTo(cameraPosition) < PLAYER_HIT_RADIUS) {
                playerHit(); // Handle player damage
                scene.remove(projectile);
                projectile.geometry?.dispose();
                projectile.material?.dispose();
                projectiles.splice(i, 1);
                continue; // Move to next projectile
            }
        }


        // --- 3. Check Max Distance (only if nothing else hit) ---
        if (projectile.position.distanceTo(origin) > PROJECTILE_MAX_DIST) {
            // console.log("Projectile out of bounds");
            scene.remove(projectile);
            projectile.geometry?.dispose();
            projectile.material?.dispose();
            projectiles.splice(i, 1);
            continue; // Move to next projectile
        }
    }
}


// --- Round Management ---
function startNextRound() {
    currentRound++;
    console.log(`Starting Round ${currentRound}`);
    currentGameState = GAME_STATE.PLAYING; // Ensure state is PLAYING
    timeUntilNextRound = 0;

    const spawnList = getEnemySpawnList(currentRound);
    if (!spawnList || spawnList.length === 0) {
        console.warn(`No enemies generated for round ${currentRound}. Starting intermission.`);
        startIntermission();
        return;
    }
    spawnEnemies(spawnList);
    updateScoreDisplay(); // Update UI for new round
}

function startIntermission() {
    console.log(`Round ${currentRound} ended. Intermission started.`);
    currentGameState = GAME_STATE.INTERMISSION;
    timeUntilNextRound = intermissionDuration;
    cleanupAllProjectiles(); // Clean up remaining enemy projectiles
    updateScoreDisplay(); // Update UI to show intermission
}

function updateIntermission(deltaTime) {
    if (currentGameState !== GAME_STATE.INTERMISSION) return;

    timeUntilNextRound -= deltaTime;
    updateScoreDisplay(); // Update timer on UI

    if (timeUntilNextRound <= 0) {
        startNextRound(); // Automatically start next round
    }
}

// --- Cover Object Creation ---
function createCoverObjects() {
    // Example Cover Objects - Place them relative to the player start (0, 1.6, 1)
    // Adjust positions and sizes as needed

    // Indestructible Low Wall
    const wallGeo = new THREE.BoxGeometry(2.5, 0.8, 0.3);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.8 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 0.4, -1.5); // In front of player, low down
    wall.userData.isBreakable = false;
    scene.add(wall);
    coverObjects.push(wall); // Add to array for collision checks

    // Breakable Pillar 1
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.5, 16);
    const pillarMat1 = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 }); // Brownish
    const pillar1 = new THREE.Mesh(pillarGeo, pillarMat1);
    pillar1.position.set(-1.8, 1.25, -1.0); // Left side
    pillar1.userData.isBreakable = true;
    pillar1.userData.health = COVER_HEALTH_MAX;
    pillar1.userData.originalColor = 0x8B4513;
    scene.add(pillar1);
    coverObjects.push(pillar1);

    // Breakable Pillar 2
    const pillarMat2 = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
    const pillar2 = new THREE.Mesh(pillarGeo, pillarMat2); // Reuse geometry
    pillar2.position.set(1.8, 1.25, -1.0); // Right side
    pillar2.userData.isBreakable = true;
    pillar2.userData.health = COVER_HEALTH_MAX;
    pillar2.userData.originalColor = 0x8B4513;
    scene.add(pillar2);
    coverObjects.push(pillar2);

    console.log(`Created ${coverObjects.length} cover objects.`);
}

function resetCoverObjects() {
    coverObjects.forEach(cover => {
        if (cover.userData.isBreakable) {
            // Reset health
            cover.userData.health = COVER_HEALTH_MAX;
            // Reset appearance
            cover.material.color.setHex(cover.userData.originalColor);
            // If it was previously destroyed and removed, we need to add it back
            if (!cover.parent) {
                scene.add(cover);
            }
        }
    });
    // This simple reset assumes cover objects aren't permanently removed from the array.
    // A more robust system might involve recreating them or managing their visibility/state.
    console.log("Reset breakable cover health.");
}


// --- Explosion Logic ---
function createExplosion(position, color) {
    const explosionData = {
        particles: [],
        startTime: clock.getElapsedTime(),
        color: color
    };

    const particleMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 });
    // Use a single geometry for all particles in this explosion for performance
    const particleGeo = new THREE.BoxGeometry(EXPLOSION_PARTICLE_SIZE, EXPLOSION_PARTICLE_SIZE, EXPLOSION_PARTICLE_SIZE);

    for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
        const particle = new THREE.Mesh(particleGeo, particleMat.clone()); // Clone material if needed for opacity fade later

        particle.position.copy(position);

        // Random outward velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5),
            (Math.random() - 0.5),
            (Math.random() - 0.5)
        ).normalize().multiplyScalar(EXPLOSION_PARTICLE_SPEED * (0.5 + Math.random() * 0.7)); // Randomize speed slightly

        particle.userData = { velocity: velocity };
        explosionData.particles.push(particle);
        scene.add(particle);
    }

    explosions.push(explosionData);

    // Play explosion sound
    if (explosionSoundBuffer && audioListener) {
        const sound = new THREE.PositionalAudio(audioListener);
        sound.setBuffer(explosionSoundBuffer);
        sound.setRefDistance(15);
        sound.setVolume(0.9);
        // Need a temporary object at the position to attach the sound to,
        // as the enemy object is being removed.
        const soundEmitter = new THREE.Object3D();
        soundEmitter.position.copy(position);
        scene.add(soundEmitter); // Add temporarily
        soundEmitter.add(sound);
        sound.play();
        // Clean up the emitter after the sound likely finishes
        sound.onEnded = () => {
            sound.disconnect();
            if (soundEmitter.parent) soundEmitter.parent.remove(soundEmitter);
        };
    }
}

function updateExplosions(deltaTime) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const explosion = explosions[i];
        const elapsedTime = clock.getElapsedTime() - explosion.startTime;
        const progress = elapsedTime / EXPLOSION_DURATION;

        if (progress >= 1) {
            // Explosion finished, remove particles
            cleanupExplosion(explosion);
            explosions.splice(i, 1);
            continue;
        }

        // Update particles
        explosion.particles.forEach(particle => {
            particle.position.addScaledVector(particle.userData.velocity, deltaTime);
            // Optional: Add gravity or drag
            // particle.userData.velocity.y -= 9.8 * 0.1 * deltaTime; // Simple gravity

            // Fade out particles
            if (particle.material.opacity !== undefined) {
                 particle.material.opacity = Math.max(0, 0.9 * (1.0 - progress));
                 particle.material.needsUpdate = true;
            }
            // Optional: Scale down particles
            // const scale = Math.max(0.01, 1.0 - progress);
            // particle.scale.set(scale, scale, scale);
        });
    }
}

function cleanupExplosion(explosion) {
    explosion.particles.forEach(particle => {
        scene.remove(particle);
        // Only dispose geometry/material if they are unique per particle/explosion
        // If shared, dispose elsewhere (e.g., on game end)
        // particle.geometry?.dispose(); // Dispose only if unique
        particle.material?.dispose(); // Dispose cloned materials
    });
    explosion.particles.length = 0; // Clear array
}

function cleanupAllExplosions() {
    console.log("Cleaning up all explosions...");
    for (let i = explosions.length - 1; i >= 0; i--) {
        cleanupExplosion(explosions[i]);
    }
    explosions.length = 0;
}


// --- Wrist UI Logic ---
function createWristUi() { /* ... (Identical setup) ... */ wristUiGroup = new THREE.Group(); wristUiCanvas = document.createElement('canvas'); wristUiCanvas.width = WRIST_UI_WIDTH; wristUiCanvas.height = WRIST_UI_HEIGHT; wristUiContext = wristUiCanvas.getContext('2d'); wristUiTexture = new THREE.CanvasTexture(wristUiCanvas); wristUiTexture.needsUpdate = true; wristUiMaterial = new THREE.MeshBasicMaterial({ map: wristUiTexture, transparent: true, alphaTest: 0.05 }); const wristUiGeometry = new THREE.PlaneGeometry(WRIST_UI_PLANE_WIDTH, WRIST_UI_PLANE_HEIGHT); wristUiPlane = new THREE.Mesh(wristUiGeometry, wristUiMaterial); wristUiGroup.add(wristUiPlane); wristUiGroup.visible = false; }
function attachWristUi(controller) { /* ... (Identical attachment) ... */ wristUiGroup.position.set(0, 0.05, 0.05); wristUiGroup.rotation.set(-Math.PI * 0.4, 0, 0); controller.add(wristUiGroup); }

// UPDATED: updateWristUiDisplay handles new game states and pause menu changes
function updateWristUiDisplay() {
    if (!wristUiContext || !wristUiTexture) return;

    const ctx = wristUiContext;
    const W = WRIST_UI_WIDTH;
    const H = WRIST_UI_HEIGHT;

    // Clear background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    switch (currentGameState) {
        case GAME_STATE.LOADING:
            ctx.fillStyle = 'white';
            ctx.font = 'bold 30px Arial';
            ctx.fillText("Loading...", W / 2, H / 2);
            break;

        case GAME_STATE.AWAITING_START:
            ctx.fillStyle = 'lime';
            ctx.font = 'bold 36px Arial';
            ctx.fillText("Ready!", W / 2, H * 0.3);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 28px Arial';
            ctx.fillText("Point UI Hand Down", W / 2, H * 0.6);
            ctx.font = 'bold 28px Arial';
            ctx.fillText("Pull Trigger to Start", W / 2, H * 0.8);
            break;

        case GAME_STATE.PAUSED:
            drawPauseMenuOnWrist(ctx, W, H); // Use dedicated function
            break;

        case GAME_STATE.GAME_OVER:
            ctx.fillStyle = 'red';
            ctx.font = 'bold 44px Arial';
            ctx.fillText(`GAME OVER`, W / 2, H * 0.25);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 32px Arial';
            ctx.fillText(`Round: ${currentRound}`, W / 2, H * 0.50);
            ctx.font = 'bold 32px Arial';
            ctx.fillText(`Score: ${score}`, W / 2, H * 0.70);
            ctx.fillStyle = 'lime';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(`UI Trigger to Restart`, W / 2, H * 0.90);
            break;

        case GAME_STATE.INTERMISSION:
            ctx.fillStyle = 'cyan';
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`Round ${currentRound} Complete!`, W / 2, H * 0.3);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 32px Arial';
            ctx.fillText(`Next Round: ${Math.ceil(timeUntilNextRound)}s`, W / 2, H * 0.7);
            break;

        case GAME_STATE.PLAYING:
        default: // Default to standard playing UI
            ctx.fillStyle = 'white';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            // Health Bar
            const healthBarWidth = W * 0.9;
            const healthBarHeight = 25;
            const healthPerc = playerHealth / MAX_PLAYER_HEALTH;
            const currentHealthWidth = healthBarWidth * healthPerc;
            const healthY = 15;
            const textYOffset = 30; // Space below health bar

            ctx.fillStyle = '#555'; // Background of bar
            ctx.fillRect((W - healthBarWidth) / 2, healthY, healthBarWidth, healthBarHeight);
            // Health bar color based on percentage
            ctx.fillStyle = healthPerc > 0.5 ? '#00ff00' : (healthPerc > 0.2 ? '#ffff00' : '#ff0000');
            ctx.fillRect((W - healthBarWidth) / 2, healthY, currentHealthWidth, healthBarHeight);

            // Health Text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${playerHealth}/${MAX_PLAYER_HEALTH}`, W / 2, healthY + healthBarHeight / 2);

            // Other Stats
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const lineH = 30; // Line height for stats
            let textY = healthY + healthBarHeight + 10; // Start position below health bar

            ctx.fillText(`Score: ${score}`, 15, textY);
            ctx.fillText(`Round: ${currentRound}`, 15, textY + lineH);
            ctx.fillText(`Enemies: ${enemiesRemainingInRound}`, 15, textY + lineH * 2);

            // Time remaining (optional, if using timer)
            // ctx.textAlign = 'right';
            // ctx.fillText(`Time: ${formatTime(gameTimeRemaining)}`, W - 15, textY);

            break; // End of PLAYING case
    }

    wristUiTexture.needsUpdate = true; // Signal Three.js to update the texture
}


// UPDATED: drawPauseMenuOnWrist reflects new controls and items
function drawPauseMenuOnWrist(ctx, W, H) {
    const gunData = guns[currentGunIndex];
    ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let yPos = 10; const lineH = 26; const indent = 20; const highlightColor = '#80DEEA'; // Cyan highlight
    const instructionFontSize = 16; const menuFontSize = 22; const valueFontSize = 18;

    ctx.font = `bold ${menuFontSize+2}px Arial`;
    ctx.fillText(debugModeActive ? `Debug: ${gunData.name}` : "Paused", indent, yPos); yPos += lineH * 1.3;

    // --- Instructions ---
    ctx.font = `${instructionFontSize}px Arial`;
    const instructionY = yPos;
    if (debugModeActive) {
        ctx.fillText("Gun Trig/Sq: Cycle Property", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("UI Trig/Sq: Adjust Value (+/-)", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("UI Squeeze: Resume Game", indent, yPos);
    } else { // Main Pause Menu Instructions
        ctx.fillText("Gun Trig/Sq: Cycle Menu", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("UI Trigger: Select Item", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("UI Squeeze: Resume Game", indent, yPos);
    }

    yPos = instructionY + lineH * 3.5; // Space below instructions
    ctx.font = `bold ${menuFontSize}px Arial`;

    // --- Menu Items ---
    if (debugModeActive) { // Draw Debug Adjustment Options
        const debugItemLabels = { // Show current values
            'posX': `Pos X: ${activeGunObject ? activeGunObject.position.x.toFixed(3) : '?'}`,
            'posY': `Pos Y: ${activeGunObject ? activeGunObject.position.y.toFixed(3) : '?'}`,
            'posZ': `Pos Z: ${activeGunObject ? activeGunObject.position.z.toFixed(3) : '?'}`,
            'rotX': `Rot X: ${activeGunObject ? radToDeg(activeGunObject.rotation.x) : '?'}°`,
            'rotY': `Rot Y: ${activeGunObject ? radToDeg(activeGunObject.rotation.y) : '?'}°`,
            'rotZ': `Rot Z: ${activeGunObject ? radToDeg(activeGunObject.rotation.z) : '?'}°`,
            'scale': `Scale: ${activeGunObject ? activeGunObject.scale.x.toFixed(3) : '?'}`,
            'exitDebug': "Exit Debug Tools"
        };
        DEBUG_MENU_ITEMS.forEach(key => {
            ctx.fillStyle = (selectedDebugItem === key) ? highlightColor : 'white';
            ctx.fillText(`> ${debugItemLabels[key]}`, indent, yPos); yPos += lineH;
        });

    } else { // Draw Main Pause Menu Items
        const menuItems = {
            logOffsets: 'Log Gun Offsets',
            debug: 'Debug Gun Tools',
            spawnModeToggle: `Spawn: ${spawnMode === 'spread' ? 'Spread' : 'Frontal'}`, // Show current mode
            restart: 'Restart Game',
            quit: 'Quit Session'
        };
        Object.entries(menuItems).forEach(([key, text]) => {
            ctx.fillStyle = (selectedPauseMenuItem === key) ? highlightColor : 'white';
            ctx.fillText(`> ${text}`, indent, yPos); yPos += lineH;
        });
    }
}


function checkWristUiVisibility(controller) {
    if (!controller || !wristUiGroup) return;

    // --- Always show UI if paused, game over, or awaiting start ---
    if (currentGameState === GAME_STATE.PAUSED || currentGameState === GAME_STATE.GAME_OVER || currentGameState === GAME_STATE.AWAITING_START) {
        wristUiGroup.visible = true;
        return;
    }

    // --- Otherwise, show based on controller orientation ---
    const controllerQuaternion = controller.getWorldQuaternion(new THREE.Quaternion());
    // Get the direction the palm is facing (approximately Y-up relative to controller)
    const palmUpVector = new THREE.Vector3(0, 1, 0).applyQuaternion(controllerQuaternion);
    // Check angle between palm direction and world up vector
    const angleWithWorldUp = palmUpVector.angleTo(new THREE.Vector3(0, 1, 0));

    // Define the angle range where the UI should be visible (e.g., when palm is roughly facing up)
    const minAngle = Math.PI * 0.0; // Palm pointing straight up
    const maxAngle = Math.PI * 0.4; // Palm pointing somewhat forward/up

    wristUiGroup.visible = (angleWithWorldUp >= minAngle && angleWithWorldUp <= maxAngle);

    // --- Fallback/Alternative: Check angle with world DOWN (like original) ---
    // const controllerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerQuaternion);
    // const angleWithWorldDown = controllerForward.angleTo(new THREE.Vector3(0, -1, 0));
    // const minAngleDown = Math.PI * 0.3;
    // const maxAngleDown = Math.PI * 0.7;
    // wristUiGroup.visible = (angleWithWorldDown > minAngleDown && angleWithWorldDown < maxAngleDown);
}

// --- Score Display Update ---
function updateScoreDisplay() {
    scoreDisplay.textContent = 'Score: ' + score; // Update HTML display
    updateWristUiDisplay(); // Update wrist UI as well
}

// --- Utilities ---
function onWindowResize() { /* ... (Identical) ... */ camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

// --- Render Loop ---
function render() {
    const deltaTime = clock.getDelta();

    // Only run game logic if session is active
    if (!xrSession) return;

    // Make sure clock is running when it should be
    if ((currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.INTERMISSION) && !clock.running) {
        clock.start();
    }

    // Timer Logic (Optional - if you want a global timer alongside rounds)
    // if (currentGameState === GAME_STATE.PLAYING && clock.running) {
    //     gameTimeRemaining -= deltaTime;
    //     if (gameTimeRemaining <= 0) {
    //         gameTimeRemaining = 0;
    //         currentGameState = GAME_STATE.GAME_OVER;
    //         console.log("Game Over - Time Ran Out!");
    //         if(clock.running) clock.stop();
    //         updateWristUiDisplay();
    //     }
    // }

    // Intermission Logic
    if (currentGameState === GAME_STATE.INTERMISSION) {
        updateIntermission(deltaTime);
    }

    // Update game elements only if playing
    if (currentGameState === GAME_STATE.PLAYING) {
        updateEnemies(deltaTime);
    }

    // Update projectiles if playing or in intermission (they might still be flying)
    if (currentGameState === GAME_STATE.PLAYING || currentGameState === GAME_STATE.INTERMISSION) {
         updateProjectiles(deltaTime);
    }

    // Update explosions regardless of game state (they need to finish animating)
    updateExplosions(deltaTime);

    // Update Wrist UI visibility and content
    checkWristUiVisibility(getUiController());
    updateWristUiDisplay(); // Update content based on current state

    renderer.render(scene, camera);
}

// --- Start ---
loadAssets(); // Initiate loading