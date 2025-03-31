// main.js

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

// --- Core THREE components ---
let scene, camera, renderer, controls;
let controller1, controller2;
let raycaster;
let loadingManager;
let audioListener, shootSoundBuffer, playerHitSoundBuffer, enemyHitSoundBuffer, enemyShootSoundBuffer; // Added more sounds
let clock;
let xrSession = null;

// --- Game State ---
let isPaused = false;
let isGameOver = false;
let score = 0;
let playerHealth = 100; // Starting health
const MAX_PLAYER_HEALTH = 100;
let activeHand = 'right';
let currentGunIndex = 0;
let activeGunObject = null;
const gameDuration = 180; // Longer game time?
let gameTimeRemaining = gameDuration;
let currentRound = 0; // Start at 0, first round is 1
let enemiesRemainingInRound = 0;
let isIntermission = false;
const intermissionDuration = 5.0; // seconds between rounds
let timeUntilNextRound = 0;

// --- Debug/Pause State ---
let debugModeActive = false;
const ROTATION_INCREMENT = THREE.MathUtils.degToRad(5);
const SCALE_INCREMENT = 0.001;
let selectedPauseMenuItem = 'logOffsets';
const DEBUG_MENU_ITEMS = ['rotX', 'rotY', 'rotZ', 'scaleUp', 'scaleDown', 'exitDebug'];
let selectedDebugItem = DEBUG_MENU_ITEMS[0];

// --- UI Elements ---
const scoreDisplay = document.getElementById('score');
const gunDisplay = document.getElementById('current-gun');
const pauseMenu = document.getElementById('pause-menu');
const loadingScreen = document.getElementById('loading-screen');
const playerHitOverlay = document.getElementById('player-hit-overlay');

// Wrist UI
let wristUiGroup, wristUiCanvas, wristUiContext, wristUiTexture, wristUiMaterial, wristUiPlane;
const WRIST_UI_WIDTH = 384; const WRIST_UI_HEIGHT = 288; const WRIST_UI_ASPECT = WRIST_UI_WIDTH / WRIST_UI_HEIGHT;
const WRIST_UI_PLANE_HEIGHT = 0.09; const WRIST_UI_PLANE_WIDTH = WRIST_UI_PLANE_HEIGHT * WRIST_UI_ASPECT;

// --- Enemy Definitions ---
const ENEMY_TYPES = {
    'grunt': {
        health: 30, points: 10, color: 0x00ff00, size: 0.15, speedFactor: 0.8,
        shootIntervalFactor: 1.2, projectileSpeed: 4.0, name: 'Grunt'
    },
    'shooter': {
        health: 50, points: 20, color: 0xffff00, size: 0.18, speedFactor: 1.0,
        shootIntervalFactor: 1.0, projectileSpeed: 5.0, name: 'Shooter'
    },
    'brute': {
        health: 100, points: 30, color: 0xff0000, size: 0.22, speedFactor: 0.6,
        shootIntervalFactor: 1.5, projectileSpeed: 6.0, name: 'Brute'
    }
};
const enemies = []; // Holds active enemy objects
const MAX_ENEMIES_ON_SCREEN = 20; // Performance limit

// --- Gun Configuration ---
// !! Copy logged offsets here after tuning !!
const guns = [ /* ... (Identical gun definitions) ... */
    { name: 'Pistol', modelPath: 'assets/models/pistol/pistol', scale: 0.035, damage: 15, positionOffset: new THREE.Vector3(0, -0.01, -0.05), rotationOffset: new THREE.Euler(0, 0, 0, 'XYZ'), model: null },
    { name: 'Shotgun', modelPath: 'assets/models/shotgun/shotgun', scale: 0.035, damage: 40, positionOffset: new THREE.Vector3(0, -0.02, -0.08), rotationOffset: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'), model: null }, // Higher damage
    { name: 'Rifle', modelPath: 'assets/models/rifle/rifle', scale: 0.035, damage: 25, positionOffset: new THREE.Vector3(0, -0.02, -0.1), rotationOffset: new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'), model: null } // Medium damage
];

// Projectile Config
const projectiles = [];
const PROJECTILE_SPEED = 5.0;
const PROJECTILE_RADIUS = 0.05;
const PLAYER_HIT_RADIUS = 0.25;
const PROJECTILE_MAX_DIST = 50.0;
const ENEMY_SHOOT_OFFSET = 0.2; // How far in front of enemy projectile spawns

// --- Helper Functions ---
function getGunController() { return activeHand === 'right' ? controller1 : controller2; }
function getUiController() { return activeHand === 'right' ? controller2 : controller1; }
function radToDeg(rad) { return THREE.MathUtils.radToDeg(rad).toFixed(1); }
function formatTime(seconds) { const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60); return `${mins}:${secs < 10 ? '0' : ''}${secs}`; }

// --- Initialization ---
function startExperience() { /* ... (Identical setup, VRButton listeners, lights, floor) ... */
    loadingScreen.style.display = 'none'; clock = new THREE.Clock(); scene = new THREE.Scene(); scene.background = new THREE.Color(0x87CEEB); camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); camera.position.set(0, 1.6, 1); audioListener = new THREE.AudioListener(); camera.add(audioListener); renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio); renderer.xr.enabled = true; document.body.appendChild(renderer.domElement);
    const vrButton = VRButton.createButton(renderer); vrButton.addEventListener('sessionstart', () => { xrSession = renderer.xr.getSession(); console.log("XR Session Started:", xrSession); resetGameState(true); startNextRound(); /* Start first round */ }); vrButton.addEventListener('sessionend', () => { xrSession = null; console.log("XR Session Ended"); resetGameState(false); }); document.body.appendChild(vrButton);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); scene.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); directionalLight.position.set(5, 10, 7.5); scene.add(directionalLight); const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide })); floor.rotation.x = -Math.PI / 2; scene.add(floor); raycaster = new THREE.Raycaster();
    controller1 = renderer.xr.getController(0); controller1.addEventListener('selectstart', onSelectStart); controller1.addEventListener('squeezestart', onSqueezeStart); scene.add(controller1); controller2 = renderer.xr.getController(1); controller2.addEventListener('selectstart', onSelectStart); controller2.addEventListener('squeezestart', onSqueezeStart); scene.add(controller2);
    createWristUi();
    resetGameState(false); updateGunModel(getGunController()); attachWristUi(getUiController()); updateGunDisplay(); // spawnEnemies called by startNextRound
    window.addEventListener('resize', onWindowResize, false); renderer.setAnimationLoop(render);
}

