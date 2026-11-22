import * as THREE from 'three';

export const LANE_POSITIONS = [-2.8, 0, 2.8] as const;
export const TRACK_WIDTH = 9.2;
export const TRACK_LENGTH = 210;

export interface SharedAssetPalette {
  trackTexture: THREE.CanvasTexture;
  shadowTexture: THREE.CanvasTexture;
  sunTexture: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates crisp 100% procedural CanvasTextures (zero external files).
 */
export function createProceduralTextures(maxAnisotropy: number): SharedAssetPalette {
  // 1. Track Grid Texture (512x512, seamless repeat)
  const trackCanvas = document.createElement('canvas');
  trackCanvas.width = 512;
  trackCanvas.height = 512;
  const ctx = trackCanvas.getContext('2d')!;

  // Deep obsidian surface
  ctx.fillStyle = '#070a16';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle asphalt grain bands along lanes
  const laneGrad = ctx.createLinearGradient(0, 0, 512, 0);
  laneGrad.addColorStop(0, 'rgba(0, 240, 255, 0.14)');
  laneGrad.addColorStop(0.05, 'rgba(12, 18, 38, 0.2)');
  laneGrad.addColorStop(0.33, 'rgba(0, 240, 255, 0.05)');
  laneGrad.addColorStop(0.5, 'rgba(18, 24, 52, 0.25)');
  laneGrad.addColorStop(0.67, 'rgba(0, 240, 255, 0.05)');
  laneGrad.addColorStop(0.95, 'rgba(12, 18, 38, 0.2)');
  laneGrad.addColorStop(1, 'rgba(0, 240, 255, 0.14)');
  ctx.fillStyle = laneGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine sub-grid lines
  ctx.strokeStyle = 'rgba(0, 224, 255, 0.16)';
  ctx.lineWidth = 1.5;
  const step = 64;
  for (let i = 0; i <= 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Primary horizontal glowing pulse line
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(512, 2);
  ctx.stroke();

  // Lane divider dashed neon lines (dividing 3 lanes cleanly)
  const laneDividers = [512 * 0.345, 512 * 0.655];
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.72)';
  ctx.lineWidth = 4;
  ctx.setLineDash([42, 30]);
  laneDividers.forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Outer track neon trim strips
  ctx.fillStyle = '#ff1e7a';
  ctx.fillRect(0, 0, 12, 512);
  ctx.fillRect(500, 0, 12, 512);
  ctx.fillStyle = '#00f0ff';
  ctx.fillRect(14, 0, 4, 512);
  ctx.fillRect(494, 0, 4, 512);

  const trackTexture = new THREE.CanvasTexture(trackCanvas);
  trackTexture.colorSpace = THREE.SRGBColorSpace;
  trackTexture.wrapS = THREE.RepeatWrapping;
  trackTexture.wrapT = THREE.RepeatWrapping;
  trackTexture.repeat.set(1, 24);
  trackTexture.anisotropy = maxAnisotropy;

  // 2. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const rad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  rad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  rad.addColorStop(0.55, 'rgba(0, 12, 26, 0.42)');
  rad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = rad;
  sctx.fillRect(0, 0, 128, 128);

  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;

  // 3. Procedural Cyber-Horizon Striped Sun Disk
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 512;
  sunCanvas.height = 512;
  const sunCtx = sunCanvas.getContext('2d')!;
  sunCtx.clearRect(0, 0, 512, 512);

  sunCtx.save();
  sunCtx.beginPath();
  sunCtx.arc(256, 256, 224, 0, Math.PI * 2);
  sunCtx.clip();

  const sunGrad = sunCtx.createLinearGradient(0, 32, 0, 480);
  sunGrad.addColorStop(0, '#ffe866');
  sunGrad.addColorStop(0.45, '#ff5f6d');
  sunGrad.addColorStop(0.85, '#d61c7e');
  sunGrad.addColorStop(1, '#4b116f');
  sunCtx.fillStyle = sunGrad;
  sunCtx.fillRect(0, 0, 512, 512);

  // Horizontal synthwave horizon scan-cuts
  sunCtx.globalCompositeOperation = 'destination-out';
  const cuts = [
    { y: 270, h: 8 },
    { y: 298, h: 11 },
    { y: 330, h: 14 },
    { y: 366, h: 18 },
    { y: 406, h: 22 },
    { y: 450, h: 26 },
  ];
  cuts.forEach((c) => sunCtx.fillRect(0, c.y, 512, c.h));
  sunCtx.restore();

  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  sunTexture.colorSpace = THREE.SRGBColorSpace;

  return {
    trackTexture,
    shadowTexture,
    sunTexture,
    dispose: () => {
      trackTexture.dispose();
      shadowTexture.dispose();
      sunTexture.dispose();
    },
  };
}

export interface PlayerCraftRig {
  group: THREE.Group;
  bodyTiltGroup: THREE.Group;
  innerCore: THREE.Mesh;
  thrusterLeft: THREE.Mesh;
  thrusterRight: THREE.Mesh;
  contactShadow: THREE.Mesh;
  hitboxMesh: THREE.Mesh;
}

/**
 * Composite 9-part procedural Neon Cube Interceptor craft (bottom-center pivoted at y = 0).
 */
export function createPlayerCraft(shadowTexture: THREE.CanvasTexture): PlayerCraftRig {
  const group = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  group.add(bodyTiltGroup);

  // Materials with deliberate roughness/metalness contrast
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.88,
    roughness: 0.22,
  });
  const matteArmorMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.35,
    roughness: 0.62,
  });
  const cyanCoreMat = new THREE.MeshStandardMaterial({
    color: 0x67f8ff,
    emissive: 0x00e5ff,
    emissiveIntensity: 2.3,
    roughness: 0.15,
    metalness: 0.2,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x80faff,
    emissiveIntensity: 2.6,
    roughness: 0.1,
    metalness: 0.1,
  });
  const thrusterMat = new THREE.MeshStandardMaterial({
    color: 0x00f0ff,
    emissive: 0x00c8ff,
    emissiveIntensity: 2.8,
    transparent: true,
    opacity: 0.9,
    roughness: 0.1,
  });
  const wireEdgeMat = new THREE.LineBasicMaterial({ color: 0x00f5ff });

  // 1. Primary Chassis Cube (hovering slightly over ground cushion, total bottom at y=0.06)
  const hullGeo = new THREE.BoxGeometry(1.12, 0.96, 1.24);
  const hull = new THREE.Mesh(hullGeo, chassisMat);
  hull.position.set(0, 0.56, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  bodyTiltGroup.add(hull);

  // 2. Crisp Neon Wireframe Edge Frame around Chassis
  const hullEdges = new THREE.LineSegments(new THREE.EdgesGeometry(hullGeo), wireEdgeMat);
  hullEdges.position.copy(hull.position);
  bodyTiltGroup.add(hullEdges);

  // 3. Top Canopy Crown (stepped silhouette)
  const crownGeo = new THREE.BoxGeometry(0.76, 0.24, 0.84);
  const crown = new THREE.Mesh(crownGeo, matteArmorMat);
  crown.position.set(0, 1.14, 0.04);
  crown.castShadow = true;
  bodyTiltGroup.add(crown);

  // 4. Inner Rotating Energy Core visible on top/front recessed bay
  const coreGeo = new THREE.OctahedronGeometry(0.28, 0);
  const innerCore = new THREE.Mesh(coreGeo, cyanCoreMat);
  innerCore.position.set(0, 1.32, 0.04);
  bodyTiltGroup.add(innerCore);

  // 5. Aerodynamic Side Hover-Wings (Beveled ExtrudeGeometry)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.42, -0.06);
  finShape.lineTo(0.32, 0.34);
  finShape.lineTo(0, 0.44);
  finShape.closePath();

  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.92,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  finGeo.center();

  const rightFin = new THREE.Mesh(finGeo, matteArmorMat);
  rightFin.position.set(0.74, 0.38, 0.08);
  rightFin.castShadow = true;
  bodyTiltGroup.add(rightFin);

  const leftFin = new THREE.Mesh(finGeo, matteArmorMat);
  leftFin.scale.x = -1;
  leftFin.position.set(-0.74, 0.38, 0.08);
  leftFin.castShadow = true;
  bodyTiltGroup.add(leftFin);

  // Wingtip neon trim bars
  const trimGeo = new THREE.BoxGeometry(0.06, 0.08, 0.96);
  const rightTrim = new THREE.Mesh(trimGeo, cyanCoreMat);
  rightTrim.position.set(0.95, 0.34, 0.08);
  bodyTiltGroup.add(rightTrim);

  const leftTrim = new THREE.Mesh(trimGeo, cyanCoreMat);
  leftTrim.position.set(-0.95, 0.34, 0.08);
  bodyTiltGroup.add(leftTrim);

  // 6. Front Headlight Visor Bar
  const visorGeo = new THREE.BoxGeometry(0.88, 0.16, 0.08);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.62, -0.63);
  bodyTiltGroup.add(visor);

  // 7. Twin Rear Thruster Nozzles & Glowing Exhaust Cones
  const nozzleGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12);
  nozzleGeo.rotateX(Math.PI / 2);

  const leftNozzle = new THREE.Mesh(nozzleGeo, matteArmorMat);
  leftNozzle.position.set(-0.28, 0.48, 0.68);
  bodyTiltGroup.add(leftNozzle);

  const rightNozzle = new THREE.Mesh(nozzleGeo, matteArmorMat);
  rightNozzle.position.set(0.28, 0.48, 0.68);
  bodyTiltGroup.add(rightNozzle);

  const flameGeo = new THREE.ConeGeometry(0.13, 0.62, 10);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.31);

  const thrusterLeft = new THREE.Mesh(flameGeo, thrusterMat);
  thrusterLeft.position.set(-0.28, 0.48, 0.74);
  bodyTiltGroup.add(thrusterLeft);

  const thrusterRight = new THREE.Mesh(flameGeo, thrusterMat);
  thrusterRight.position.set(0.28, 0.48, 0.74);
  bodyTiltGroup.add(thrusterRight);

  // 8. Invisible Tight Collision Proxy Box (for crisp, fair Box3 collision)
  const hitboxGeo = new THREE.BoxGeometry(1.06, 1.02, 1.12);
  const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
  hitboxMesh.position.set(0, 0.54, 0);
  bodyTiltGroup.add(hitboxMesh);

  // 9. Ground Contact Shadow Plane (stays at y = 0.025 in world space while craft jumps)
  const shadowGeo = new THREE.PlaneGeometry(2.3, 2.3);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.set(0, 0.025, 0);
  contactShadow.renderOrder = 2;

  return {
    group,
    bodyTiltGroup,
    innerCore,
    thrusterLeft,
    thrusterRight,
    contactShadow,
    hitboxMesh,
  };
}

