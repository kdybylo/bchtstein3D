// ============================================================
//  Moje střílečka – hlavní soubor hry
//  Umí: mřížkovou mapu s texturami, chůzi (WASD) a rozhlížení myší,
//  střílení, nepřátele se životy, kteří tě honí, zvuky (Web Audio),
//  HUD (životy + zabití), výhru/prohru.
//  Vše je bohatě okomentované, ať víš, co která část dělá.
// ============================================================

import * as THREE from 'three';

// ------------------------------------------------------------
// 1) ZÁKLAD SCÉNY: scéna, kamera (oči hráče), renderer (kreslič)
// ------------------------------------------------------------

// Scéna = 3D svět, do kterého vkládáme objekty
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14141c); // tmavé pozadí (uvnitř budovy)
scene.fog = new THREE.Fog(0x14141c, 8, 45);   // vzdálené chodby se ztrácejí ve tmě

// Bezpečné rozměry okna (kdyby prohlížeč hlásil 0, použijeme rozumnou náhradu),
// jinak by poměr stran vyšel neplatně a rozbil by se výpočet výstřelu.
function viewSize() {
  return { w: window.innerWidth || 1280, h: window.innerHeight || 720 };
}

// Kamera = odkud a jak se do světa díváme (naše "oči")
// (zorný úhel 75°, poměr stran okna, blízká a vzdálená mez viditelnosti)
const camera = new THREE.PerspectiveCamera(75, viewSize().w / viewSize().h, 0.1, 1000);
camera.position.set(0, 1.7, 5); // výška ~1,7 m (jako oči člověka)

// Renderer = to, co scénu vykreslí na obrazovku
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewSize().w, viewSize().h);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true; // povolíme stíny
document.body.appendChild(renderer.domElement);

// Kameru přidáme do scény, aby se s ní vykreslila i zbraň (bude její "potomek")
scene.add(camera);

// ------------------------------------------------------------
// 2) SVĚTLA: bez světla by byla scéna černá
// ------------------------------------------------------------

// Rozptýlené světlo (jemně nasvítí vše, aby nebyly úplné černé stíny)
scene.add(new THREE.AmbientLight(0xffffff, 0.85));

// Směrové světlo = jako slunce, vrhá stíny
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// ------------------------------------------------------------
// 3) MAPA: level poskládaný z mřížky.
//    #=zeď, .=podlaha (volno), P=start hráče, E=nepřítel.
//    Mapu si klidně uprav – jen ať mají všechny řádky STEJNOU délku
//    a celý okraj je ze stěn (#), aby se nedalo vypadnout ven.
// ------------------------------------------------------------

const CELL = 4;    // velikost jedné buňky mřížky (metry)
const WALL_H = 4;  // výška stěn

const MAP = [
  "################",
  "#P....#........#",
  "#.....#........#",
  "#.....#...E....#",
  "#.....#........#",
  "#.....####.#####",
  "#.........#....#",
  "#....E....#.E..#",
  "#.........#....#",
  "####.######....#",
  "#....#....#....#",
  "#..E.#.E..#..E.#",
  "#....#....#....#",
  "#....#....#....#",
  "################",
];

const ROWS = MAP.length;
const COLS = MAP[0].length;

// Převod pozice v mřížce na souřadnice ve světě (mapu vycentrujeme na střed)
function cellToWorldX(col) { return (col - (COLS - 1) / 2) * CELL; }
function cellToWorldZ(row) { return (row - (ROWS - 1) / 2) * CELL; }

// --- Textury nakreslené přímo v kódu (žádné stahování obrázků) ---