// --- Reset Game State ---
function resetGameState(startTimer = true) {
    console.log("Resetting Game State");
    score = 0;
    playerHealth = MAX_PLAYER_HEALTH; // Reset health
    gameTimeRemaining = gameDuration;
    currentRound = 0; // Reset round
    enemiesRemainingInRound = 0;
    isGameOver = false;
    isPaused = false;
    isIntermission = false; // Ensure not in intermission
    timeUntilNextRound = 0;
    debugModeActive = false;
    selectedPauseMenuItem = 'logOffsets';

    // Cleanup existing enemies and projectiles
    cleanupAllEnemies();
    cleanupAllProjectiles();

    updateScoreDisplay(); // Update displays
    if (startTimer) { if (!clock) clock = new THREE.Clock(); if (!clock.running) clock.start(); }
    else { if (clock && clock.running) clock.stop(); }
}

// --- Loading ---
function loadAssets() { /* ... (Load shoot, optionally hit sounds) ... */
    loadingManager = new THREE.LoadingManager(); const objLoader = new OBJLoader(loadingManager); const mtlLoader = new MTLLoader(loadingManager); const audioLoader = new THREE.AudioLoader(loadingManager);
    let assetsToLoad = guns.length + 1; // Guns + shoot sound
    // Add counts for other sounds if loading them
    // assetsToLoad += 2; // Example: + player hit + enemy hit
    let assetsLoadedCount = 0;
    loadingManager.onLoad = () => { console.log('Loading complete!'); startExperience(); }; loadingManager.onError = (url) => { console.error(`Error loading ${url}`); loadingScreen.textContent = `Error loading ${url}. Check paths & console.`; }; loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => { console.log(`Loading: ${url}`); assetsLoadedCount++; loadingScreen.textContent = `Loading ${assetsLoadedCount}/${assetsToLoad}...`;};
    audioLoader.load('assets/sounds/shoot.mp3', (buffer) => { shootSoundBuffer = buffer; console.log("Shoot Sound loaded"); }, undefined, (err) => { console.error("Shoot Sound load failed", err); });
    // Optional sounds:
    // audioLoader.load('assets/sounds/player_hit.wav', (buffer) => { playerHitSoundBuffer = buffer; console.log("Player Hit Sound loaded"); }, undefined, (err) => { console.error("Player Hit Sound load failed", err); });
    // audioLoader.load('assets/sounds/enemy_hit.wav', (buffer) => { enemyHitSoundBuffer = buffer; console.log("Enemy Hit Sound loaded"); }, undefined, (err) => { console.error("Enemy Hit Sound load failed", err); });
    // audioLoader.load('assets/sounds/enemy_shoot.wav', (buffer) => { enemyShootSoundBuffer = buffer; console.log("Enemy Shoot Sound loaded"); }, undefined, (err) => { console.error("Enemy Shoot Sound load failed", err); });

    guns.forEach(gun => { /* ... (Identical gun loading) ... */ const mtlPath = gun.modelPath + '.mtl'; const objPath = gun.modelPath + '.obj'; const basePath = gun.modelPath.substring(0, gun.modelPath.lastIndexOf('/') + 1); mtlLoader.setPath(basePath); mtlLoader.load(mtlPath.split('/').pop(), (materials) => { materials.preload(); objLoader.setMaterials(materials); objLoader.setPath(basePath); objLoader.load(objPath.split('/').pop(), (object) => { gun.model = object; console.log(`${gun.name} loaded.`); }, undefined, (err) => { console.error(`OBJ load error for ${gun.name} (after MTL success):`, err); handleLoadError(gun); }); }, undefined, (error) => { console.warn(`MTL load failed for ${gun.name}: ${error}. Trying OBJ only.`); objLoader.setPath(basePath); objLoader.load(objPath.split('/').pop(), (object) => { gun.model = object; console.log(`${gun.name} loaded (no MTL).`); }, undefined, (objError) => { console.error(`OBJ load failed for ${gun.name} too: ${objError}`); handleLoadError(gun); }); }); });
    function handleLoadError(gun) { console.log(`Using fallback for ${gun.name}`); gun.model = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.15), new THREE.MeshStandardMaterial({ color: 0xcccccc })); }
}

// --- Input Handling ---
function onSelectStart(event) { /* ... (Identical routing) ... */ const controller = event.target; if (isPaused) { handlePauseMenuInput(controller, 'trigger'); return; } if (isGameOver) return; if (controller === getGunController()) { shoot(controller); } else if (controller === getUiController()) { switchHands(); } }
function onSqueezeStart(event) { /* ... (Identical routing) ... */ const controller = event.target; if (isPaused) { handlePauseMenuInput(controller, 'squeeze'); return; } if (isGameOver) return; if (controller === getGunController()) { cycleGun(controller); } else if (controller === getUiController()) { togglePause(); } }