export type ObstacleKind = 'monolith' | 'hurdle' | 'wideHurdle';

export interface ObstacleInstance {
  group: THREE.Group;
  hitboxMesh: THREE.Mesh;
  kind: ObstacleKind;
  active: boolean;
}

/**
 * Shared materials & geometries for obstacle & coin pooling (low draw call overhead).
 */
export interface SharedGameMaterials {
  monolithBody: THREE.MeshStandardMaterial;
  monolithCap: THREE.MeshStandardMaterial;
  magentaGlow: THREE.MeshStandardMaterial;
  orangeGlow: THREE.MeshStandardMaterial;
  magentaWire: THREE.LineBasicMaterial;
  coinCrystal: THREE.MeshStandardMaterial;
  coinHalo: THREE.MeshStandardMaterial;
  hitboxHidden: THREE.MeshBasicMaterial;
  dispose: () => void;
}

export function createSharedGameMaterials(): SharedGameMaterials {
  const monolithBody = new THREE.MeshStandardMaterial({
    color: 0x160b24,
    metalness: 0.82,
    roughness: 0.25,
  });
  const monolithCap = new THREE.MeshStandardMaterial({
    color: 0x261538,
    metalness: 0.35,
    roughness: 0.6,
  });
  const magentaGlow = new THREE.MeshStandardMaterial({
    color: 0xff5ca8,
    emissive: 0xff1168,
    emissiveIntensity: 2.3,
    roughness: 0.15,
    metalness: 0.15,
  });
  const orangeGlow = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff4d00,
    emissiveIntensity: 2.4,
    roughness: 0.15,
    metalness: 0.1,
  });
  const magentaWire = new THREE.LineBasicMaterial({ color: 0xff2a85 });
  const coinCrystal = new THREE.MeshStandardMaterial({
    color: 0xffe066,
    emissive: 0xffa600,
    emissiveIntensity: 1.45,
    metalness: 0.9,
    roughness: 0.14,
  });
  const coinHalo = new THREE.MeshStandardMaterial({
    color: 0xfff3b0,
    emissive: 0xffc300,
    emissiveIntensity: 1.8,
    metalness: 0.5,
    roughness: 0.25,
  });
  const hitboxHidden = new THREE.MeshBasicMaterial({ visible: false });

  return {
    monolithBody,
    monolithCap,
    magentaGlow,
    orangeGlow,
    magentaWire,
    coinCrystal,
    coinHalo,
    hitboxHidden,
    dispose: () => {
      monolithBody.dispose();
      monolithCap.dispose();
      magentaGlow.dispose();
      orangeGlow.dispose();
      magentaWire.dispose();
      coinCrystal.dispose();
      coinHalo.dispose();
      hitboxHidden.dispose();
    },
  };
}