// Cihlová zeď
function makeBrickTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#5a5148';                 // malta (spáry mezi cihlami)
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#8a4b3a';                 // barva cihly
  const bw = 60, bh = 28, gap = 4;
  let row = 0;
  for (let y = 0; y < 128; y += bh + gap, row++) {
    const offset = (row % 2) ? -(bw + gap) / 2 : 0; // každá druhá řada posunutá
    for (let x = offset; x < 128; x += bw + gap) {
      g.fillRect(x, y, bw, bh);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Tovární stěna: velké betonové panely, spáry a jemné stopy stáří.
function makeFactoryTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');

  g.fillStyle = '#666b6c';
  g.fillRect(0, 0, c.width, c.height);

  // Nepravidelné odstíny dodají betonu živější, trochu oprýskaný vzhled.
  for (let i = 0; i < 450; i++) {
    const shade = 82 + Math.floor(Math.random() * 28);
    g.fillStyle = `rgba(${shade}, ${shade + 3}, ${shade + 3}, ${0.05 + Math.random() * 0.1})`;
    const size = 1 + Math.random() * 5;
    g.fillRect(Math.random() * 256, Math.random() * 256, size, size);
  }

  // Spáry mezi prefabrikovanými betonovými panely.
  g.strokeStyle = '#373c3e';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 0); g.lineTo(128, 256);
  g.moveTo(0, 86); g.lineTo(256, 86);
  g.moveTo(0, 172); g.lineTo(256, 172);
  g.stroke();
  g.strokeStyle = 'rgba(190, 195, 190, 0.22)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(131, 0); g.lineTo(131, 256);
  g.moveTo(0, 89); g.lineTo(256, 89);
  g.moveTo(0, 175); g.lineTo(256, 175);
  g.stroke();

  // Kovové kotvy v rozích panelů.
  g.fillStyle = '#303638';
  for (const x of [10, 118, 138, 246]) {
    for (const y of [10, 76, 96, 162, 182, 246]) {
      g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

// Dlaždicová podlaha
function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#25282e';                 // tmavá spára
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#40454d';                 // dlaždice
  g.fillRect(4, 4, 120, 120);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(COLS, ROWS);              // jedna dlaždice na každou buňku
  return tex;
}

const brickTexture = makeBrickTexture();
const factoryTexture = makeFactoryTexture();
const floorTexture = makeFloorTexture();

// Podlaha (jedna velká deska přes celou mapu)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL),
  new THREE.MeshStandardMaterial({ map: floorTexture })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Strop
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(COLS * CELL, ROWS * CELL),
  new THREE.MeshStandardMaterial({ color: 0x202028 })
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.y = WALL_H;
scene.add(ceiling);

// Objekty pro střelbu (paprsek) a pro kolize (neprůchodnost)
const shootables = [floor];
const obstacles = [];

// Nízké objekty se chovají jako skutečné kryty: zastaví hráče i střelu.
function addCover(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  mesh.updateMatrixWorld(true);
  obstacles.push(new THREE.Box3().setFromObject(mesh));
  shootables.push(mesh);
  return mesh;
}

// Vytvoří jednu zeď (buňku mřížky) na daných světových souřadnicích
const wallMaterial = new THREE.MeshStandardMaterial({ map: brickTexture });
function makeWall(x, z) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallMaterial);
  box.position.set(x, WALL_H / 2, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  box.updateMatrixWorld(true);
  obstacles.push(new THREE.Box3().setFromObject(box));
  shootables.push(box);
}

// Projdeme mapu: postavíme stěny a zapamatujeme si start hráče + pozice nepřátel
const enemySpawns = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const ch = MAP[row][col];
    const x = cellToWorldX(col);
    const z = cellToWorldZ(row);
    if (ch === '#') {
      makeWall(x, z);
    } else if (ch === 'P') {
      camera.position.set(x, 1.7, z); // sem postavíme hráče
    } else if (ch === 'E') {
      enemySpawns.push({ x, z });
    }
  }
}

// Tovární část: dva pásy, bedny a kovové kryty mezi kterými lze bojovat.
const metal = new THREE.MeshStandardMaterial({ color: 0x3c474c, metalness: 0.65, roughness: 0.45 });
const belt = new THREE.MeshStandardMaterial({ color: 0x171a1b, metalness: 0.25, roughness: 0.8 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6c482d, roughness: 0.9 });
function addFactoryBelt(x, z, length, rotation = 0) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(length, 0.55, 1.05), belt);
  body.position.y = 0.82; group.add(body);
  for (const offset of [-length / 2 + 0.35, length / 2 - 0.35]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.4, 0.82), metal);
    leg.position.set(offset, 0.45, 0); group.add(leg);
  }
  group.position.set(x, 0, z); group.rotation.y = rotation;
  addCover(group);
}
function addCrateStack(x, z, height = 1) {
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2 * height, 1.3), wood);
  crate.position.set(x, 0.6 * height, z);
  addCover(crate);
}
function addHouseFurniture(x, z) {
  // Sedačka, stůl a skříň vytvářejí kryt v "domácí" části mapy.
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 0.7), new THREE.MeshStandardMaterial({ color: 0x673d35, roughness: 0.95 }));
  sofa.position.set(x, 0.43, z); addCover(sofa);
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 1.1), wood);
  table.position.set(x + 2.1, 0.36, z + 0.4); addCover(table);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 1.5), new THREE.MeshStandardMaterial({ color: 0x4b3022, roughness: 0.85 }));
  cabinet.position.set(x - 1.9, 0.9, z - 0.2); addCover(cabinet);
}
addFactoryBelt(4, -6, 5.5);
addFactoryBelt(12, -2, 5.5);
addCrateStack(8, 6, 2);
addCrateStack(-8, 14);
addHouseFurniture(-18, 10);
addHouseFurniture(18, 14);

// ------------------------------------------------------------
// 4) OVLÁDÁNÍ: klávesnice+myš NEBO dotyk (mobil) – hráč si vybere na startu
// ------------------------------------------------------------

const overlay = document.getElementById('overlay');