// --- Pause Menu Input Logic --- (Includes Log Offsets, revised debug controls)
function handlePauseMenuInput(controller, buttonType) {
    if (!isPaused) return;
    if (controller === getUiController() && buttonType === 'squeeze') { togglePause(); return; } // Resume

    if (debugModeActive) { // --- Gun Adjustment UI ---
        const gunData = guns[currentGunIndex]; let currentIndex = DEBUG_MENU_ITEMS.indexOf(selectedDebugItem);
        if (controller === getGunController()) { // Cycle debug items
            if (buttonType === 'trigger') { currentIndex = (currentIndex + 1) % DEBUG_MENU_ITEMS.length; }
            else if (buttonType === 'squeeze') { currentIndex = (currentIndex - 1 + DEBUG_MENU_ITEMS.length) % DEBUG_MENU_ITEMS.length; }
            selectedDebugItem = DEBUG_MENU_ITEMS[currentIndex]; console.log("Selected debug item:", selectedDebugItem);
        } else if (controller === getUiController() && buttonType === 'trigger') { // Activate debug item
            console.log("Activating debug item:", selectedDebugItem); let currentScale = activeGunObject.scale.x;
            switch (selectedDebugItem) {
                case 'rotX': activeGunObject.rotation.x += ROTATION_INCREMENT; gunData.rotationOffset.x = activeGunObject.rotation.x; break;
                case 'rotY': activeGunObject.rotation.y += ROTATION_INCREMENT; gunData.rotationOffset.y = activeGunObject.rotation.y; break;
                case 'rotZ': activeGunObject.rotation.z += ROTATION_INCREMENT; gunData.rotationOffset.z = activeGunObject.rotation.z; break;
                case 'scaleUp': currentScale += SCALE_INCREMENT; activeGunObject.scale.set(currentScale, currentScale, currentScale); gunData.scale = currentScale; break;
                case 'scaleDown': currentScale = Math.max(0.001, currentScale - SCALE_INCREMENT); activeGunObject.scale.set(currentScale, currentScale, currentScale); gunData.scale = currentScale; break;
                case 'exitDebug': debugModeActive = false; selectedPauseMenuItem = 'logOffsets'; console.log("Exiting Debug Tools"); break;
            }
        } else if (controller === getGunController() && buttonType === 'squeeze') { // Decrement Rotation
             if (selectedDebugItem === 'rotX') { activeGunObject.rotation.x -= ROTATION_INCREMENT; gunData.rotationOffset.x = activeGunObject.rotation.x; }
             else if (selectedDebugItem === 'rotY') { activeGunObject.rotation.y -= ROTATION_INCREMENT; gunData.rotationOffset.y = activeGunObject.rotation.y; }
             else if (selectedDebugItem === 'rotZ') { activeGunObject.rotation.z -= ROTATION_INCREMENT; gunData.rotationOffset.z = activeGunObject.rotation.z; }
        }
        updateWristUiDisplay(); return;
    }

    // --- Main Pause Menu ---
    if (!debugModeActive) {
        const menuItems = ['logOffsets', 'debug', 'restart', 'quit']; let currentIndex = menuItems.indexOf(selectedPauseMenuItem);
        if (controller === getGunController()) { // Cycle main menu items
             if (buttonType === 'trigger') { currentIndex = (currentIndex + 1) % menuItems.length; }
             else if (buttonType === 'squeeze') { currentIndex = (currentIndex - 1 + menuItems.length) % menuItems.length; }
             selectedPauseMenuItem = menuItems[currentIndex]; console.log("Selected pause menu item:", selectedPauseMenuItem);
        } else if (controller === getUiController() && buttonType === 'trigger') { // Select main menu item
            console.log("Activating pause menu item:", selectedPauseMenuItem);
            if (selectedPauseMenuItem === 'logOffsets') { logCurrentGunOffsets(); }
            else if (selectedPauseMenuItem === 'debug') { debugModeActive = true; selectedDebugItem = DEBUG_MENU_ITEMS[0]; console.log("Entering Debug Tools"); }
            else if (selectedPauseMenuItem === 'restart') { restartGame(); return; }
            else if (selectedPauseMenuItem === 'quit') { quitSession(); }
        }
        updateWristUiDisplay();
    }
}

// --- Game Actions ---
function restartGame() { console.log("Restarting game..."); cleanupAllEnemies(); cleanupAllProjectiles(); resetGameState(true); startNextRound(); /* Start round 1 */ updateWristUiDisplay(); }
function quitSession() { /* ... (Identical) ... */ console.log("Attempting to quit XR session..."); if (xrSession && xrSession.end) { xrSession.end().then(() => { console.log("XR Session ended via quit button."); }).catch(err => { console.error("Failed to end XR session:", err); }); } else { console.warn("No active XR session or session.end not supported."); if (isPaused) togglePause(); } }
function logCurrentGunOffsets() { /* ... (Identical) ... */ if (!activeGunObject) { console.warn("Cannot log offsets: No active gun object."); return; } const gunData = guns[currentGunIndex]; const currentScale = activeGunObject.scale.x; const currentPos = gunData.positionOffset; const currentRot = activeGunObject.rotation; console.log(`\n--- Offsets for: ${gunData.name} ---`); console.log(`// Copy these values back into the 'guns' array definition`); console.log(`scale: ${currentScale.toFixed(4)},`); console.log(`positionOffset: new THREE.Vector3(${currentPos.x.toFixed(4)}, ${currentPos.y.toFixed(4)}, ${currentPos.z.toFixed(4)}),`); console.log(`rotationOffset: new THREE.Euler(${currentRot.x.toFixed(4)}, ${currentRot.y.toFixed(4)}, ${currentRot.z.toFixed(4)}, 'XYZ'),`); console.log(`--------------------------------------\n`); }