/**
 * Tall 1-lane Sentinel Monolith obstacle (dodge left/right).
 */
export function createMonolithObstacle(mats: SharedGameMaterials): ObstacleInstance {
  const group = new THREE.Group();

  // Base plinth grounded at y=0
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 1.65), mats.monolithCap);
  plinth.position.y = 0.11;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Main column
  const colGeo = new THREE.BoxGeometry(1.74, 2.15, 1.36);
  const col = new THREE.Mesh(colGeo, mats.monolithBody);
  col.position.y = 1.29;
  col.castShadow = true;
  col.receiveShadow = true;
  group.add(col);

  // Wireframe edges
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(colGeo), mats.magentaWire);
  edges.position.copy(col.position);
  group.add(edges);

  // Front & side glowing vertical hazard slats
  const slatFront = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.8, 1.42), mats.magentaGlow);
  slatFront.position.y = 1.28;
  group.add(slatFront);

  // Horizontal glowing hazard band
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.16, 1.42), mats.magentaGlow);
  band.position.y = 2.02;
  group.add(band);

  // Top crown cap
  const crown = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.22, 1.05), mats.monolithCap);
  crown.position.y = 2.48;
  group.add(crown);

  // Tight hitbox
  const hitboxMesh = new THREE.Mesh(new THREE.BoxGeometry(1.66, 2.35, 1.26), mats.hitboxHidden);
  hitboxMesh.position.y = 1.18;
  group.add(hitboxMesh);

  group.visible = false;
  return { group, hitboxMesh, kind: 'monolith', active: false };
}