// "yaw" = otáčení doleva/doprava, "pitch" = nahoru/dolů
let yaw = Math.PI; // otočíme hráče čelem do mapy (ne do rohové stěny)
let pitch = 0;

let gameOver = false;      // true po výhře/prohře – zastaví hru
let controlMode = null;    // 'keyboard' | 'touch' – zvolí se na startu
let touchStarted = false;  // v dotykovém režimu: hra běží

// Telefon na výšku? (tam se hrát nedá – vyzveme k otočení)
function isPortrait() { return window.innerHeight > window.innerWidth; }

// Hrajeme právě teď? (rozhoduje podle zvoleného režimu)
function isPlaying() {
  if (gameOver) return false;
  if (controlMode === 'touch') return touchStarted && !isPortrait();
  if (controlMode === 'keyboard') return document.pointerLockElement === renderer.domElement;
  return false;
}

// Omezení pohledu nahoru/dolů, ať se hráč nepřetočí
function clampPitch() {
  const limit = Math.PI / 2 - 0.05;
  pitch = Math.max(-limit, Math.min(limit, pitch));
}

// --- Výběr ovládání na úvodní obrazovce ---
const btnKeyboard = document.getElementById('btn-keyboard');
const btnTouch = document.getElementById('btn-touch');
const btnWallsBrick = document.getElementById('btn-walls-brick');
const btnWallsFactory = document.getElementById('btn-walls-factory');
const difficultyButtons = {
  easy: document.getElementById('btn-difficulty-easy'),
  normal: document.getElementById('btn-difficulty-normal'),
  medium: document.getElementById('btn-difficulty-medium'),
  hard: document.getElementById('btn-difficulty-hard'),
};
const modeButtons = {
  survival: document.getElementById('btn-mode-survival'),
  career: document.getElementById('btn-mode-career'),
};
let gameMode = 'survival';

function selectGameMode(mode) {
  gameMode = mode;
  for (const [name, button] of Object.entries(modeButtons)) {
    button.classList.toggle('selected', name === mode);
  }
  // Funkce je volaná z tlačítka až po načtení celé stránky.
  if (typeof updatePlayerWeapon === 'function') updatePlayerWeapon();
}
for (const [name, button] of Object.entries(modeButtons)) {
  button.addEventListener('click', () => selectGameMode(name));
}

// Easy zachovává kreslené figurky. Ostatní obtížnosti používají ozbrojené 3D vojáky.
let difficulty = 'easy';
function selectDifficulty(selected) {
  difficulty = selected;
  for (const [name, button] of Object.entries(difficultyButtons)) {
    button.classList.toggle('selected', name === selected);
  }
  // Dokud hra nezačala, ihned vyměníme ukázané nepřátele za vybranou variantu.
  if (!controlMode) {
    for (const enemy of enemies) scene.remove(enemy.sprite);
    enemies.length = 0;
    for (const spawn of enemySpawns) spawnEnemy(spawn.x, spawn.z, difficulty);
    updateHud();
  }
}
for (const [name, button] of Object.entries(difficultyButtons)) {
  button.addEventListener('click', () => selectDifficulty(name));
}

// Výchozí varianta zachovává původní cihlovou zeď.
function selectWallStyle(style) {
  const factory = style === 'factory';
  wallMaterial.map = factory ? factoryTexture : brickTexture;
  wallMaterial.needsUpdate = true;
  btnWallsBrick.classList.toggle('selected', !factory);
  btnWallsFactory.classList.toggle('selected', factory);
}

btnWallsBrick.addEventListener('click', () => selectWallStyle('brick'));
btnWallsFactory.addEventListener('click', () => selectWallStyle('factory'));

// Podle zařízení předvybereme (zvýrazníme) doporučenou volbu
const isTouchDevice = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
(isTouchDevice ? btnTouch : btnKeyboard).classList.add('recommended');

btnKeyboard.addEventListener('click', () => {
  controlMode = 'keyboard';
  document.body.classList.remove('touch-mode');
  initAudio();
  renderer.domElement.requestPointerLock(); // překryv schová pointerlockchange
});

btnTouch.addEventListener('click', () => {
  controlMode = 'touch';
  document.body.classList.add('touch-mode');
  initAudio();
  touchStarted = true;
  overlay.classList.add('hidden');
  updatePortraitClass();
});

// Po konci hry: kliknutí kamkoli na překryv = restart (znovunačtení stránky)
overlay.addEventListener('click', () => {
  if (gameOver) location.reload();
});

// Když se myš zamkne/odemkne (jen klávesnicový režim), ukážeme/schováme překryv
document.addEventListener('pointerlockchange', () => {
  if (controlMode !== 'keyboard') return;
  const locked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', locked);
});

// Konec hry – ukáže zprávu; kliknutím se hra restartuje
function endGame(message) {
  if (gameOver) return;
  gameOver = true;
  document.exitPointerLock();
  document.body.classList.remove('touch-mode'); // schovat dotykové ovladače
  overlay.innerHTML = '<h1>' + message + '</h1><p>Klikni pro nový pokus</p>';
  overlay.classList.remove('hidden');
}