// --- Player Hit Logic ---
function playerHit() {
    if (isGameOver || isPaused) return;
    console.log("Player Hit!");
    playerHealth = Math.max(0, playerHealth - 10); // Lose 10 health per hit
    updateScoreDisplay(); // Update health on UI

    if (playerHealth <= 0) {
        isGameOver = true;
        console.log("Game Over - Player health depleted!");
        if (clock.running) clock.stop();
        updateWristUiDisplay(); // Show game over immediately
    }

    if (playerHitOverlay) { /* ... (Identical flash effect) ... */ playerHitOverlay.style.display = 'block'; playerHitOverlay.style.opacity = '1'; setTimeout(() => { if (playerHitOverlay) playerHitOverlay.style.opacity = '0'; }, 100); }
    if (playerHitSoundBuffer && audioListener) { /* ... (Identical sound playing) ... */ const sound = new THREE.Audio(audioListener); sound.setBuffer(playerHitSoundBuffer); sound.setVolume(0.7); sound.play(); }
}

// --- Hand Switching Logic --- (Identical)
function switchHands() { /* ... */ if (isPaused || isGameOver) return; console.log("Switching hands"); const oldGunController = getGunController(); const oldUiController = getUiController(); if (activeGunObject && activeGunObject.parent === oldGunController) { oldGunController.remove(activeGunObject); } if (wristUiGroup && wristUiGroup.parent === oldUiController) { oldUiController.remove(wristUiGroup); } activeHand = (activeHand === 'right') ? 'left' : 'right'; const newGunController = getGunController(); const newUiController = getUiController(); if (activeGunObject) { newGunController.add(activeGunObject); } if (wristUiGroup) { attachWristUi(newUiController); } updateGunDisplay(); }
// --- Pause Logic --- (Identical)
function togglePause() { /* ... */ isPaused = !isPaused; console.log("Toggling Pause. New state: isPaused =", isPaused); if (isPaused) { pauseMenu.style.display = 'block'; debugModeActive = false; selectedPauseMenuItem = 'logOffsets'; updateWristUiDisplay(); console.log("Game Paused."); } else { pauseMenu.style.display = 'none'; debugModeActive = false; updateWristUiDisplay(); console.log("Game Resumed."); } }
// --- Gun Logic ---
function cycleGun(controller) { /* ... (Identical) ... */ if (!activeGunObject || isPaused || isGameOver) return; currentGunIndex = (currentGunIndex + 1) % guns.length; console.log("Switched to:", guns[currentGunIndex].name); updateGunModel(controller); updateGunDisplay(); }
function updateGunModel(controller) { /* ... (Identical) ... */ if (activeGunObject && activeGunObject.parent) { activeGunObject.parent.remove(activeGunObject); activeGunObject.traverse(child => { if (child.isMesh) { child.geometry?.dispose(); if (Array.isArray(child.material)) { child.material.forEach(m => m.dispose()); } else { child.material?.dispose(); } } }); activeGunObject = null; } const gunData = guns[currentGunIndex]; if (!gunData.model) { console.error(`Model for ${gunData.name} not loaded! Using fallback.`); activeGunObject = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.15), new THREE.MeshStandardMaterial({color:0xff0000})); activeGunObject.position.copy(gunData.positionOffset); activeGunObject.rotation.copy(gunData.rotationOffset); activeGunObject.scale.set(gunData.scale, gunData.scale, gunData.scale); } else { activeGunObject = gunData.model.clone(); activeGunObject.scale.set(gunData.scale, gunData.scale, gunData.scale); activeGunObject.position.copy(gunData.positionOffset); activeGunObject.rotation.copy(gunData.rotationOffset); } controller.add(activeGunObject); if (isPaused) { updateWristUiDisplay(); } }
function updateGunDisplay() { gunDisplay.textContent = `Gun: ${guns[currentGunIndex].name} (${activeHand})`; }