/**
 * Low Laser Hurdle obstacle (single-lane or full-width 3-lane) designed to be jumped over.
 */
export function createHurdleObstacle(
  mats: SharedGameMaterials,
  wide: boolean,
): ObstacleInstance {
  const group = new THREE.Group();
  const span = wide ? 8.2 : 2.2;
  const halfSpan = span / 2;

  const pylonGeo = new THREE.BoxGeometry(0.32, 1.05, 0.42);
  const leftPylon = new THREE.Mesh(pylonGeo, mats.monolithCap);
  leftPylon.position.set(-halfSpan, 0.525, 0);
  leftPylon.castShadow = true;
  group.add(leftPylon);

  const rightPylon = new THREE.Mesh(pylonGeo, mats.monolithCap);
  rightPylon.position.set(halfSpan, 0.525, 0);
  rightPylon.castShadow = true;
  group.add(rightPylon);

  // Glowing top emitter caps
  const capGeo = new THREE.BoxGeometry(0.36, 0.14, 0.46);
  const leftCap = new THREE.Mesh(capGeo, mats.orangeGlow);
  leftCap.position.set(-halfSpan, 1.05, 0);
  group.add(leftCap);

  const rightCap = new THREE.Mesh(capGeo, mats.orangeGlow);
  rightCap.position.set(halfSpan, 1.05, 0);
  group.add(rightCap);

  // Twin horizontal laser plasma bars
  const beamGeo = new THREE.CylinderGeometry(0.11, 0.11, span, 10);
  beamGeo.rotateZ(Math.PI / 2);
  const topBeam = new THREE.Mesh(beamGeo, mats.orangeGlow);
  topBeam.position.y = 0.78;
  group.add(topBeam);

  const lowBeamGeo = new THREE.CylinderGeometry(0.07, 0.07, span, 8);
  lowBeamGeo.rotateZ(Math.PI / 2);
  const lowBeam = new THREE.Mesh(lowBeamGeo, mats.magentaGlow);
  lowBeam.position.y = 0.36;
  group.add(lowBeam);

  // Hitbox (low enough to cleanly clear with Space jump)
  const hitboxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(span - 0.15, 0.86, 0.42),
    mats.hitboxHidden,
  );
  hitboxMesh.position.y = 0.43;
  group.add(hitboxMesh);

  group.visible = false;
  return { group, hitboxMesh, kind: wide ? 'wideHurdle' : 'hurdle', active: false };
}