// --- Klávesnice + myš ---
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; });
document.addEventListener('keyup',   (e) => { keys[e.code] = false; });
let isCrouching = false;

document.addEventListener('mousemove', (e) => {
  if (controlMode !== 'keyboard') return;
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw   -= e.movementX * 0.0025;
  pitch -= e.movementY * 0.0025;
  clampPitch();
});

// --- Dotyk (mobil): levý joystick = chůze, tažení vpravo = rozhlížení, tlačítko = střelba ---
const joystickEl = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystick-knob');
const fireBtn = document.getElementById('fire-btn');

const joyVec = { x: 0, z: 0 }; // výchylka joysticku (-1..1), z = dopředu
let touchFiring = false;       // drží se tlačítko střelby?
let fireCooldown = 0;          // prodleva mezi výstřely při držení

const touchRoles = {};         // identifier prstu -> { role, lastX, lastY }
const LOOK_SENS = 0.005;
const JOY_R = 50;              // poloměr joysticku (px)

function inRect(t, el, pad = 0) {
  const r = el.getBoundingClientRect();
  return t.clientX >= r.left - pad && t.clientX <= r.right + pad &&
         t.clientY >= r.top - pad && t.clientY <= r.bottom + pad;
}

function updateJoystick(t) {
  const r = joystickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / JOY_R;
  joyVec.z = -dy / JOY_R; // prst nahoru = dopředu
}

function resetJoystick() {
  joystickKnob.style.transform = 'translate(0, 0)';
  joyVec.x = 0; joyVec.z = 0;
}

document.addEventListener('touchstart', (e) => {
  if (controlMode !== 'touch') return;
  for (const t of e.changedTouches) {
    if (inRect(t, fireBtn, 10)) {
      touchRoles[t.identifier] = { role: 'fire' };
      touchFiring = true; fireCooldown = 0;
    } else if (inRect(t, joystickEl, 40)) {
      touchRoles[t.identifier] = { role: 'move' };
      updateJoystick(t);
    } else if (t.clientX > window.innerWidth / 2) {
      touchRoles[t.identifier] = { role: 'look', lastX: t.clientX, lastY: t.clientY };
    }
  }
  e.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
  if (controlMode !== 'touch') return;
  for (const t of e.changedTouches) {
    const info = touchRoles[t.identifier];
    if (!info) continue;
    if (info.role === 'move') {
      updateJoystick(t);
    } else if (info.role === 'look') {
      yaw   -= (t.clientX - info.lastX) * LOOK_SENS;
      pitch -= (t.clientY - info.lastY) * LOOK_SENS;
      clampPitch();
      info.lastX = t.clientX; info.lastY = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });

function onTouchEnd(e) {
  for (const t of e.changedTouches) {
    const info = touchRoles[t.identifier];
    if (!info) continue;
    if (info.role === 'move') resetJoystick();
    else if (info.role === 'fire') touchFiring = false;
    delete touchRoles[t.identifier];
  }
}
document.addEventListener('touchend', onTouchEnd);
document.addEventListener('touchcancel', onTouchEnd);

// Přepínání třídy 'portrait' (kvůli výzvě k otočení telefonu)
function updatePortraitClass() {
  document.body.classList.toggle('portrait', isPortrait());
}
window.addEventListener('orientationchange', updatePortraitClass);

// ------------------------------------------------------------
// 5) KOLIZE: nepustíme hráče skrz stěny/sloupy
// ------------------------------------------------------------

const PLAYER_RADIUS = 0.4; // hráč má "poloměr" ~40 cm

// Zjistí, jestli by daná pozice narazila do některé překážky
function collides(x, z) {
  for (const box of obstacles) {
    // Nejbližší bod obálky k hráči (v rovině X-Z)
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS) return true;
  }
  return false;
}

// ------------------------------------------------------------
// 5a) NEPŘÁTELÉ (ploché "sprity", které se vždy dívají na hráče)
// ------------------------------------------------------------

// Obrázek nepřítele si nakreslíme rovnou v kódu (na skrytou kreslicí plochu),
// takže nemusíme nic stahovat. Vytvoříme jednoduchou "příšerku".
function makeEnemyTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');

  // Tělo (kulaté, zelené)
  g.fillStyle = '#3aa655';
  g.beginPath();
  g.arc(64, 72, 46, 0, Math.PI * 2);
  g.fill();

  // Oči (bílé s černou zorničkou)
  for (const ex of [46, 82]) {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(ex, 60, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000';
    g.beginPath(); g.arc(ex, 62, 6, 0, Math.PI * 2); g.fill();
  }

  // Zlá ústa
  g.strokeStyle = '#000'; g.lineWidth = 5;
  g.beginPath(); g.arc(64, 100, 18, Math.PI, 0); g.stroke();

  // Výbava jasně ukazuje, jakou obtížnost sis vybral.
  if (kind === 'medium') {
    g.strokeStyle = '#c9a45b'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(96, 116); g.lineTo(114, 18); g.stroke();
    g.fillStyle = '#d7dde0';
    g.beginPath(); g.moveTo(114, 10); g.lineTo(106, 29); g.lineTo(120, 27); g.fill();
  } else if (kind === 'hard') {
    g.fillStyle = '#4a4f59';
    g.fillRect(86, 82, 35, 12);
    g.fillRect(105, 92, 9, 17);
    g.fillStyle = '#181b20'; g.fillRect(112, 85, 14, 5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; // ostré pixely (retro nádech)
  return tex;
}

const enemyTextures = {
  normal: makeEnemyTexture('normal'),
  medium: makeEnemyTexture('medium'),
  hard: makeEnemyTexture('hard'),
};

const enemySettings = {
  easy: { health: 2, speed: 1.45, touchRange: 1.7, touchDamage: 9, respawnMs: 5500 },
  normal: { health: 3, speed: 1.85, touchRange: 1.8, touchDamage: 12, respawnMs: 4800, gunRange: 11, gunDamage: 6, gunCooldown: 1.8 },
  medium: { health: 4, speed: 2.1, touchRange: 1.7, touchDamage: 14, respawnMs: 4200, gunRange: 14, gunDamage: 9, gunCooldown: 1.35 },
  hard: { health: 5, speed: 2.25, touchRange: 1.6, touchDamage: 16, respawnMs: 3800, gunRange: 17, gunDamage: 12, gunCooldown: 0.95 },
};

function makeEasyFigure() {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: enemyTextures.normal, transparent: true }));
  sprite.scale.set(1.65, 1.65, 1);
  // Kotva u nohou: figurka stojí na podlaze a neprochází jí.
  sprite.center.set(0.5, 0.08);
  sprite.position.y = 0.02;
  return { model: sprite, muzzle: null, simple: true };
}

