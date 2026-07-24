import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

type SphericalLoaderProps = {
  label?: string;
  className?: string;
};

export function SphericalLoader({ label = "Loading", className }: SphericalLoaderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    let visible = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 8.25;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    container.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const sphereGeometry = new THREE.SphereGeometry(2.15, 56, 36);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x38e8ff,
      transparent: true,
      opacity: 0.09,
      wireframe: true,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    group.add(sphere);

    const ringMaterial = new THREE.LineBasicMaterial({
      color: 0x9b5cff,
      transparent: true,
      opacity: 0.55,
    });
    const rings = [0, 1, 2].map((index) => {
      const curve = new THREE.EllipseCurve(0, 0, 2.65 + index * 0.24, 2.65 + index * 0.24, 0, Math.PI * 2);
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(160));
      const ring = new THREE.LineLoop(geometry, ringMaterial);
      ring.rotation.x = Math.PI / (2.5 + index * 0.45);
      ring.rotation.y = index * 0.7;
      group.add(ring);
      return ring;
    });

    const pointCount = 96;
    const pointsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount; i += 1) {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / pointCount));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const radius = 2.5 + (i % 5) * 0.045;
      positions[i * 3] = Math.cos(theta) * Math.sin(phi) * radius;
      positions[i * 3 + 1] = Math.sin(theta) * Math.sin(phi) * radius;
      positions[i * 3 + 2] = Math.cos(phi) * radius;
    }
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.035,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const render = (time = 0) => {
      if (!visible || document.hidden) return;
      const t = time * 0.001;
      group.rotation.y = t * 0.72;
      group.rotation.x = Math.sin(t * 0.7) * 0.18;
      sphere.rotation.z = t * 0.3;
      points.rotation.y = -t * 0.5;
      pointsMaterial.opacity = 0.55 + Math.sin(t * 3.2) * 0.18;
      rings.forEach((ring, index) => {
        ring.rotation.z += 0.006 + index * 0.002;
      });
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
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect();
      observer.disconnect();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      rings.forEach((ring) => ring.geometry.dispose());
      ringMaterial.dispose();
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={cn("flex min-h-[18rem] flex-col items-center justify-center gap-3 text-muted-foreground", className)}>
      <div ref={containerRef} className="h-40 w-40 sm:h-52 sm:w-52" aria-hidden="true" />
      <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-primary">{label}</div>
    </div>
  );
}