// --- Shooting Logic (Player -> Enemy) ---
function shoot(controller) {
    if (!activeGunObject || activeGunObject.parent !== controller || isPaused || isGameOver) return;
    const gunData = guns[currentGunIndex]; // Get current gun data for damage

    const tempMatrix = new THREE.Matrix4(); tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld); raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix).normalize();
    // Raycast against the 'enemies' array now
    const intersects = raycaster.intersectObjects(enemies, true); // Check recursively for hits within groups

    if (intersects.length > 0) {
        // Find the top-level enemy group that was hit
        let hitObject = intersects[0].object;
        while (hitObject.parent && !hitObject.userData.isEnemyRoot) { // Check for a marker
             hitObject = hitObject.parent;
        }

        // Ensure we found the enemy root and it's still in our active list
        if (hitObject.userData.isEnemyRoot && enemies.includes(hitObject)) {
            const enemy = hitObject;
            const damage = gunData.damage || 10; // Use gun damage, fallback 10
            enemy.userData.currentHealth -= damage;
            console.log(`Hit ${enemy.userData.type.name}! Health: ${enemy.userData.currentHealth}/${enemy.userData.type.health}`);

            // --- Enemy Hit Visual Feedback ---
            const originalColor = enemy.userData.originalColor || enemy.userData.type.color;
            enemy.traverse((child) => { // Flash all meshes in the group white
                if (child.isMesh && child.material) {
                    child.userData.originalColor = child.material.color.getHex(); // Store original
                    child.material.color.set(0xffffff); // Set to white
                    child.material.needsUpdate = true;
                }
            });
            setTimeout(() => { // Revert color after a short delay
                 enemy.traverse((child) => {
                     if (child.isMesh && child.material && child.userData.originalColor !== undefined) {
                         child.material.color.setHex(child.userData.originalColor);
                         child.material.needsUpdate = true;
                         delete child.userData.originalColor; // Clean up stored color
                     }
                 });
            }, 100); // 100ms flash duration
            // --------------------------------

            // Play enemy hit sound (Optional)
            if (enemyHitSoundBuffer && audioListener) {
                 const sound = new THREE.PositionalAudio(audioListener);
                 sound.setBuffer(enemyHitSoundBuffer);
                 sound.setRefDistance(8);
                 sound.setVolume(0.5);
                 enemy.add(sound); // Attach to enemy
                 sound.play();
                 sound.onEnded = () => { if (sound.parent === enemy) enemy.remove(sound); sound.disconnect(); };
             }


            if (enemy.userData.currentHealth <= 0) {
                console.log(`${enemy.userData.type.name} defeated!`);
                score += enemy.userData.type.points;
                enemiesRemainingInRound--;
                updateScoreDisplay();

                // Remove enemy and cleanup
                const index = enemies.indexOf(enemy);
                if (index > -1) enemies.splice(index, 1);
                cleanupEnemy(enemy); // Use helper for thorough cleanup

                // Check if round ended
                if (enemiesRemainingInRound <= 0 && !isIntermission) {
                    startIntermission();
                }
            }
        } else {
             console.log("Raycast hit something, but not a recognized enemy root or not in active list.");
        }

    } else { console.log("Miss!"); }

    // Play shoot sound & beam effect (Identical)
    if (shootSoundBuffer && audioListener && activeGunObject) { const sound = new THREE.PositionalAudio(audioListener); sound.setBuffer(shootSoundBuffer); sound.setRefDistance(5); sound.setRolloffFactor(2); sound.setVolume(0.8); activeGunObject.add(sound); sound.play(); sound.onEnded = () => { if (activeGunObject && sound.parent === activeGunObject) { activeGunObject.remove(sound); } sound.disconnect(); }; }
    const beamMaterial = new THREE.LineBasicMaterial({ color: 0xffa500, linewidth: 2 }); const beamPoints = []; const startPoint = new THREE.Vector3(); const endPoint = new THREE.Vector3(); activeGunObject.getWorldPosition(startPoint); endPoint.copy(raycaster.ray.origin).add(raycaster.ray.direction.multiplyScalar(50)); beamPoints.push(startPoint); beamPoints.push(endPoint); const beamGeometry = new THREE.BufferGeometry().setFromPoints(beamPoints); const beamLine = new THREE.Line(beamGeometry, beamMaterial); scene.add(beamLine); setTimeout(() => { scene.remove(beamLine); if (beamLine.geometry) beamLine.geometry.dispose(); if (beamLine.material) beamLine.material.dispose(); }, 100);
}

// --- Enemy Logic ---
function createEnemy(enemyTypeKey) {
    const type = ENEMY_TYPES[enemyTypeKey];
    if (!type) {
        console.error("Unknown enemy type:", enemyTypeKey);
        return null;
    }

    const enemyGroup = new THREE.Group();
    enemyGroup.userData.isEnemyRoot = true; // Marker for raycasting/logic
    enemyGroup.userData.type = type;
    enemyGroup.userData.currentHealth = type.health;

    // --- Procedural Creature Geometry ---
    const bodyMat = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.7, metalness: 0.1 });
    const bodyGeo = new THREE.SphereGeometry(type.size, 16, 12);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    enemyGroup.add(bodyMesh);

    // Add simple "eyes" (cones)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.ConeGeometry(type.size * 0.15, type.size * 0.3, 8);

    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    eye1.position.set(type.size * 0.6, type.size * 0.3, type.size * 0.7); // Position relative to body center
    eye1.rotation.x = Math.PI / 2; // Point forward-ish
    enemyGroup.add(eye1);

    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye2.position.set(-type.size * 0.6, type.size * 0.3, type.size * 0.7);
    eye2.rotation.x = Math.PI / 2;
    enemyGroup.add(eye2);
    // ------------------------------------

    // Movement/Shooting Data
    enemyGroup.userData.initialPosition = new THREE.Vector3();
    enemyGroup.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3, 0);
    enemyGroup.userData.oscillationSpeed = TARGET_BASE_SPEED * type.speedFactor;
    enemyGroup.userData.oscillationAmplitude = 0.1 + type.points * 0.005;
    enemyGroup.userData.shootInterval = THREE.MathUtils.randFloat(TARGET_MIN_SHOOT_INTERVAL, TARGET_MAX_SHOOT_INTERVAL) / type.shootIntervalFactor; // Type affects interval
    enemyGroup.userData.timeSinceLastShot = Math.random() * enemyGroup.userData.shootInterval; // Random initial delay

    return enemyGroup;
}

function getEnemySpawnList(round) {
    const spawnList = [];
    // Simple scaling: More enemies each round, introduce tougher ones later
    const baseGruntCount = 3 + round * 2;
    const baseShooterCount = 1 + Math.floor(round * 1.5);
    const baseBruteCount = Math.floor(round / 2); // Brutes appear from round 2

    for (let i = 0; i < baseGruntCount; i++) spawnList.push('grunt');
    for (let i = 0; i < baseShooterCount; i++) spawnList.push('shooter');
    if (round >= 2) {
        for (let i = 0; i < baseBruteCount; i++) spawnList.push('brute');
    }

    // Clamp total enemies to avoid overwhelming (adjust MAX_ENEMIES_ON_SCREEN)
    return spawnList.slice(0, MAX_ENEMIES_ON_SCREEN);
}