// Jednoduchý, ale skutečně prostorový voják místo původního plochého obrázku.
function makeEnemySoldier(kind) {
  if (kind === 'easy') return makeEasyFigure();
  const model = new THREE.Group();
  const uniformColor = kind === 'hard' ? 0x354a58 : kind === 'medium' ? 0x55623f : 0x52634b;
  const uniform = new THREE.MeshStandardMaterial({ color: uniformColor, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb77d5c, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.65 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.75, 0.28), uniform);
  torso.position.y = 1.25; model.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), skin);
  head.position.y = 1.83; model.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  helmet.position.y = 1.9; model.add(helmet);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.2), dark);
    leg.position.set(side * 0.16, 0.43, 0); model.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.62, 0.16), uniform);
    arm.position.set(side * 0.37, 1.28, -0.05); arm.rotation.z = side * 0.2; model.add(arm);
  }

  // Voják drží pušku ve všech bojových režimech; Easy zůstává beze zbraně.
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.85), dark);
  rifle.position.set(0.35, 1.38, -0.42); rifle.rotation.x = Math.PI / 2; model.add(rifle);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: 0x4a3321 }));
  stock.position.set(0.35, 1.3, -0.18); model.add(stock);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffcc55 }));
  muzzle.position.set(0.35, 1.38, -0.9); muzzle.visible = false; model.add(muzzle);
  model.scale.setScalar(0.9);
  return { model, muzzle };
}

// Seznam živých nepřátel
const enemies = [];

// Vytvoří nepřítele na dané pozici
function spawnEnemy(x, z, kind = difficulty) {
  const { model, muzzle } = makeEnemySoldier(kind);
  model.position.set(x, 0, z);
  scene.add(model);

  const enemy = { sprite: model, muzzle, health: enemySettings[kind].health, kind, spawn: { x, z }, shotCooldown: 0 };
  // Paprsek může trefit libovolnou část těla i zbraně.
  model.traverse(part => { part.userData.enemyRef = enemy; });
  enemies.push(enemy);
  return enemy;
}

// Rozmístíme nepřátele podle značek 'E' v mapě
for (const s of enemySpawns) spawnEnemy(s.x, s.z);

// Pohyb nepřátel: každý jde k hráči (pomaleji než ty, dá se utéct).
// Používáme stejné kolize jako hráč, takže neprojdou zdí.
function moveEnemies(dt) {
  for (const e of enemies) {
    let dx = camera.position.x - e.sprite.position.x;
    let dz = camera.position.z - e.sprite.position.z;
    const dist = Math.hypot(dx, dz);
    if (!e.simple && dist > 0.01) e.sprite.rotation.y = Math.atan2(-dx, -dz);
    if (dist < 1.2 || dist === 0) continue; // už je u tebe – netlačí se dovnitř
    dx /= dist; dz /= dist;               // směr k hráči (délka 1)
    const step = enemySettings[e.kind].speed * dt;
    const nx = e.sprite.position.x + dx * step;
    const nz = e.sprite.position.z + dz * step;
    // Pohyb po osách zvlášť, ať kloužou podél stěn (neuvíznou)
    if (!collides(nx, e.sprite.position.z)) e.sprite.position.x = nx;
    if (!collides(e.sprite.position.x, nz)) e.sprite.position.z = nz;
  }
}

