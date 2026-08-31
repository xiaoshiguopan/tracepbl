import * as THREE from "three";

type SceneOptions = {
  canvas: HTMLCanvasElement;
  onContextLost: () => void;
  onFirstFrame: (elapsedMs: number) => void;
  onPerformanceSample: (sample: PerformanceSample) => void;
  playIntro: boolean;
};

export type PerformanceSample = {
  drawCalls: number;
  fps: number;
  geometries: number;
  slowFrames: number;
  triangles: number;
};

export type P00SceneController = {
  dispose: () => void;
  loseContextForTest: () => boolean;
  replay: () => void;
  setPaused: (paused: boolean) => void;
  settle: () => void;
};

const INTRO_DURATION_MS = 6500;

export function createP00Scene({
  canvas,
  onContextLost,
  onFirstFrame,
  onPerformanceSample,
  playIntro,
}: SceneOptions): P00SceneController {
  const startedAt = performance.now();
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x080d0f, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080d0f, 0.13);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  camera.position.set(0.4, 0.15, playIntro ? 8.2 : 5.1);

  const cave = new THREE.Group();
  scene.add(cave);

  const stone = new THREE.MeshStandardMaterial({
    color: 0x172526,
    flatShading: true,
    roughness: 0.94,
  });
  const manuscript = new THREE.MeshStandardMaterial({
    color: 0x8b7147,
    roughness: 0.88,
  });
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x070a0b, roughness: 1 });

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(13, 8, 5, 3), stone);
  backWall.position.set(0.8, 0, -2.6);
  cave.add(backWall);

  for (const [x, y, z, scale] of [
    [-4.2, 0.2, -0.9, 2.2],
    [4.4, 0.5, -1.2, 2.5],
    [-3.1, 2.9, -1.4, 1.7],
  ] as const) {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), stone);
    rock.position.set(x, y, z);
    rock.scale.set(scale, scale * 1.35, scale * 0.72);
    cave.add(rock);
  }

  const figure = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.68, 2.8, 7), silhouette);
  robe.position.y = -0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), silhouette);
  head.position.y = 0.62;
  figure.add(robe, head);
  figure.position.set(-0.45, -0.45, 0.25);
  cave.add(figure);

  for (let index = 0; index < 12; index += 1) {
    const scroll = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.18), manuscript);
    scroll.position.set(2.15 + (index % 4) * 0.78, -1.75 + Math.floor(index / 4) * 0.18, -0.2);
    scroll.rotation.z = (index % 2 ? 1 : -1) * 0.035;
    cave.add(scroll);
  }

  const parchment = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.25, 4, 2),
    new THREE.MeshStandardMaterial({
      color: 0xd8c79e,
      emissive: 0x493c21,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  parchment.position.set(0.35, -0.1, 1.2);
  parchment.scale.setScalar(playIntro ? 0.01 : 0.54);
  scene.add(parchment);

  const ambient = new THREE.AmbientLight(0x294e59, 0.5);
  const lamp = new THREE.PointLight(0xf4c878, 24, 8, 1.8);
  lamp.position.set(-0.15, -0.25, 1.35);
  scene.add(ambient, lamp);

  const dustPositions = new Float32Array(120 * 3);
  for (let index = 0; index < dustPositions.length; index += 3) {
    dustPositions[index] = (Math.random() - 0.5) * 9;
    dustPositions[index + 1] = (Math.random() - 0.5) * 5;
    dustPositions[index + 2] = Math.random() * 5 - 2;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0xc5a46a,
    opacity: 0.42,
    size: 0.018,
    transparent: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  scene.add(dust);

  let disposed = false;
  let firstFrameReported = false;
  let introStartedAt = playIntro ? performance.now() : performance.now() - INTRO_DURATION_MS;
  let paused = false;
  let pointerX = 0;
  let pointerY = 0;
  let sampleFrameCount = 0;
  let sampleReported = false;
  let sampleSlowFrames = 0;
  const sampleStartedAt = performance.now();
  let previousFrameAt = sampleStartedAt;
  let settled = !playIntro;

  const resize = () => {
    const { clientHeight, clientWidth } = canvas;
    if (clientHeight === 0 || clientWidth === 0) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };

  const onPointerMove = (event: PointerEvent) => {
    pointerX = (event.clientX / window.innerWidth - 0.5) * 0.18;
    pointerY = (event.clientY / window.innerHeight - 0.5) * 0.1;
  };

  const onLost = () => {
    renderer.setAnimationLoop(null);
    onContextLost();
  };

  const render = (now: number) => {
    if (disposed || paused) return;
    const progress = settled ? 1 : Math.min((now - introStartedAt) / INTRO_DURATION_MS, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.z += (8.2 - 3.1 * eased - camera.position.z) * 0.035;
    camera.position.x += (0.4 + pointerX * (1 - progress * 0.72) - camera.position.x) * 0.045;
    camera.position.y += (0.15 - pointerY * (1 - progress * 0.72) - camera.position.y) * 0.045;
    camera.lookAt(0.25, -0.2, -0.5);
    lamp.intensity = 22 + Math.sin(now * 0.004) * 2.4;
    dust.rotation.y = now * 0.000025;
    dust.position.y = Math.sin(now * 0.00032) * 0.08;

    const parchmentProgress = Math.max(0, (progress - 0.72) / 0.28);
    const parchmentScale = 0.01 + parchmentProgress * 0.53;
    parchment.scale.set(parchmentScale, parchmentScale, 1);
    parchment.position.z = 1.2 + parchmentProgress * 0.65;

    renderer.render(scene, camera);
    if (!sampleReported) {
      sampleFrameCount += 1;
      if (now - previousFrameAt > 50) sampleSlowFrames += 1;
      previousFrameAt = now;
      if (now - sampleStartedAt >= 2000) {
        sampleReported = true;
        onPerformanceSample({
          drawCalls: renderer.info.render.calls,
          fps: Math.round((sampleFrameCount * 1000) / (now - sampleStartedAt)),
          geometries: renderer.info.memory.geometries,
          slowFrames: sampleSlowFrames,
          triangles: renderer.info.render.triangles,
        });
      }
    }
    if (!firstFrameReported) {
      firstFrameReported = true;
      onFirstFrame(performance.now() - startedAt);
    }
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("webglcontextlost", onLost);
  resize();
  renderer.setAnimationLoop(render);

  return {
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
    },
    loseContextForTest() {
      const extension = renderer.getContext().getExtension("WEBGL_lose_context");
      extension?.loseContext();
      return extension !== null;
    },
    replay() {
      introStartedAt = performance.now();
      settled = false;
      parchment.scale.setScalar(0.01);
      if (!paused) renderer.setAnimationLoop(render);
    },
    setPaused(nextPaused) {
      paused = nextPaused;
      renderer.setAnimationLoop(paused ? null : render);
    },
    settle() {
      settled = true;
    },
  };
}
