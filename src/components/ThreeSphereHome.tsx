import { useEffect, useRef } from "react";
import * as THREE from "three";

function createLinePoints(x1: number, y1: number, x2: number, y2: number, count: number) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return points;
}

function createArcPoints(cx: number, cy: number, radius: number, start: number, end: number, count: number) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const angle = start + (end - start) * t;
    points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return points;
}

function buildAIPoints(radius: number, total: number) {
  const aLeft = createLinePoints(-8, -8, 0, 10, 52);
  const aRight = createLinePoints(8, -8, 0, 10, 52);
  const aBar = createLinePoints(-4, 0, 4, 0, 32);

  const iStem = createLinePoints(12, -8, 12, 10, 62);
  const iTop = createLinePoints(8, 10, 16, 10, 24);
  const iBottom = createLinePoints(8, -8, 16, -8, 24);

  const rawPoints = [...aLeft, ...aRight, ...aBar, ...iStem, ...iTop, ...iBottom];
  const count = rawPoints.length;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i < total; i += 1) {
    const base = rawPoints[i % count];
    const z = ((i % 5) - 2) * 0.3;
    points.push(new THREE.Vector3(base.x * 0.9, base.y * 0.9, z));
  }

  const scale = radius * 0.9 / 12;
  return points.map((point) => point.multiplyScalar(scale));
}

function buildSOHELPoints(radius: number, total: number) {
  const s = [
    ...createArcPoints(-14, 4, 4.5, Math.PI * 0.25, Math.PI * 1.1, 24),
    ...createArcPoints(-7, -4, 4.5, Math.PI * -0.1, Math.PI * 0.85, 24),
  ];

  const o = [
    ...createArcPoints(0, 0, 5.5, 0, Math.PI * 2, 48),
  ];

  const h = [
    ...createLinePoints(12, -8, 12, 10, 26),
    ...createLinePoints(20, -8, 20, 10, 26),
    ...createLinePoints(12, 0, 20, 0, 22),
  ];

  const e = [
    ...createLinePoints(28, -8, 28, 10, 26),
    ...createLinePoints(28, 10, 36, 10, 20),
    ...createLinePoints(28, 0, 35, 0, 18),
    ...createLinePoints(28, -8, 36, -8, 20),
  ];

  const l = [
    ...createLinePoints(44, -8, 44, 10, 26),
    ...createLinePoints(44, -8, 52, -8, 24),
  ];

  const rawPoints = [...s, ...o, ...h, ...e, ...l];
  const count = rawPoints.length;
  const points: THREE.Vector3[] = [];

  for (let i = 0; i < total; i += 1) {
    const base = rawPoints[i % count];
    const z = ((i % 5) - 2) * 0.25;
    points.push(new THREE.Vector3(base.x, base.y, z));
  }

  const scale = radius * 0.8 / 16;
  return points.map((point) => point.multiplyScalar(scale));
}

const ThreeSphereHome = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const mousePos = { x: 0.5, y: 0.5 };
    let phase = 0;
    let frame = 0;
    let visible = true;
    const tempVec = new THREE.Vector3();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(95, 1, 0.1, 1000);
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    container.appendChild(renderer.domElement);

    const boxSize = 0.22;
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      color: 0xff0000,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const compact = window.matchMedia("(max-width: 1023px)").matches;
    const pitchSegments = compact ? 36 : 60;
    const elevationSegments = Math.max(12, Math.floor(pitchSegments / 2));
    const particles = pitchSegments * elevationSegments;
    const side = Math.pow(particles, 1 / 3);
    const radius = compact ? 10 : 16;
    const aiTargets = buildAIPoints(radius, particles);
    const sohelTargets = buildSOHELPoints(radius, particles);

    const parentContainer = new THREE.Object3D();
    const particleMesh = new THREE.InstancedMesh(geometry, material, particles);
    const dummy = new THREE.Object3D();
    const positions: THREE.Vector3[] = [];
    const dests: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
    const speeds: THREE.Vector3[] = [];

    scene.add(parentContainer);
    parentContainer.add(particleMesh);

    function posInBox(place: number) {
      return (place / side - 0.5) * radius * 1.2;
    }

    let index = 0;
    for (let p = 0; p < pitchSegments; p += 1) {
      const pitch = (Math.PI * 2 * p) / pitchSegments;

      for (let e = 0; e < elevationSegments; e += 1) {
        const elevation = Math.PI * (e / elevationSegments - 0.5);
        const sphereDest = new THREE.Vector3(
          Math.cos(pitch) * Math.cos(elevation) * radius,
          Math.sin(elevation) * radius,
          Math.sin(pitch) * Math.cos(elevation) * radius,
        );

        const boxPosition = new THREE.Vector3(
          posInBox(index % side),
          posInBox(Math.floor(index / side) % side),
          posInBox(Math.floor(index / Math.pow(side, 2)) % side),
        );

        const diamondDest = new THREE.Vector3(
          Math.cos(pitch) * radius * Math.abs(Math.cos(elevation)),
          Math.sin(elevation) * radius * 0.7,
          Math.sin(pitch) * radius * Math.abs(Math.cos(elevation)),
        );

        const aiDest = aiTargets[index];
        positions[index] = sphereDest.clone();
        dests[index] = [sphereDest.clone(), boxPosition.clone(), diamondDest.clone(), aiDest.clone(), sohelTargets[index].clone()];
        speeds[index] = new THREE.Vector3();

        dummy.position.copy(positions[index]);
        dummy.lookAt(dests[index][0]);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    particleMesh.instanceMatrix.needsUpdate = true;

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const onMouseMove = (event: MouseEvent) => {
      mousePos.x = event.clientX / window.innerWidth;
      mousePos.y = event.clientY / window.innerHeight;
    };

    const render = () => {
      if (!visible || document.hidden) return;

      phase += 0.02;
      const phaseIndex = Math.floor(phase) % 5;

      for (let i = 0; i < particles; i += 1) {
        const particle = positions[i];
        const dest = dests[i][phaseIndex];
        const diff = tempVec.copy(dest).sub(particle);
        speeds[i].multiplyScalar(0.9);
        speeds[i].add(diff.multiplyScalar(0.05));
        particle.add(speeds[i]);

        dummy.position.copy(particle);
        dummy.lookAt(dest);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);
      }

      particleMesh.instanceMatrix.needsUpdate = true;
      parentContainer.rotation.y = phase * 2.1;
      parentContainer.rotation.x = (mousePos.y - 0.5) * Math.PI * 0.15;
      parentContainer.rotation.z = (mousePos.x - 0.5) * Math.PI * 0.08;

      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) frame = requestAnimationFrame(render);
    });

    const resizeObserver = new ResizeObserver(resize);
    const onVisibilityChange = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && visible) frame = requestAnimationFrame(render);
    };

    window.addEventListener("mousemove", onMouseMove);
    document.addEventListener("visibilitychange", onVisibilityChange);
    observer.observe(container);
    resizeObserver.observe(container);
    resize();
    render();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className="three-home-canvas" aria-hidden="true" />;
};

export default ThreeSphereHome;