// --- Stav hráče a HUD (životy + počet zabitých) ---
let kills = 0;
let playerHealth = 100;
const healthEl = document.getElementById('hud-health');
const killsEl = document.getElementById('hud-kills');
const stanceEl = document.getElementById('hud-stance');

function updateHud() {
  if (healthEl) healthEl.textContent = '❤️ Životy: ' + Math.max(0, Math.ceil(playerHealth));
  if (killsEl) killsEl.textContent = '💀 Zabito: ' + kills + ' | Aktivních: ' + enemies.length;
  if (stanceEl) stanceEl.textContent = isCrouching ? '🛡️ Skrčený za krytem' : '';
}
updateHud();

function damageEnemy(enemy) {
  enemy.health -= 1;

  if (enemy.health <= 0) {
    // Mrtvý – odstraníme ze scény i ze seznamu
    scene.remove(enemy.sprite);
    const i = enemies.indexOf(enemy);
    if (i !== -1) enemies.splice(i, 1);
    kills += 1;
    updateHud();
    playEnemyDeath();
    // V Přežití se vrací. Kariéra je jednorázová mise, kterou lze vyhrát.
    const { x, z } = enemy.spawn;
    const kind = enemy.kind;
    if (gameMode === 'career' && enemies.length === 0) {
      endGame('🏆 Mise splněna! Vyčistil jsi továrnu i domy.');
    } else if (gameMode === 'survival') setTimeout(() => {
      if (!gameOver) {
        spawnEnemy(x, z, kind);
        updateHud();
      }
    }, enemySettings[kind].respawnMs);
  } else {
    // Zásah, ale žije – krátce zčervená jako zpětná vazba
    playEnemyHit();
    flashEnemy(enemy, 0xff5555, 120);
  }
}

function flashEnemy(enemy, color, duration) {
  const original = [];
  enemy.sprite.traverse(part => {
    if (part.material && part.material.color) {
      original.push([part.material, part.material.color.getHex()]);
      part.material.color.setHex(color);
    }
  });
  setTimeout(() => {
    if (!enemy.sprite.parent) return;
    for (const [material, originalColor] of original) material.color.setHex(originalColor);
  }, duration);
}

// ------------------------------------------------------------
// 5b) ZBRAŇ + STŘÍLENÍ
// ------------------------------------------------------------

// --- Model kariérní pušky připnutý ke kameře v pravé dolní části ---
const gun = new THREE.Group();

const gunBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.18, 0.18, 0.82),
  new THREE.MeshStandardMaterial({ color: 0x273036, metalness: 0.65, roughness: 0.42 })
);
gunBody.position.set(0, 0, -0.2);
gun.add(gunBody);

// Hlaveň
const gunBarrel = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.035, 0.72),
  new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.75 })
);
gunBarrel.rotation.x = Math.PI / 2; // otočíme dopředu
gunBarrel.position.set(0, 0.05, -0.92);
gun.add(gunBarrel);

const gunStock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.42), new THREE.MeshStandardMaterial({ color: 0x5b3925, roughness: 0.8 }));
gunStock.position.set(0, -0.03, 0.28); gun.add(gunStock);
const gunScope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34), new THREE.MeshStandardMaterial({ color: 0x101418, metalness: 0.8 }));
gunScope.rotation.x = Math.PI / 2; gunScope.position.set(0, 0.15, -0.32); gun.add(gunScope);

// Umístění zbraně vůči kameře: kousek doprava, dolů a dopředu
gun.position.set(0.25, -0.25, -0.6);
camera.add(gun); // připneme ke kameře, ať se hýbe s pohledem

// Výšleh z hlavně (malá žlutá "koule", normálně schovaná)
const muzzleFlash = new THREE.Mesh(
  new THREE.SphereGeometry(0.08, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffdd55 })
);
muzzleFlash.position.set(0, 0.05, -1.3);
muzzleFlash.visible = false;
gun.add(muzzleFlash);

// Zbraň z předchozí hry je výhradně odměnou za volbu Kariéra.
function updatePlayerWeapon() {
  gun.visible = gameMode === 'career';
  if (fireBtn) fireBtn.style.opacity = gameMode === 'career' ? '1' : '0.35';
}
updatePlayerWeapon();

// --- Raycaster = "paprsek" ze středu obrazovky (kam míříme) ---
const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0); // 0,0 = přesně střed

