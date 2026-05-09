import { useEffect, useRef } from "react";
import * as THREE from "three";

const ThreeSphereHome = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(max-width: 1023px)").matches) return;

    const mousePos = { x: 0.5, y: 0.5 };
    let phase = 0;
    let frame = 0;
    let visible = true;

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

    const boxSize = 0.2;
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      color: 0xff0000,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const pitchSegments = 60;
    const elevationSegments = pitchSegments / 2;
    const particles = pitchSegments * elevationSegments;
    const side = Math.pow(particles, 1 / 3);
    const radius = 16;
    const parentContainer = new THREE.Object3D();
    const particleMesh = new THREE.InstancedMesh(geometry, material, particles);
    const dummy = new THREE.Object3D();
    const positions: THREE.Vector3[] = [];
    const dests: [THREE.Vector3, THREE.Vector3][] = [];
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

        positions[index] = boxPosition.clone();
        dests[index] = [sphereDest, boxPosition.clone()];
        speeds[index] = new THREE.Vector3();

        dummy.position.copy(boxPosition);
        dummy.lookAt(sphereDest);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
    particleMesh.instanceMatrix.needsUpdate = true;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
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

      phase += 0.002;

      for (let i = 0; i < particles; i += 1) {
        const particle = positions[i];
        const dest = dests[i][Math.floor(phase) % dests[i].length].clone();
        const diff = dest.sub(particle);
        speeds[i].divideScalar(1.02);
        speeds[i].add(diff.divideScalar(400));
        particle.add(speeds[i]);

        dummy.position.copy(particle);
        dummy.lookAt(dests[i][Math.floor(phase) % dests[i].length]);
        dummy.updateMatrix();
        particleMesh.setMatrixAt(i, dummy.matrix);
      }

      particleMesh.instanceMatrix.needsUpdate = true;
      parentContainer.rotation.y = phase * 3;
      parentContainer.rotation.x = (mousePos.y - 0.5) * Math.PI;
      parentContainer.rotation.z = (mousePos.x - 0.5) * Math.PI;

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

  return <div ref={containerRef} className="three-home-canvas hidden lg:block" aria-hidden="true" />;
};

export default ThreeSphereHome;
