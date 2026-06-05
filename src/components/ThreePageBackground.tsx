import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

const ThreePageBackground = ({ className }: { className?: string }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    let visible = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 16;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const material = new THREE.LineBasicMaterial({
      color: 0x38e8ff,
      transparent: true,
      opacity: 0.18,
    });

    const rings = [4.5, 7, 10].map((radius, index) => {
      const points = new THREE.EllipseCurve(0, 0, radius, radius * 0.55, 0, Math.PI * 2, false, 0)
        .getPoints(160);
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const ring = new THREE.LineLoop(geometry, material);
      ring.rotation.x = Math.PI / (2.7 + index * 0.3);
      ring.rotation.y = index * 0.6;
      group.add(ring);
      return ring;
    });

    const dotGeometry = new THREE.BufferGeometry();
    const dotCount = 110;
    const positions = new Float32Array(dotCount * 3);
    for (let i = 0; i < dotCount; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    dotGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const dots = new THREE.Points(dotGeometry, new THREE.PointsMaterial({
      color: 0x9b5cff,
      size: 0.035,
      transparent: true,
      opacity: 0.45,
    }));
    scene.add(dots);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = () => {
      if (!visible || document.hidden) return;
      group.rotation.y += 0.0018;
      group.rotation.z += 0.0008;
      rings.forEach((ring, index) => {
        ring.rotation.z += 0.001 * (index + 1);
      });
      dots.rotation.y -= 0.0009;
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

    resizeObserver.observe(container);
    observer.observe(container);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resize();
    render();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      observer.disconnect();
      rings.forEach((ring) => ring.geometry.dispose());
      dotGeometry.dispose();
      material.dispose();
      (dots.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={containerRef} className={cn("pointer-events-none absolute inset-0 z-0 overflow-hidden", className)} aria-hidden="true" />;
};

export default ThreePageBackground;