// Stopy po zásahu (necháme jich max pár desítek, ať se scéna nezaplní)
const impacts = [];
const MAX_IMPACTS = 30;

function makeImpact(point, normal) {
  const mark = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 12),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  mark.position.copy(point);
  // Natočíme kolečko podle plochy, do které jsme trefili, a kousek odsadíme
  mark.lookAt(point.clone().add(normal));
  mark.position.addScaledVector(normal, 0.01);
  scene.add(mark);
  impacts.push(mark);
  if (impacts.length > MAX_IMPACTS) {
    const old = impacts.shift();
    scene.remove(old);
  }
}

// Zpětný ráz: po výstřelu zbraň lehce "cukne" dozadu a vrátí se
let recoil = 0;

function shoot() {
  if (gameMode !== 'career') return;
  // Vyšleme paprsek ze středu obrazovky do scény.
  // Cílem jsou stěny/sloupy i nepřátelé – bereme ten NEJBLIŽŠÍ zásah,
  // takže stěna před nepřítelem ho správně zacloní.
  raycaster.setFromCamera(screenCenter, camera);
  const targets = shootables.concat(enemies.map(e => e.sprite));
  const hits = raycaster.intersectObjects(targets, true);

  if (hits.length > 0) {
    const hit = hits[0];
    const enemy = hit.object.userData.enemyRef;
    if (enemy) {
      // Trefili jsme nepřítele
      damageEnemy(enemy);
    } else {
      // Trefili jsme stěnu/sloup/podlahu → stopa po zásahu
      const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        : new THREE.Vector3(0, 1, 0);
      makeImpact(hit.point, normal);
    }
  }

  // Efekty: výšleh + zpětný ráz + zvuk
  muzzleFlash.visible = true;
  recoil = 0.08;
  playShot();
}

// Levé tlačítko myši = výstřel (jen když hrajeme = myš je zamčená)
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (document.pointerLockElement !== renderer.domElement) return;
  shoot();
});

// ------------------------------------------------------------
// 5c) ZVUKY (vytvořené v kódu přes Web Audio – nic se nestahuje)
// ------------------------------------------------------------

let audioCtx = null;

// Zvuk smí naběhnout až po kliknutí uživatele (proto voláme při startu hry)
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

// Krátký tón (pípnutí)
function beep(freq, dur, type = 'square', vol = 0.15) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur); // rychle zeslábne
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.start(t); osc.stop(t + dur);
}

// Krátký šum (zní jako výstřel)
function noiseBurst(dur = 0.08, vol = 0.18) {
  if (!audioCtx) return;
  const n = Math.floor(audioCtx.sampleRate * dur);
  const buffer = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audioCtx.createBufferSource(); src.buffer = buffer;
  const gain = audioCtx.createGain(); gain.gain.value = vol;
  src.connect(gain); gain.connect(audioCtx.destination);
  src.start();
}

// Konkrétní herní zvuky
function playShot()       { noiseBurst(0.08, 0.18); beep(180, 0.06, 'square', 0.08); }
function playEnemyHit()   { beep(320, 0.07, 'square', 0.12); }
function playEnemyDeath() { beep(420, 0.05, 'square', 0.14); beep(150, 0.18, 'sawtooth', 0.14); }

let lastHurt = -1;
function playHurt() {
  if (!audioCtx) return;
  if (audioCtx.currentTime - lastHurt < 0.4) return; // aby to nehrálo pořád dokola
  lastHurt = audioCtx.currentTime;
  beep(110, 0.16, 'sawtooth', 0.12);
}

const enemyRaycaster = new THREE.Raycaster();
function hasLineOfSight(enemy) {
  const origin = enemy.sprite.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  const target = camera.position.clone();
  const direction = target.clone().sub(origin);
  const distance = direction.length();
  enemyRaycaster.set(origin, direction.normalize(), 0.05, distance - 0.15);
  return enemyRaycaster.intersectObjects(shootables, true).length === 0;
}

function showEnemyTracer(enemy) {
  const start = enemy.sprite.position.clone().add(new THREE.Vector3(0, 1.35, 0));
  const end = camera.position.clone();
  const tracer = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([start, end]),
    new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 })
  );
  scene.add(tracer);
  setTimeout(() => scene.remove(tracer), 65);
}

// Ozbrojení vojáci nestřílejí skrz zeď, pás ani nábytek – kryty mají smysl.
function enemyGunAttacks(dt) {
  for (const e of enemies) {
    const settings = enemySettings[e.kind];
    if (!settings.gunRange) continue;
    e.shotCooldown -= dt;
    const dx = camera.position.x - e.sprite.position.x;
    const dz = camera.position.z - e.sprite.position.z;
    if (dx * dx + dz * dz > settings.gunRange * settings.gunRange || e.shotCooldown > 0 || !hasLineOfSight(e)) continue;
    e.shotCooldown = settings.gunCooldown;
    playerHealth -= settings.gunDamage;
    updateHud();
    playHurt();
    if (e.muzzle) {
      e.muzzle.visible = true;
      setTimeout(() => { if (e.muzzle.parent) e.muzzle.visible = false; }, 70);
    }
    showEnemyTracer(e);
    flashEnemy(e, 0xffcc55, 80);
    if (playerHealth <= 0) { endGame('💀 Prohráls! Nepřátelé tě dostali.'); return; }
  }
}