function spawnEnemies(spawnList) {
    console.log(`Spawning ${spawnList.length} enemies for round ${currentRound}`);
    enemiesRemainingInRound = spawnList.length;

    spawnList.forEach(enemyTypeKey => {
        const enemy = createEnemy(enemyTypeKey);
        if (enemy) {
            // Find a valid spawn position (simple random for now)
            const angle = Math.random() * Math.PI * 2;
            const radius = 4 + Math.random() * (TARGET_AREA_RADIUS - 4); // Spawn further out
            const x = Math.cos(angle) * radius;
            const z = THREE.MathUtils.clamp(-Math.abs(Math.sin(angle) * radius), TARGET_BOUNDS.zMin, TARGET_BOUNDS.zMax);
            const y = THREE.MathUtils.clamp(1.0 + Math.random() * (TARGET_AREA_HEIGHT - 1.0), TARGET_BOUNDS.yMin, TARGET_BOUNDS.yMax); // Spawn higher generally

            enemy.position.set(x, y, z);
            enemy.userData.initialPosition.copy(enemy.position);
            enemy.lookAt(camera.position); // Initial look at player
            scene.add(enemy);
            enemies.push(enemy);
        }
    });
    updateScoreDisplay(); // Update enemies remaining count
}

function cleanupEnemy(enemy) {
    if (!enemy) return;
    scene.remove(enemy);
    // Dispose geometry and materials of all children
    enemy.traverse(child => {
        if (child.isMesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.map?.dispose()); // Dispose textures
                child.material.forEach(m => m.dispose());
            } else if (child.material) {
                child.material.map?.dispose(); // Dispose texture
                child.material.dispose();
            }
        }
        // Remove sounds attached? (PositionalAudio cleanup)
        if (child.isPositionalAudio) {
            child.stop();
            if (child.parent) child.parent.remove(child);
            child.disconnect();
        }
    });
    console.log("Cleaned up enemy:", enemy.uuid);
}

function cleanupAllEnemies() {
    console.log("Cleaning up all enemies...");
    // Iterate backwards for safe removal from array
    for (let i = enemies.length - 1; i >= 0; i--) {
        cleanupEnemy(enemies[i]);
    }
    enemies.length = 0; // Clear the array
}

function cleanupAllProjectiles() {
     console.log("Cleaning up all projectiles...");
     projectiles.forEach(p => { scene.remove(p); p.geometry?.dispose(); p.material?.dispose(); });
     projectiles.length = 0;
}

// --- Enemy Update & Shooting Logic ---
function updateEnemies(deltaTime) {
     if (isPaused || isGameOver) return;
    const cameraPosition = camera.position;

    enemies.forEach(enemy => {
        // --- Movement ---
        const speed = enemy.userData.oscillationSpeed; const amplitude = enemy.userData.oscillationAmplitude; const time = clock.getElapsedTime();
        const offsetX = Math.sin(time * speed) * amplitude; const offsetY = Math.cos(time * speed * 0.8) * amplitude * 0.5;
        enemy.userData.initialPosition.add(enemy.userData.velocity.clone().multiplyScalar(deltaTime));
        enemy.position.x = enemy.userData.initialPosition.x + offsetX; enemy.position.y = enemy.userData.initialPosition.y + offsetY; enemy.position.z = enemy.userData.initialPosition.z;
        // Keep enemy looking at player (optional, can be performance intensive)
        // enemy.lookAt(cameraPosition);

        // Bounce... (Identical bounds check)
        if (enemy.position.x > TARGET_BOUNDS.x || enemy.position.x < -TARGET_BOUNDS.x) { enemy.userData.velocity.x *= -1; enemy.position.x = THREE.MathUtils.clamp(enemy.position.x, -TARGET_BOUNDS.x, TARGET_BOUNDS.x); enemy.userData.initialPosition.x = enemy.position.x - offsetX; }
        if (enemy.position.y > TARGET_BOUNDS.yMax || enemy.position.y < TARGET_BOUNDS.yMin) { enemy.userData.velocity.y *= -1; enemy.position.y = THREE.MathUtils.clamp(enemy.position.y, TARGET_BOUNDS.yMin, TARGET_BOUNDS.yMax); enemy.userData.initialPosition.y = enemy.position.y - offsetY; }

        // --- Shooting ---
        enemy.userData.timeSinceLastShot += deltaTime;
        if (enemy.userData.timeSinceLastShot >= enemy.userData.shootInterval) {
            enemyShoot(enemy, cameraPosition);
            enemy.userData.timeSinceLastShot = 0;
            enemy.userData.shootInterval = THREE.MathUtils.randFloat(TARGET_MIN_SHOOT_INTERVAL, TARGET_MAX_SHOOT_INTERVAL) / enemy.userData.type.shootIntervalFactor;
        }
    });
}