export interface CoinInstance {
  group: THREE.Group;
  crystal: THREE.Mesh;
  halo: THREE.Mesh;
  hitboxMesh: THREE.Mesh;
  active: boolean;
  baseY: number;
  phase: number;
}

/**
 * Spinning procedural Energy Coin (Octahedron crystal + tilted glowing halo ring).
 */
export function createEnergyCoin(mats: SharedGameMaterials): CoinInstance {
  const group = new THREE.Group();

  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), mats.coinCrystal);
  crystal.castShadow = true;
  group.add(crystal);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.045, 8, 24), mats.coinHalo);
  halo.rotation.x = Math.PI / 3;
  group.add(halo);

  const hitboxMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), mats.hitboxHidden);
  group.add(hitboxMesh);

  group.visible = false;
  return {
    group,
    crystal,
    halo,
    hitboxMesh,
    active: false,
    baseY: 1.05,
    phase: Math.random() * Math.PI * 2,
  };
}

/**
 * Procedural scrolling neon cyber-arches flanking the track for high-speed parallax cues.
 */
export function createNeonArch(
  pillarMat: THREE.Material,
  glowMat: THREE.Material,
): THREE.Group {
  const arch = new THREE.Group();
  const halfX = TRACK_WIDTH / 2 + 0.65;

  const legGeo = new THREE.BoxGeometry(0.38, 6.2, 0.45);
  const leftLeg = new THREE.Mesh(legGeo, pillarMat);
  leftLeg.position.set(-halfX, 3.1, 0);
  arch.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pillarMat);
  rightLeg.position.set(halfX, 3.1, 0);
  arch.add(rightLeg);

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2 + 0.4, 0.34, 0.45), pillarMat);
  topBeam.position.set(0, 6.2, 0);
  arch.add(topBeam);

  // Inner neon light strips
  const stripGeo = new THREE.BoxGeometry(0.1, 5.7, 0.12);
  const leftStrip = new THREE.Mesh(stripGeo, glowMat);
  leftStrip.position.set(-halfX + 0.22, 3.05, 0);
  arch.add(leftStrip);

  const rightStrip = new THREE.Mesh(stripGeo, glowMat);
  rightStrip.position.set(halfX - 0.22, 3.05, 0);
  arch.add(rightStrip);

  const topStrip = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2 - 0.5, 0.1, 0.12), glowMat);
  topStrip.position.set(0, 5.98, 0);
  arch.add(topStrip);

  return arch;
}

/**
 * Builds procedural synthwave side mountain terrain extending smoothly to the horizon (no empty void box).
 */
export function createHorizonMountains(side: -1 | 1): THREE.Group {
  const group = new THREE.Group();
  const width = 46;
  const depth = TRACK_LENGTH;
  const geo = new THREE.PlaneGeometry(width, depth, 14, 34);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Distance away from the inner track edge
    const edgeDist = side === 1 ? x + width / 2 : width / 2 - x;
    const ridgeMask = THREE.MathUtils.smoothstep(edgeDist, 2.0, 14.0);
    const wave1 = Math.sin(z * 0.085 + x * 0.19) * 3.8;
    const wave2 = Math.cos(z * 0.17 - x * 0.27) * 2.1;
    const peak = Math.abs(Math.sin(z * 0.045 + side * 1.2)) * 6.4;
    const h = Math.max(0, (peak + wave1 + wave2 + 3.2) * ridgeMask);
    pos.setY(i, h - 0.35);
  }
  geo.computeVertexNormals();

  const solidMat = new THREE.MeshStandardMaterial({
    color: 0x09081b,
    roughness: 0.85,
    metalness: 0.25,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, solidMat);
  group.add(mesh);

  const wireMat = new THREE.MeshBasicMaterial({
    color: side === 1 ? 0x9b26ff : 0x00b8d9,
    wireframe: true,
    transparent: true,
    opacity: 0.28,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const wireMesh = new THREE.Mesh(geo, wireMat);
  wireMesh.position.y = 0.03;
  group.add(wireMesh);

  const offsetX = side * (TRACK_WIDTH / 2 + width / 2 + 1.2);
  group.position.set(offsetX, 0, -depth / 2 + 30);

  return group;
}