// ------------------------------------------------------------
// 6) HERNÍ SMYČKA: běží ~60x za sekundu a překresluje obraz
// ------------------------------------------------------------

const clock = new THREE.Clock();
const SPEED = 5; // rychlost chůze (metry za sekundu)
const STANDING_EYE_HEIGHT = 1.7;
const CROUCH_EYE_HEIGHT = 1.02;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta(); // čas od minulého snímku (v sekundách)

  // Hrajeme právě teď? (podle zvoleného režimu – viz isPlaying)
  const playing = isPlaying();

  // --- Rozhlížení: přepočítáme natočení kamery z yaw/pitch ---
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  // Levý Ctrl sníží oči za nízký kryt. Plynulý přechod nepůsobí jako skok kamery.
  const crouchNow = playing && controlMode === 'keyboard' && keys['ControlLeft'];
  if (crouchNow !== isCrouching) {
    isCrouching = crouchNow;
    updateHud();
  }
  const desiredEyeHeight = isCrouching ? CROUCH_EYE_HEIGHT : STANDING_EYE_HEIGHT;
  camera.position.y += (desiredEyeHeight - camera.position.y) * Math.min(1, dt * 13);

  // --- Nepřátelé se hýbou k tobě ---
  if (playing) {
    moveEnemies(dt);
    enemyGunAttacks(dt);
  }

  // --- Pohyb (WASD nebo joystick – podle režimu) ---
  if (playing) {
    // Směr "dopředu" a "doprava" podle toho, kam se díváme (jen vodorovně)
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right   = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    // Vstup převedeme na "kolik dopředu (mz)" a "kolik doprava (mx)"
    let mx = 0, mz = 0;
    if (controlMode === 'keyboard') {
      if (keys['KeyW']) mz += 1;
      if (keys['KeyS']) mz -= 1;
      if (keys['KeyD']) mx += 1;
      if (keys['KeyA']) mx -= 1;
    } else {
      mx = joyVec.x; mz = joyVec.z; // joystick (výchylka -1..1 → i pomalejší chůze)
    }

    const move = new THREE.Vector3();
    move.addScaledVector(forward, mz);
    move.addScaledVector(right, mx);

    if (move.lengthSq() > 0) {
      if (move.lengthSq() > 1) move.normalize(); // diagonála/plný joystick = max rychlost
      move.multiplyScalar(SPEED * (isCrouching ? 0.55 : 1) * dt);
      // Zkusíme pohyb po osách zvlášť, ať to hezky "klouže" podél stěn
      const nx = camera.position.x + move.x;
      const nz = camera.position.z + move.z;
      if (!collides(nx, camera.position.z)) camera.position.x = nx;
      if (!collides(camera.position.x, nz)) camera.position.z = nz;
    }
  }

  // --- Nepřátelé ti ubližují, když jsou moc blízko ---
  if (playing) {
    for (const e of enemies) {
      const dx = camera.position.x - e.sprite.position.x;
      const dz = camera.position.z - e.sprite.position.z;
      const settings = enemySettings[e.kind];
      if (dx * dx + dz * dz < settings.touchRange * settings.touchRange) {
        playerHealth -= settings.touchDamage * dt; // ubývá životů za sekundu v blízkosti
        updateHud();
        playHurt();
        if (playerHealth <= 0) { endGame('💀 Prohráls! Nepřátelé tě dostali.'); break; }
      }
    }
  }

  // --- Auto-střelba při držení dotykového tlačítka ---
  if (playing && controlMode === 'touch' && touchFiring) {
    fireCooldown -= dt;
    if (fireCooldown <= 0) { shoot(); fireCooldown = 0.25; } // ~4 rány/s
  }

  // --- Zpětný ráz zbraně: cukne dozadu (+z) a plynule se vrací ---
  if (recoil > 0) {
    recoil = Math.max(0, recoil - dt * 0.4); // rychlost návratu
  }
  gun.position.z = -0.6 + recoil;

  // Výšleh z hlavně svítí jen velmi krátce
  if (muzzleFlash.visible && recoil < 0.05) {
    muzzleFlash.visible = false;
  }

  renderer.render(scene, camera);
}
animate();

// ------------------------------------------------------------
// 7) Reakce na změnu velikosti okna
// ------------------------------------------------------------
window.addEventListener('resize', () => {
  const { w, h } = viewSize();
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  updatePortraitClass(); // ukázat/schovat výzvu k otočení telefonu
});