function enemyShoot(enemy, playerPosition) {
    // console.log(`${enemy.userData.type.name} shooting!`); // Less console spam
    const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 8, 8);
    const projectileMat = new THREE.MeshBasicMaterial({ color: 0xcc0000 }); // Darker Red
    const projectile = new THREE.Mesh(projectileGeo, projectileMat);

    // Start projectile slightly in front of enemy
    const startPos = new THREE.Vector3();
    enemy.getWorldPosition(startPos);
    const direction = playerPosition.clone().sub(startPos).normalize();
    startPos.addScaledVector(direction, ENEMY_SHOOT_OFFSET); // Offset start position
    projectile.position.copy(startPos);

    projectile.userData = {
        direction: direction,
        speed: enemy.userData.type.projectileSpeed || PROJECTILE_SPEED, // Use type speed or default
        originTime: clock.getElapsedTime()
    };

    projectiles.push(projectile);
    scene.add(projectile);

    // Play enemy shoot sound (Optional)
    if (enemyShootSoundBuffer && audioListener) {
         const sound = new THREE.PositionalAudio(audioListener);
         sound.setBuffer(enemyShootSoundBuffer);
         sound.setRefDistance(10);
         sound.setVolume(0.4);
         enemy.add(sound); // Attach to enemy
         sound.play();
         sound.onEnded = () => { if (sound.parent === enemy) enemy.remove(sound); sound.disconnect(); };
     }
}

// --- Projectile Update & Hit Detection ---
function updateProjectiles(deltaTime) { /* ... (Identical logic) ... */
     if (isPaused || isGameOver) return; const cameraPosition = camera.position; const origin = new THREE.Vector3(0,0,0);
     for (let i = projectiles.length - 1; i >= 0; i--) { const projectile = projectiles[i]; const moveDistance = projectile.userData.speed * deltaTime; projectile.position.addScaledVector(projectile.userData.direction, moveDistance);
         if (projectile.position.distanceTo(cameraPosition) < PLAYER_HIT_RADIUS) { playerHit(); scene.remove(projectile); projectile.geometry?.dispose(); projectile.material?.dispose(); projectiles.splice(i, 1); continue; }
         if (projectile.position.distanceTo(origin) > PROJECTILE_MAX_DIST) { console.log("Projectile out of bounds"); scene.remove(projectile); projectile.geometry?.dispose(); projectile.material?.dispose(); projectiles.splice(i, 1); continue; }
     }
 }

// --- Round Management ---
function startNextRound() {
    currentRound++;
    console.log(`Starting Round ${currentRound}`);
    isIntermission = false;
    timeUntilNextRound = 0;

    // Determine enemies for this round
    const spawnList = getEnemySpawnList(currentRound);
    spawnEnemies(spawnList);

    updateScoreDisplay(); // Update round display
}

function startIntermission() {
    console.log(`Round ${currentRound} ended. Intermission started.`);
    isIntermission = true;
    timeUntilNextRound = intermissionDuration;
    updateScoreDisplay(); // Show intermission message
}

function updateIntermission(deltaTime) {
    if (!isIntermission || isPaused || isGameOver) return;

    timeUntilNextRound -= deltaTime;
    updateScoreDisplay(); // Update countdown on UI

    if (timeUntilNextRound <= 0) {
        startNextRound();
    }
}


// --- Wrist UI Logic ---
function createWristUi() { /* ... (Identical creation) ... */ wristUiGroup = new THREE.Group(); wristUiCanvas = document.createElement('canvas'); wristUiCanvas.width = WRIST_UI_WIDTH; wristUiCanvas.height = WRIST_UI_HEIGHT; wristUiContext = wristUiCanvas.getContext('2d'); wristUiTexture = new THREE.CanvasTexture(wristUiCanvas); wristUiTexture.needsUpdate = true; wristUiMaterial = new THREE.MeshBasicMaterial({ map: wristUiTexture, transparent: true, alphaTest: 0.05 }); const wristUiGeometry = new THREE.PlaneGeometry(WRIST_UI_PLANE_WIDTH, WRIST_UI_PLANE_HEIGHT); wristUiPlane = new THREE.Mesh(wristUiGeometry, wristUiMaterial); wristUiGroup.add(wristUiPlane); wristUiGroup.visible = false; }
function attachWristUi(controller) { /* ... (Identical attachment) ... */ wristUiGroup.position.set(0, 0.05, 0.05); wristUiGroup.rotation.set(-Math.PI * 0.4, 0, 0); controller.add(wristUiGroup); }

