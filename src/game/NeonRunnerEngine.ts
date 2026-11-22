import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SynthAudio } from './audio';
import {
  LANE_POSITIONS,
  TRACK_LENGTH,
  TRACK_WIDTH,
  createEnergyCoin,
  createHorizonMountains,
  createHurdleObstacle,
  createMonolithObstacle,
  createNeonArch,
  createPlayerCraft,
  createProceduralTextures,
  createSharedGameMaterials,
  type CoinInstance,
  type ObstacleInstance,
  type PlayerCraftRig,
  type SharedAssetPalette,
  type SharedGameMaterials,
} from './proceduralAssets';

export type GameState = 'READY' | 'PLAYING' | 'GAMEOVER';

export interface HudSnapshot {
  state: GameState;
  score: number;
  bestScore: number;
  coins: number;
  speedKmh: number;
  speedRatio: number; // 0..1 normalized speed bar
  isNewBest: boolean;
  muted: boolean;
  webglError: string | null;
}

const STORAGE_BEST_KEY = 'neon_cube_runner_best_v1';

// Zero-GC pre-allocated math objects outside the animation loop
const _playerBox = new THREE.Box3();
const _targetBox = new THREE.Box3();
const _shrinkVec = new THREE.Vector3(-0.08, -0.08, -0.08);
const _lookTarget = new THREE.Vector3();

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export class NeonRunnerEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private audio = new SynthAudio();
  private isSoftwareGl = false;

  private textures!: SharedAssetPalette;
  private sharedMats!: SharedGameMaterials;
  private player!: PlayerCraftRig;
  private playerLight!: THREE.PointLight;
  private arches: THREE.Group[] = [];
  private shockwaveRing!: THREE.Mesh;
  private shockwaveScale = 0;

  // Object pools
  private monolithPool: ObstacleInstance[] = [];
  private hurdlePool: ObstacleInstance[] = [];
  private wideHurdlePool: ObstacleInstance[] = [];
  private coinPool: CoinInstance[] = [];
  private particlePool: Particle[] = [];

  // Game state & kinematics
  private state: GameState = 'READY';
  private bestScore = 0;
  private score = 0;
  private distanceScore = 0;
  private coinBonusScore = 0;
  private coinsCollected = 0;
  private coinStreak = 0;
  private isNewBest = false;

  private readonly baseSpeed = 24;
  private readonly maxSpeed = 62;
  private speed = 24;
  private lastSpeedTier = 0;
  private elapsedRunTime = 0;
  private gameOverCooldown = 0;

  // Player movement
  private targetLane = 1; // 0 = left, 1 = center, 2 = right
  private currentX = 0;
  private playerY = 0;
  private velocityY = 0;
  private isGrounded = true;
  private jumpBufferTimer = 0;
  private landingSquash = 0;

  // Spawner & juice
  private spawnTimer = 0;
  private exhaustTimer = 0;
  private cameraShakeTime = 0;
  private cameraShakeIntensity = 0;
  private lastHudEmit = 0;
  private idleTime = 0;

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;

  // Bound event listeners
  private handleResizeBound: () => void;
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private handleTouchStartBound: (e: TouchEvent) => void;
  private handleTouchEndBound: (e: TouchEvent) => void;
  private handleContextLostBound: (e: Event) => void;
  private handleContextRestoredBound: () => void;

  constructor(container: HTMLElement, onHudUpdate: (snapshot: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.bestScore = this.loadBestScore();

    this.handleResizeBound = this.onResize.bind(this);
    this.handleKeyDownBound = this.onKeyDown.bind(this);
    this.handleTouchStartBound = this.onTouchStart.bind(this);
    this.handleTouchEndBound = this.onTouchEnd.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.handleContextRestoredBound = () => {
      this.contextLost = false;
      this.clock.getDelta();
    };

    try {
      this.initThree();
      this.buildScene();
      this.bindEvents();
      this.emitHud(true);
      this.clock.start();
      this.tick();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'WebGL 렌더링 컨텍스트를 초기화할 수 없습니다.';
      this.onHudUpdate({
        state: 'READY',
        score: 0,
        bestScore: this.bestScore,
        coins: 0,
        speedKmh: 0,
        speedRatio: 0,
        isNewBest: false,
        muted: this.audio.isMuted(),
        webglError: message,
      });
    }
  }

  private detectSoftwareGl(): boolean {
    try {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param) ?? '');
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return false;
    }
  }

  private initThree(): void {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060714);
    this.scene.fog = new THREE.FogExp2(0x060714, 0.0135);

    this.camera = new THREE.PerspectiveCamera(64, width / height, 0.1, 260);
    this.camera.position.set(0, 4.4, 7.6);
    this.camera.lookAt(0, 1.1, -10);

    // Mandatory studio environment map for crisp metallic reflections on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();
  }

  private buildScene(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.sharedMats = createSharedGameMaterials();

    // Warm/cool balanced studio + cyber lighting rig (1 shadow caster max)
    const hemiLight = new THREE.HemisphereLight(0x5ae2ff, 0x1e0b36, 0.9);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 1.35);
    keyLight.position.set(10, 18, 12);
    if (!this.isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 60;
      keyLight.shadow.camera.left = -12;
      keyLight.shadow.camera.right = 12;
      keyLight.shadow.camera.top = 18;
      keyLight.shadow.camera.bottom = -12;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff2a85, 0.95);
    rimLight.position.set(-12, 8, -22);
    this.scene.add(rimLight);

    // Dynamic PointLight riding with the player craft
    this.playerLight = new THREE.PointLight(0x00f0ff, 5.5, 16, 1.7);
    this.playerLight.position.set(0, 1.6, 0.4);
    this.scene.add(this.playerLight);

    // 1. Main Neon Grid Track Plane
    const trackGeo = new THREE.PlaneGeometry(TRACK_WIDTH, TRACK_LENGTH);
    trackGeo.rotateX(-Math.PI / 2);
    const trackMat = new THREE.MeshStandardMaterial({
      map: this.textures.trackTexture,
      roughness: 0.36,
      metalness: 0.42,
      emissive: 0x062036,
      emissiveMap: this.textures.trackTexture,
      emissiveIntensity: 0.9,
    });
    const trackMesh = new THREE.Mesh(trackGeo, trackMat);
    trackMesh.position.set(0, 0, -TRACK_LENGTH / 2 + 24);
    trackMesh.receiveShadow = true;
    this.scene.add(trackMesh);

    // Track elevated neon guardrails
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x161a30,
      metalness: 0.85,
      roughness: 0.25,
    });
    const railGlowMat = new THREE.MeshStandardMaterial({
      color: 0xff4fa0,
      emissive: 0xff1e7a,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });
    const railGeo = new THREE.BoxGeometry(0.28, 0.36, TRACK_LENGTH);
    const glowStripGeo = new THREE.BoxGeometry(0.1, 0.1, TRACK_LENGTH);
    [-1, 1].forEach((side) => {
      const rx = side * (TRACK_WIDTH / 2 + 0.14);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(rx, 0.18, -TRACK_LENGTH / 2 + 24);
      this.scene.add(rail);

      const strip = new THREE.Mesh(glowStripGeo, railGlowMat);
      strip.position.set(rx - side * 0.12, 0.32, -TRACK_LENGTH / 2 + 24);
      this.scene.add(strip);
    });

    // 2. Repeating Overhead Neon Cyber Arches
    const archPillarMat = new THREE.MeshStandardMaterial({
      color: 0x12182d,
      metalness: 0.78,
      roughness: 0.32,
    });
    const archGlowMat = new THREE.MeshStandardMaterial({
      color: 0x6bf7ff,
      emissive: 0x00d8ff,
      emissiveIntensity: 1.9,
      roughness: 0.2,
    });
    const archSpacing = 22;
    for (let i = 0; i < 9; i++) {
      const arch = createNeonArch(archPillarMat, archGlowMat);
      arch.position.z = 8 - i * archSpacing;
      this.scene.add(arch);
      this.arches.push(arch);
    }

    // 3. Extended Horizon Synthwave Mountain Ridges (Left & Right)
    this.scene.add(createHorizonMountains(-1));
    this.scene.add(createHorizonMountains(1));

    // 4. Distant Striped Cyber Horizon Sun (unaffected by fog)
    const sunGeo = new THREE.PlaneGeometry(54, 54);
    const sunMat = new THREE.MeshBasicMaterial({
      map: this.textures.sunTexture,
      transparent: true,
      fog: false,
      depthWrite: false,
    });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(0, 17, -170);
    this.scene.add(sunMesh);

    // 5. Instanced Starfield Overhead
    const starCount = 180;
    const starGeo = new THREE.OctahedronGeometry(0.18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xbef5ff, fog: false });
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < starCount; i++) {
      dummy.position.set(
        THREE.MathUtils.randFloat(-120, 120),
        THREE.MathUtils.randFloat(14, 72),
        THREE.MathUtils.randFloat(-185, -35),
      );
      const s = THREE.MathUtils.randFloat(0.6, 1.8);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      stars.setMatrixAt(i, dummy.matrix);
    }
    stars.instanceMatrix.needsUpdate = true;
    stars.computeBoundingSphere();
    this.scene.add(stars);

    // 6. Player Composite Neon Cube Interceptor
    this.player = createPlayerCraft(this.textures.shadowTexture);
    this.scene.add(this.player.group);
    this.scene.add(this.player.contactShadow);

    // 7. Shockwave Ring for Crash Explosion
    const shockGeo = new THREE.RingGeometry(0.5, 0.85, 32);
    shockGeo.rotateX(-Math.PI / 2);
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xff2a85,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shockwaveRing = new THREE.Mesh(shockGeo, shockMat);
    this.shockwaveRing.position.y = 0.08;
    this.shockwaveRing.visible = false;
    this.scene.add(this.shockwaveRing);

    // 8. Pre-allocate Object Pools (Zero runtime allocations)
    for (let i = 0; i < 18; i++) {
      const m = createMonolithObstacle(this.sharedMats);
      this.scene.add(m.group);
      this.monolithPool.push(m);
    }
    for (let i = 0; i < 10; i++) {
      const h = createHurdleObstacle(this.sharedMats, false);
      this.scene.add(h.group);
      this.hurdlePool.push(h);
    }
    for (let i = 0; i < 5; i++) {
      const wh = createHurdleObstacle(this.sharedMats, true);
      this.scene.add(wh.group);
      this.wideHurdlePool.push(wh);
    }
    for (let i = 0; i < 24; i++) {
      const c = createEnergyCoin(this.sharedMats);
      this.scene.add(c.group);
      this.coinPool.push(c);
    }

    // Pooled 3D particle shards (for exhaust, coin pickups, crash explosion)
    const pGeo = new THREE.OctahedronGeometry(0.16, 0);
    for (let i = 0; i < 90; i++) {
      const pMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(pGeo, pMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particlePool.push({
        mesh,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
        active: false,
      });
    }

    // Pre-compile shaders on hardware GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResizeBound);
    window.addEventListener('keydown', this.handleKeyDownBound);
    const el = this.renderer.domElement;
    el.addEventListener('touchstart', this.handleTouchStartBound, { passive: false });
    el.addEventListener('touchend', this.handleTouchEndBound, { passive: false });
    el.addEventListener('webglcontextlost', this.handleContextLostBound);
    el.addEventListener('webglcontextrestored', this.handleContextRestoredBound);
  }

  public startGame(): void {
    this.audio.unlock();
    this.resetWorld();
    this.state = 'PLAYING';
    this.emitHud(true);
  }

  public moveLeft(): void {
    if (this.state !== 'PLAYING') return;
    if (this.targetLane > 0) {
      this.targetLane -= 1;
      this.audio.playLaneShift(-1);
    }
  }

  public moveRight(): void {
    if (this.state !== 'PLAYING') return;
    if (this.targetLane < 2) {
      this.targetLane += 1;
      this.audio.playLaneShift(1);
    }
  }

  public triggerJump(): void {
    if (this.state !== 'PLAYING') return;
    this.audio.unlock();
    if (this.isGrounded) {
      this.executeJump();
    } else {
      // Input buffer: allow slightly early spacebar press before landing
      this.jumpBufferTimer = 0.14;
    }
  }

  private executeJump(): void {
    this.isGrounded = false;
    this.velocityY = 13.6;
    this.jumpBufferTimer = 0;
    this.landingSquash = -0.22; // Stretch upwards on takeoff
    this.audio.playJump();
    this.spawnBurst(this.currentX, 0.25, 0.1, 8, 0x00f0ff, 4.5, 0.32);
  }

  public toggleMute(): boolean {
    const muted = this.audio.toggleMute();
    this.emitHud(true);
    return muted;
  }

  private resetWorld(): void {
    this.score = 0;
    this.distanceScore = 0;
    this.coinBonusScore = 0;
    this.coinsCollected = 0;
    this.coinStreak = 0;
    this.isNewBest = false;
    this.speed = this.baseSpeed;
    this.lastSpeedTier = 0;
    this.elapsedRunTime = 0;
    this.spawnTimer = 0.45;
    this.cameraShakeTime = 0;
    this.cameraShakeIntensity = 0;

    this.targetLane = 1;
    this.currentX = 0;
    this.playerY = 0;
    this.velocityY = 0;
    this.isGrounded = true;
    this.jumpBufferTimer = 0;
    this.landingSquash = 0;

    this.player.group.visible = true;
    this.player.group.position.set(0, 0, 0);
    this.player.bodyTiltGroup.rotation.set(0, 0, 0);
    this.player.bodyTiltGroup.scale.set(1, 1, 1);
    this.player.contactShadow.visible = true;
    this.player.contactShadow.position.set(0, 0.025, 0);
    this.shockwaveRing.visible = false;

    const resetList = (list: ObstacleInstance[]) => {
      for (const o of list) {
        o.active = false;
        o.group.visible = false;
      }
    };
    resetList(this.monolithPool);
    resetList(this.hurdlePool);
    resetList(this.wideHurdlePool);

    for (const c of this.coinPool) {
      c.active = false;
      c.group.visible = false;
    }
    for (const p of this.particlePool) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  private acquireObstacle(pool: ObstacleInstance[]): ObstacleInstance | null {
    for (const item of pool) {
      if (!item.active) {
        item.active = true;
        item.group.visible = true;
        return item;
      }
    }
    return null;
  }

  private acquireCoin(): CoinInstance | null {
    for (const c of this.coinPool) {
      if (!c.active) {
        c.active = true;
        c.group.visible = true;
        return c;
      }
    }
    return null;
  }

  private spawnCoinLine(lane: number, startZ: number, count: number, arcJump = false): void {
    const laneX = LANE_POSITIONS[lane];
    for (let i = 0; i < count; i++) {
      const coin = this.acquireCoin();
      if (!coin) break;
      const z = startZ - i * 3.1;
      let y = 1.02;
      if (arcJump) {
        const mid = (count - 1) / 2;
        const norm = mid > 0 ? 1 - Math.abs(i - mid) / mid : 1;
        y = 1.05 + norm * 1.45;
      }
      coin.baseY = y;
      coin.group.position.set(laneX, y, z);
    }
  }

  /**
   * Escalating obstacle & coin wave generator based on current speed / progression.
   */
  private spawnWave(): void {
    const spawnZ = -132;
    const difficulty = THREE.MathUtils.clamp(
      (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed),
      0,
      1,
    );
    const roll = Math.random();

    if (difficulty < 0.25) {
      // Early stage: single monolith or single jumpable hurdle + inviting coin line
      if (roll < 0.62) {
        const blockedLane = THREE.MathUtils.randInt(0, 2);
        const obs = this.acquireObstacle(this.monolithPool);
        if (obs) obs.group.position.set(LANE_POSITIONS[blockedLane], 0, spawnZ);

        const openLane = (blockedLane + THREE.MathUtils.randInt(1, 2)) % 3;
        if (Math.random() < 0.78) {
          this.spawnCoinLine(openLane, spawnZ + 3, 3, false);
        }
      } else {
        const lane = THREE.MathUtils.randInt(0, 2);
        const hurdle = this.acquireObstacle(this.hurdlePool);
        if (hurdle) hurdle.group.position.set(LANE_POSITIONS[lane], 0, spawnZ);
        this.spawnCoinLine(lane, spawnZ + 3.1, 3, true);
      }
    } else if (difficulty < 0.65) {
      // Mid stage: twin monoliths, full-width jumpable laser hurdle, or monolith + hurdle combo
      if (roll < 0.38) {
        // Two lanes blocked, 1 safe lane
        const safeLane = THREE.MathUtils.randInt(0, 2);
        for (let lane = 0; lane < 3; lane++) {
          if (lane === safeLane) continue;
          const obs = this.acquireObstacle(this.monolithPool);
          if (obs) obs.group.position.set(LANE_POSITIONS[lane], 0, spawnZ);
        }
        if (Math.random() < 0.7) {
          this.spawnCoinLine(safeLane, spawnZ + 3.2, 3, false);
        }
      } else if (roll < 0.66) {
        // Full-track jumpable laser hurdle!
        const wide = this.acquireObstacle(this.wideHurdlePool);
        if (wide) wide.group.position.set(0, 0, spawnZ);
        const bonusLane = THREE.MathUtils.randInt(0, 2);
        this.spawnCoinLine(bonusLane, spawnZ + 3.1, 3, true);
      } else {
        // 1 monolith + 1 jumpable hurdle in another lane
        const laneA = THREE.MathUtils.randInt(0, 2);
        const laneB = (laneA + 1) % 3;
        const m = this.acquireObstacle(this.monolithPool);
        if (m) m.group.position.set(LANE_POSITIONS[laneA], 0, spawnZ);
        const h = this.acquireObstacle(this.hurdlePool);
        if (h) h.group.position.set(LANE_POSITIONS[laneB], 0, spawnZ);
        this.spawnCoinLine(laneB, spawnZ + 3.1, 3, true);
      }
    } else {
      // High-speed expert stage: staggered slalom waves, twin blocks + hurdle, wide hurdles
      if (roll < 0.34) {
        // Twin monoliths + jumpable hurdle on the remaining lane (dodge OR jump!)
        const jumpLane = THREE.MathUtils.randInt(0, 2);
        for (let lane = 0; lane < 3; lane++) {
          if (lane === jumpLane) {
            const h = this.acquireObstacle(this.hurdlePool);
            if (h) h.group.position.set(LANE_POSITIONS[lane], 0, spawnZ);
            this.spawnCoinLine(lane, spawnZ + 3.1, 3, true);
          } else {
            const m = this.acquireObstacle(this.monolithPool);
            if (m) m.group.position.set(LANE_POSITIONS[lane], 0, spawnZ);
          }
        }
      } else if (roll < 0.66) {
        // Staggered slalom (2 quick shifted waves)
        const open1 = THREE.MathUtils.randInt(0, 2);
        const open2 = (open1 + (Math.random() < 0.5 ? 1 : 2)) % 3;
        for (let lane = 0; lane < 3; lane++) {
          if (lane !== open1) {
            const m = this.acquireObstacle(this.monolithPool);
            if (m) m.group.position.set(LANE_POSITIONS[lane], 0, spawnZ);
          }
          if (lane !== open2) {
            const m2 = this.acquireObstacle(this.monolithPool);
            if (m2) m2.group.position.set(LANE_POSITIONS[lane], 0, spawnZ - 16);
          }
        }
        this.spawnCoinLine(open1, spawnZ + 1.5, 2, false);
        this.spawnCoinLine(open2, spawnZ - 14.5, 2, false);
      } else {
        // Full-track laser hurdle followed by twin monoliths
        const wide = this.acquireObstacle(this.wideHurdlePool);
        if (wide) wide.group.position.set(0, 0, spawnZ);
        const safeAfter = THREE.MathUtils.randInt(0, 2);
        this.spawnCoinLine(safeAfter, spawnZ + 3.1, 3, true);
      }
    }
  }

  private spawnBurst(
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    speedMag: number,
    lifeSec: number,
    scale = 1,
  ): void {
    let spawned = 0;
    for (const p of this.particlePool) {
      if (p.active) continue;
      p.active = true;
      p.life = lifeSec * THREE.MathUtils.randFloat(0.75, 1.25);
      p.maxLife = p.life;
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(scale * THREE.MathUtils.randFloat(0.65, 1.35));
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.72;
      const mag = speedMag * THREE.MathUtils.randFloat(0.45, 1.25);
      p.vel.set(
        Math.sin(phi) * Math.cos(theta) * mag,
        Math.cos(phi) * mag + 2.2,
        Math.sin(phi) * Math.sin(theta) * mag,
      );
      p.rotVel.set(
        THREE.MathUtils.randFloat(-9, 9),
        THREE.MathUtils.randFloat(-9, 9),
        THREE.MathUtils.randFloat(-9, 9),
      );
      spawned++;
      if (spawned >= count) break;
    }
  }

  private triggerGameOver(): void {
    this.state = 'GAMEOVER';
    this.gameOverCooldown = 0.45;
    this.cameraShakeTime = 0.48;
    this.cameraShakeIntensity = 0.58;

    this.audio.playCrash();

    // Multi-layered particle explosion + ground shockwave
    const px = this.player.group.position.x;
    const py = this.player.group.position.y + 0.6;
    this.spawnBurst(px, py, 0, 26, 0x00f5ff, 12.5, 0.9, 1.5);
    this.spawnBurst(px, py, 0, 20, 0xff1e7a, 10.5, 0.85, 1.35);
    this.spawnBurst(px, py, 0, 12, 0xffe066, 8.5, 0.7, 1.1);

    this.shockwaveRing.position.set(px, 0.08, 0);
    this.shockwaveScale = 0.6;
    this.shockwaveRing.scale.setScalar(this.shockwaveScale);
    this.shockwaveRing.visible = true;
    (this.shockwaveRing.material as THREE.MeshBasicMaterial).opacity = 0.95;

    this.player.group.visible = false;
    this.player.contactShadow.visible = false;

    const finalScore = Math.floor(this.score);
    if (finalScore > this.bestScore) {
      this.bestScore = finalScore;
      this.isNewBest = true;
      this.saveBestScore(this.bestScore);
    }

    this.emitHud(true);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particlePool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      const t = p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.01, t * 1.15));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;
    }

    if (this.shockwaveRing.visible) {
      this.shockwaveScale += dt * 16;
      this.shockwaveRing.scale.setScalar(this.shockwaveScale);
      const mat = this.shockwaveRing.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, mat.opacity - dt * 2.1);
      if (mat.opacity <= 0.01) {
        this.shockwaveRing.visible = false;
      }
    }
  }

  private updateWorldScroll(dt: number, scrollSpeed: number): void {
    // Scroll track grid texture seamlessly
    const texRepeatPerUnit = 24 / TRACK_LENGTH;
    this.textures.trackTexture.offset.y =
      (this.textures.trackTexture.offset.y + scrollSpeed * dt * texRepeatPerUnit) % 1;

    // Scroll cyber arches
    const archSpacing = 22;
    const totalArchSpan = archSpacing * this.arches.length;
    for (const arch of this.arches) {
      arch.position.z += scrollSpeed * dt;
      if (arch.position.z > 16) {
        arch.position.z -= totalArchSpan;
      }
    }
  }

  private updatePlaying(dt: number): void {
    this.elapsedRunTime += dt;

    // Progressive speed acceleration
    const targetSpeed = Math.min(this.maxSpeed, this.baseSpeed + this.elapsedRunTime * 0.72);
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 2.5, dt);

    // Speed tier milestone sound every +10 m/s
    const tier = Math.floor((this.speed - this.baseSpeed) / 10);
    if (tier > this.lastSpeedTier) {
      this.lastSpeedTier = tier;
      this.audio.playSpeedUp();
    }

    // Distance score
    this.distanceScore += this.speed * dt * 1.4;
    this.score = this.distanceScore + this.coinBonusScore;

    // Smooth lane transition (exponential damping + responsive roll tilt)
    const targetX = LANE_POSITIONS[this.targetLane];
    const prevX = this.currentX;
    this.currentX = THREE.MathUtils.damp(this.currentX, targetX, 14.5, dt);
    const lateralVel = (this.currentX - prevX) / Math.max(dt, 0.001);

    // Jump physics & input buffer
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }
    if (!this.isGrounded) {
      this.velocityY -= 36.5 * dt;
      this.playerY += this.velocityY * dt;
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.velocityY = 0;
        this.isGrounded = true;
        this.landingSquash = 0.24; // Compress briefly on landing
        this.spawnBurst(this.currentX, 0.12, 0.2, 6, 0x00e5ff, 3.2, 0.25, 0.7);
        if (this.jumpBufferTimer > 0) {
          this.executeJump();
        }
      }
    }

    // Recover squash & stretch smoothly
    this.landingSquash = THREE.MathUtils.damp(this.landingSquash, 0, 12, dt);
    const scaleY = 1 - this.landingSquash * 0.45;
    const scaleXZ = 1 + this.landingSquash * 0.28;
    this.player.bodyTiltGroup.scale.set(scaleXZ, scaleY, scaleXZ);

    // Apply player transform + chassis tilt & jump pitch
    const hoverBob = this.isGrounded ? Math.sin(this.elapsedRunTime * 11) * 0.035 : 0;
    this.player.group.position.set(this.currentX, this.playerY + hoverBob, 0);

    const desiredRoll = THREE.MathUtils.clamp(-lateralVel * 0.034, -0.42, 0.42);
    const desiredPitch = this.isGrounded
      ? 0
      : THREE.MathUtils.clamp(this.velocityY * 0.022, -0.26, 0.28);
    this.player.bodyTiltGroup.rotation.z = THREE.MathUtils.damp(
      this.player.bodyTiltGroup.rotation.z,
      desiredRoll,
      16,
      dt,
    );
    this.player.bodyTiltGroup.rotation.x = THREE.MathUtils.damp(
      this.player.bodyTiltGroup.rotation.x,
      desiredPitch,
      12,
      dt,
    );
    this.player.bodyTiltGroup.rotation.y = THREE.MathUtils.damp(
      this.player.bodyTiltGroup.rotation.y,
      desiredRoll * 0.35,
      14,
      dt,
    );

    // Rotate inner core & pulse thruster exhaust
    this.player.innerCore.rotation.y += dt * 3.8;
    this.player.innerCore.rotation.x += dt * 2.1;
    const speedFactor = (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed);
    const flamePulse = 0.85 + speedFactor * 0.9 + Math.sin(this.elapsedRunTime * 44) * 0.16;
    this.player.thrusterLeft.scale.set(1, 1, flamePulse);
    this.player.thrusterRight.scale.set(1, 1, flamePulse);

    // Ground contact shadow responds to altitude
    this.player.contactShadow.position.set(this.currentX, 0.025, 0);
    const heightNorm = THREE.MathUtils.clamp(this.playerY / 3.0, 0, 1);
    const shadowScale = 1 - heightNorm * 0.42;
    this.player.contactShadow.scale.setScalar(shadowScale);
    (this.player.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      0.72 * (1 - heightNorm * 0.65);

    // Player dynamic point light
    this.playerLight.position.set(this.currentX, this.playerY + 1.5, 0.4);

    // Subtle thruster exhaust trail particles
    this.exhaustTimer -= dt;
    if (this.exhaustTimer <= 0) {
      this.exhaustTimer = 0.045;
      this.spawnBurst(
        this.currentX + THREE.MathUtils.randFloat(-0.26, 0.26),
        this.playerY + 0.44,
        0.9,
        1,
        0x00f0ff,
        1.2,
        0.22,
        0.55,
      );
    }

    // World scrolling
    this.updateWorldScroll(dt, this.speed);

    // Obstacle wave spawning
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnWave();
      // Tighter wave spacing as speed rises, while maintaining guaranteed human reaction window
      const baseInterval = 1.28 - speedFactor * 0.62;
      this.spawnTimer = Math.max(0.56, baseInterval * THREE.MathUtils.randFloat(0.88, 1.15));
    }

    // Update player Box3 once per frame (zero GC)
    this.player.hitboxMesh.updateWorldMatrix(true, false);
    _playerBox.setFromObject(this.player.hitboxMesh);
    _playerBox.expandByVector(_shrinkVec);

    // Move obstacles & check Box3 collisions
    const allPools = [this.monolithPool, this.hurdlePool, this.wideHurdlePool];
    for (const pool of allPools) {
      for (const obs of pool) {
        if (!obs.active) continue;
        obs.group.position.z += this.speed * dt;
        if (obs.group.position.z > 14) {
          obs.active = false;
          obs.group.visible = false;
          continue;
        }
        // Broadphase Z filter before exact Box3 check
        if (obs.group.position.z > -3.2 && obs.group.position.z < 3.2) {
          obs.hitboxMesh.updateWorldMatrix(true, false);
          _targetBox.setFromObject(obs.hitboxMesh);
          if (_playerBox.intersectsBox(_targetBox)) {
            this.triggerGameOver();
            return;
          }
        }
      }
    }

    // Move coins, spin, and check Box3 pickup
    for (const coin of this.coinPool) {
      if (!coin.active) continue;
      coin.group.position.z += this.speed * dt;
      coin.crystal.rotation.y += dt * 3.2;
      coin.halo.rotation.z -= dt * 2.4;
      coin.group.position.y =
        coin.baseY + Math.sin(this.elapsedRunTime * 4.5 + coin.phase) * 0.16;

      if (coin.group.position.z > 12) {
        coin.active = false;
        coin.group.visible = false;
        this.coinStreak = 0;
        continue;
      }

      if (coin.group.position.z > -2.5 && coin.group.position.z < 2.5) {
        coin.hitboxMesh.updateWorldMatrix(true, false);
        _targetBox.setFromObject(coin.hitboxMesh);
        if (_playerBox.intersectsBox(_targetBox)) {
          coin.active = false;
          coin.group.visible = false;
          this.coinsCollected += 1;
          this.coinStreak += 1;
          this.coinBonusScore += 50;
          this.score = this.distanceScore + this.coinBonusScore;
          this.audio.playCoin(this.coinStreak);
          this.spawnBurst(
            coin.group.position.x,
            coin.group.position.y,
            coin.group.position.z,
            10,
            0xffd000,
            6.5,
            0.42,
            0.95,
          );
          this.emitHud(true);
        }
      }
    }

    // Dynamic chase camera with speed FOV widening
    const targetFov = 64 + speedFactor * 13;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
    const camTargetX = this.currentX * 0.42;
    const camTargetY = 4.35 + this.playerY * 0.32;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, camTargetX, 7.5, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, camTargetY, 7.5, dt);
    this.camera.position.z = THREE.MathUtils.damp(
      this.camera.position.z,
      7.6 + speedFactor * 0.6,
      5,
      dt,
    );
    _lookTarget.set(this.currentX * 0.25, 1.15 + this.playerY * 0.2, -12);
    this.camera.lookAt(_lookTarget);
  }

  private updateIdleOrGameOver(dt: number): void {
    this.idleTime += dt;

    if (this.state === 'READY') {
      // Lively idle attract cruise down the neon highway
      this.updateWorldScroll(dt, 14);
      this.player.group.visible = true;
      this.player.contactShadow.visible = true;
      const hoverY = Math.sin(this.idleTime * 3.4) * 0.1 + 0.1;
      this.player.group.position.set(0, hoverY, 0);
      this.player.bodyTiltGroup.rotation.z = Math.sin(this.idleTime * 1.4) * 0.08;
      this.player.bodyTiltGroup.rotation.y = Math.sin(this.idleTime * 0.8) * 0.14;
      this.player.innerCore.rotation.y += dt * 2.4;
      this.playerLight.position.set(0, 1.6, 0.4);

      this.camera.position.x = Math.sin(this.idleTime * 0.45) * 1.65;
      this.camera.position.y = 4.0 + Math.cos(this.idleTime * 0.6) * 0.22;
      this.camera.position.z = 7.2;
      _lookTarget.set(0, 1.1, -8);
      this.camera.lookAt(_lookTarget);
    } else if (this.state === 'GAMEOVER') {
      if (this.gameOverCooldown > 0) {
        this.gameOverCooldown = Math.max(0, this.gameOverCooldown - dt);
      }
      // Subtle decelerated road drift
      this.updateWorldScroll(dt, 3.5);

      // Camera shake decay on crash impact
      if (this.cameraShakeTime > 0) {
        this.cameraShakeTime = Math.max(0, this.cameraShakeTime - dt);
        const decay = this.cameraShakeTime / 0.48;
        const mag = this.cameraShakeIntensity * decay;
        this.camera.position.x += (Math.random() - 0.5) * 2 * mag;
        this.camera.position.y += (Math.random() - 0.5) * 2 * mag;
      } else {
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, 0, 3, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 4.7, 3, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, 8.6, 3, dt);
      }
      _lookTarget.set(this.currentX * 0.2, 1.0, -8);
      this.camera.lookAt(_lookTarget);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (!this.contextLost) {
      if (this.state === 'PLAYING') {
        this.updatePlaying(dt);
      } else {
        this.updateIdleOrGameOver(dt);
      }
      this.updateParticles(dt);

      this.renderer.render(this.scene, this.camera);

      const now = performance.now();
      if (this.state === 'PLAYING' && now - this.lastHudEmit > 60) {
        this.emitHud(false);
        this.lastHudEmit = now;
      }
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private emitHud(force: boolean): void {
    if (force) {
      this.lastHudEmit = performance.now();
    }
    const speedRatio = THREE.MathUtils.clamp(
      (this.speed - this.baseSpeed) / (this.maxSpeed - this.baseSpeed),
      0,
      1,
    );
    const displayScore = Math.floor(this.score);
    const liveBest = Math.max(this.bestScore, displayScore);

    this.onHudUpdate({
      state: this.state,
      score: displayScore,
      bestScore: liveBest,
      coins: this.coinsCollected,
      speedKmh: Math.round(this.speed * 5.2),
      speedRatio,
      isNewBest: this.isNewBest,
      muted: this.audio.isMuted(),
      webglError: null,
    });
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }

    if (this.state === 'READY') {
      if (e.code === 'Space' || e.code === 'Enter') {
        this.startGame();
      }
      return;
    }

    if (this.state === 'GAMEOVER') {
      if ((e.code === 'Space' || e.code === 'Enter') && this.gameOverCooldown <= 0) {
        this.startGame();
      }
      return;
    }

    // Playing controls
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.moveLeft();
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.moveRight();
        break;
      case 'Space':
      case 'ArrowUp':
      case 'KeyW':
        this.triggerJump();
        break;
      case 'KeyM':
        this.toggleMute();
        break;
    }
  }

  private onTouchStart(e: TouchEvent): void {
    if (this.state !== 'PLAYING') return;
    if (e.touches.length === 0) return;
    e.preventDefault();
    this.audio.unlock();
    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = performance.now();
  }

  private onTouchEnd(e: TouchEvent): void {
    if (this.state !== 'PLAYING') return;
    if (e.changedTouches.length === 0) return;
    e.preventDefault();
    const touch = e.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const elapsed = performance.now() - this.touchStartTime;

    // Swipe up to jump
    if (dy < -36 && Math.abs(dy) > Math.abs(dx) * 1.1) {
      this.triggerJump();
      return;
    }
    // Horizontal swipe left/right
    if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) this.moveLeft();
      else this.moveRight();
      return;
    }
    // Quick tap: left half moves left, right half moves right
    if (elapsed < 320) {
      const halfWidth = window.innerWidth / 2;
      if (touch.clientX < halfWidth) {
        this.moveLeft();
      } else {
        this.moveRight();
      }
    }
  }

  private onResize(): void {
    if (!this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
  }

  private loadBestScore(): number {
    try {
      const raw = window.localStorage.getItem(STORAGE_BEST_KEY);
      const parsed = raw ? parseInt(raw, 10) : 0;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private saveBestScore(value: number): void {
    try {
      window.localStorage.setItem(STORAGE_BEST_KEY, String(value));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResizeBound);
    window.removeEventListener('keydown', this.handleKeyDownBound);

    if (this.renderer?.domElement) {
      const el = this.renderer.domElement;
      el.removeEventListener('touchstart', this.handleTouchStartBound);
      el.removeEventListener('touchend', this.handleTouchEndBound);
      el.removeEventListener('webglcontextlost', this.handleContextLostBound);
      el.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);
    }

    if (this.scene) {
      this.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      if (this.scene.environment) {
        this.scene.environment.dispose();
      }
    }

    this.textures?.dispose();
    this.sharedMats?.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
  }
}
