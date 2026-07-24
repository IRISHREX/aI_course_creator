import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

type ThreeParticleBackgroundProps = {
  className?: string;
};

export function ThreeParticleBackground({ className }: ThreeParticleBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return;

    let mousePos = { x: 0.5, y: 0.5 };
    let phase = 0;
    let frameId = 0;
    let visible = true;
    const tempVec = new THREE.Vector3();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      95,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000,
    );
    camera.position.z = 30;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.className = "h-full w-full";
    mount.appendChild(renderer.domElement);

    const boxSize = 0.2;
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      color: 0xff0000,
      opacity: 0.4,
      side: THREE.DoubleSide,
    });

    const pitchSegments = 40;
    const elevationSegments = 18;
    const particles = pitchSegments * elevationSegments;
    const side = Math.pow(particles, 1 / 3);
    const radius = 16;
    const parentContainer = new THREE.Object3D();
    scene.add(parentContainer);

    const posInBox = (place: number) => ((place / side) - 0.5) * radius * 1.2;

    for (let p = 0; p < pitchSegments; p += 1) {
      const pitch = (Math.PI * 2 * p) / pitchSegments;

      for (let e = 0; e < elevationSegments; e += 1) {
        const elevation = Math.PI * (e / elevationSegments - 0.5);
        const particle = new THREE.Mesh(geometry, material);
        parentContainer.add(particle);

        const dest = new THREE.Vector3();
        dest.z = Math.sin(pitch) * Math.cos(elevation) * radius;
        dest.x = Math.cos(pitch) * Math.cos(elevation) * radius;
        dest.y = Math.sin(elevation) * radius;

        const index = parentContainer.children.length;
        particle.position.x = posInBox(index % side);
        particle.position.y = posInBox(Math.floor(index / side) % side);
        particle.position.z = posInBox(Math.floor(index / Math.pow(side, 2)) % side);
        particle.userData = {
          dests: [dest, particle.position.clone()],
          speed: new THREE.Vector3(),
        };
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      mousePos = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
    };

    const handleResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const render = () => {
      if (!visible || document.hidden) {
        frameId = 0;
        return;
      }

      phase += 0.002;
      const phaseIndex = Math.floor(phase) % 2;

      for (let i = 0, l = parentContainer.children.length; i < l; i += 1) {
        const particle = parentContainer.children[i];
        const dest = particle.userData.dests[phaseIndex];
        const diff = tempVec.copy(dest).sub(particle.position);

        particle.userData.speed.divideScalar(1.02);
        particle.userData.speed.add(diff.divideScalar(400));
        particle.position.add(particle.userData.speed);
        particle.lookAt(dest);
      }

      parentContainer.rotation.y = phase * 3;
      parentContainer.rotation.x = (mousePos.y - 0.5) * Math.PI;
      parentContainer.rotation.z = (mousePos.x - 0.5) * Math.PI;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(render);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !document.hidden && !frameId) {
        frameId = requestAnimationFrame(render);
      } else if (!visible) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    });
    observer.observe(mount);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      } else if (visible && !frameId) {
        frameId = requestAnimationFrame(render);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    render();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      if (typeof geometry.dispose === "function") {
        geometry.dispose();
      }

      if (typeof material.dispose === "function") {
        material.dispose();
      }

      if (typeof renderer.dispose === "function") {
        renderer.dispose();
      } else {
        const gl = renderer.getContext?.();
        gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
      }

      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-70",
        className,
      )}
    />
  );
}