function updateWristUiDisplay() { // Updated to show all game state
    if (!wristUiContext || !wristUiTexture) return;
    const ctx = wristUiContext; const W = WRIST_UI_WIDTH; const H = WRIST_UI_HEIGHT;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, W, H); // Clear background

    if (isPaused) {
        drawPauseMenuOnWrist(ctx, W, H); // Draw pause/debug menu
    } else if (isGameOver) { // Draw game over screen
        ctx.fillStyle = 'red'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold 40px Arial'; ctx.fillText(`GAME OVER`, W / 2, H * 0.25);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial'; ctx.fillText(`Round: ${currentRound}`, W / 2, H * 0.55);
        ctx.font = 'bold 32px Arial'; ctx.fillText(`Score: ${score}`, W / 2, H * 0.8);
    } else if (isIntermission) { // Draw intermission screen
         ctx.fillStyle = 'cyan'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
         ctx.font = 'bold 36px Arial'; ctx.fillText(`Round ${currentRound} Complete!`, W / 2, H * 0.3);
         ctx.fillStyle = 'white';
         ctx.font = 'bold 32px Arial'; ctx.fillText(`Next Round: ${Math.ceil(timeUntilNextRound)}s`, W / 2, H * 0.7);
    } else { // Draw regular gameplay HUD
        ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const healthBarWidth = W * 0.9;
        const healthBarHeight = 25;
        const healthPerc = playerHealth / MAX_PLAYER_HEALTH;
        const currentHealthWidth = healthBarWidth * healthPerc;
        const healthY = 15;
        const textYOffset = 30; // Space below health bar

        // Health Bar Background
        ctx.fillStyle = '#555';
        ctx.fillRect((W - healthBarWidth) / 2, healthY, healthBarWidth, healthBarHeight);
        // Health Bar Fill
        ctx.fillStyle = healthPerc > 0.5 ? '#00ff00' : (healthPerc > 0.2 ? '#ffff00' : '#ff0000'); // Green/Yellow/Red
        ctx.fillRect((W - healthBarWidth) / 2, healthY, currentHealthWidth, healthBarHeight);
        // Health Text
        ctx.fillStyle = 'white'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${playerHealth}/${MAX_PLAYER_HEALTH}`, W / 2, healthY + healthBarHeight / 2);

        // Other Info
        ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const lineH = 30; let textY = healthY + healthBarHeight + 10;
        ctx.fillText(`Score: ${score}`, 15, textY);
        ctx.fillText(`Round: ${currentRound}`, 15, textY + lineH);
        ctx.fillText(`Enemies: ${enemiesRemainingInRound}`, 15, textY + lineH * 2);

        ctx.textAlign = 'right';
        ctx.fillText(`Time: ${formatTime(gameTimeRemaining)}`, W - 15, textY);
    }
    wristUiTexture.needsUpdate = true;
}

function drawPauseMenuOnWrist(ctx, W, H) { // Updated with Log Offset and revised debug controls
    const gunData = guns[currentGunIndex];
    ctx.fillStyle = 'white'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    let yPos = 10; const lineH = 26; const indent = 20; const highlightColor = '#80DEEA';
    const instructionFontSize = 16; const menuFontSize = 22; const valueFontSize = 18;

    ctx.font = `bold ${menuFontSize+2}px Arial`;
    ctx.fillText(debugModeActive ? `Debug: ${gunData.name}` : "Paused", indent, yPos); yPos += lineH * 1.3;

    ctx.font = `${instructionFontSize}px Arial`;
    const instructionY = yPos;
    if (debugModeActive) {
        ctx.fillText("UI Trigger: Activate Selected", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("Gun Trig(Cycle Dn)/Sq(Cycle Up)", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("Gun Sq: Decrement Rot (when selected)", indent, yPos);
    } else {
        ctx.fillText("UI Squeeze: Resume", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("Gun Trig/Sq: Cycle Menu", indent, yPos); yPos += lineH * 0.8;
        ctx.fillText("UI Trigger: Select", indent, yPos);
    }

    yPos = instructionY + lineH * 3.5;
    ctx.font = `bold ${menuFontSize}px Arial`;

    if (debugModeActive) { // Draw Debug Adjustment Options
        const debugItemLabels = {
            rotX: `Rot X: ${activeGunObject ? radToDeg(activeGunObject.rotation.x) : '?'}°`,
            rotY: `Rot Y: ${activeGunObject ? radToDeg(activeGunObject.rotation.y) : '?'}°`,
            rotZ: `Rot Z: ${activeGunObject ? radToDeg(activeGunObject.rotation.z) : '?'}°`,
            scaleUp: `Scale + (${activeGunObject ? activeGunObject.scale.x.toFixed(3) : '?'})`,
            scaleDown: `Scale - (${activeGunObject ? activeGunObject.scale.x.toFixed(3) : '?'})`,
            exitDebug: "Exit Debug Tools"
        };
        DEBUG_MENU_ITEMS.forEach(key => {
            ctx.fillStyle = (selectedDebugItem === key) ? highlightColor : 'white';
            ctx.fillText(`> ${debugItemLabels[key]}`, indent, yPos); yPos += lineH;
        });
    } else { // Draw Main Pause Menu Items
        const menuItems = { logOffsets: 'Log Gun Offsets', debug: 'Debug Tools', restart: 'Restart Game', quit: 'Quit Session' };
        Object.entries(menuItems).forEach(([key, text]) => {
            ctx.fillStyle = (selectedPauseMenuItem === key) ? highlightColor : 'white';
            ctx.fillText(`> ${text}`, indent, yPos); yPos += lineH;
        });
    }
}

function checkWristUiVisibility(controller) { /* ... (Identical) ... */ if (!controller || !wristUiGroup) return; if (isPaused) { wristUiGroup.visible = true; return; } const controllerQuaternion = controller.getWorldQuaternion(new THREE.Quaternion()); const controllerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(controllerQuaternion); const angleWithWorldDown = controllerForward.angleTo(new THREE.Vector3(0, -1, 0)); const minAngle = Math.PI * 0.3; const maxAngle = Math.PI * 0.7; wristUiGroup.visible = (angleWithWorldDown > minAngle && angleWithWorldDown < maxAngle); }
// --- Score Display Update ---
function updateScoreDisplay() { scoreDisplay.textContent = 'Score: ' + score; updateWristUiDisplay(); }
// --- Utilities ---
function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

// --- Render Loop ---
function render() {
    const deltaTime = clock.getDelta();
    if (!clock.running && !isPaused && !isGameOver && xrSession) { clock.start(); } // Auto-restart clock

    // Timer/Game Over Logic
    if (!isPaused && !isGameOver && clock.running) {
        gameTimeRemaining -= deltaTime;
        if (gameTimeRemaining <= 0) {
            gameTimeRemaining = 0; isGameOver = true; console.log("Game Over - Time Ran Out!"); if(clock.running) clock.stop(); updateWristUiDisplay();
        }
    }

    // Intermission Logic
    if (isIntermission && !isPaused && !isGameOver) {
        updateIntermission(deltaTime);
    }

    // Update game elements only if playing (not paused, not game over, not intermission)
    if (!isPaused && !isGameOver && !isIntermission) {
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
    }

    checkWristUiVisibility(getUiController()); // Always check visibility
    updateWristUiDisplay(); // Always update wrist UI content

    renderer.render(scene, camera);
}

// --- Start ---
loadAssets(); // Initiate loading