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
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x080d0f, 0.08);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
  camera.position.set(0.4, 0.15, playIntro ? 8.2 : 5.1);

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const glowContext = glowCanvas.getContext("2d");
  const glowGradient = glowContext?.createRadialGradient(64, 64, 1, 64, 64, 64);
  glowGradient?.addColorStop(0, "rgba(255, 221, 150, 0.72)");
  glowGradient?.addColorStop(0.22, "rgba(197, 164, 106, 0.26)");
  glowGradient?.addColorStop(1, "rgba(197, 164, 106, 0)");
  if (glowContext && glowGradient) {
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 128, 128);
  }
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    opacity: 0.42,
    transparent: true,
  });
  const glow = new THREE.Sprite(glowMaterial);
  glow.position.set(1.35, -0.25, 0.6);
  glow.scale.set(2.2, 2.2, 1);
  scene.add(glow);

  const paperCanvas = document.createElement("canvas");
  paperCanvas.width = 256;
  paperCanvas.height = 128;
  const paperContext = paperCanvas.getContext("2d");
  const paperGradient = paperContext?.createRadialGradient(128, 64, 2, 128, 64, 62);
  paperGradient?.addColorStop(0, "rgba(238, 241, 239, 0.92)");
  paperGradient?.addColorStop(0.46, "rgba(216, 199, 158, 0.7)");
  paperGradient?.addColorStop(0.82, "rgba(197, 164, 106, 0.22)");
  paperGradient?.addColorStop(1, "rgba(197, 164, 106, 0)");
  if (paperContext && paperGradient) {
    paperContext.fillStyle = paperGradient;
    paperContext.fillRect(0, 0, 256, 128);
    paperContext.globalCompositeOperation = "source-atop";
    paperContext.fillStyle = "rgba(255, 255, 255, 0.035)";
    for (let x = 4; x < 256; x += 9) paperContext.fillRect(x, 8, 1, 112);
  }
  const paperTexture = new THREE.CanvasTexture(paperCanvas);
  const paperMaterial = new THREE.SpriteMaterial({
    map: paperTexture,
    opacity: playIntro ? 0 : 0.48,
    transparent: true,
  });
  const paperLight = new THREE.Sprite(paperMaterial);
  paperLight.position.set(0.75, -0.55, 1.15);
  paperLight.scale.set(playIntro ? 0.01 : 4.4, playIntro ? 0.01 : 2.35, 1);
  scene.add(paperLight);

  const dustPositions = new Float32Array(96 * 3);
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
    glowMaterial.opacity = 0.38 + Math.sin(now * 0.004) * 0.04;
    glow.scale.setScalar(2.16 + Math.sin(now * 0.0027) * 0.08);
    dust.rotation.y = now * 0.000025;
    dust.position.y = Math.sin(now * 0.00032) * 0.08;
    const paperProgress = Math.max(0, (progress - 0.76) / 0.24);
    paperMaterial.opacity = paperProgress * 0.48;
    paperLight.scale.set(0.01 + paperProgress * 4.39, 0.01 + paperProgress * 2.34, 1);
    paperLight.position.z = 1.15 + paperProgress * 0.35;

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
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite)) return;
        if ("geometry" in object) object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      glowTexture.dispose();
      paperTexture.dispose();
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
