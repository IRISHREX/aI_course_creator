import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

type LessonTerrainBackgroundProps = {
  className?: string;
};

function terrainHeight(x: number, y: number) {
  return (
    Math.sin(x * 0.55) * 0.8 +
    Math.cos(y * 0.65) * 0.7 +
    Math.sin((x + y) * 0.32) * 0.9 +
    Math.cos(Math.sqrt(x * x + y * y) * 0.9) * 0.45
  );
}

export function LessonTerrainBackground({ className }: LessonTerrainBackgroundProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const palette = useMemo(() => {
    if (theme === "dark") return { fog: 0x05070f, colors: [0xffffff] };
    if (theme === "light") return { fog: 0xf8fbff, colors: [0x00ff66] };
    return { fog: 0x05070f, colors: [0xff2038, 0x00a6ff] };
  }, [theme]);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return;

    let frameId = 0;
    let lastTimeMsec: number | null = null;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor?.(palette.fog, 0);
    renderer.setPixelRatio?.(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.className = "h-full w-full";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(palette.fog, 0, 45);

    const camera = new THREE.PerspectiveCamera(
      25,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000,
    );
    camera.position.z = 15;
    camera.position.y = 2;
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    scene.add(new THREE.AmbientLight(0x202020));

    const keyLight = new THREE.DirectionalLight(0xffffff, 5);
    keyLight.position.set(0.5, 0, 2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
    fillLight.position.set(-0.5, -0.5, -2);
    scene.add(fillLight);

    const geometry = new THREE.PlaneGeometry(20, 20, 128, 128);
    const positionAttribute = geometry.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < positionAttribute.count; i += 1) {
      const x = positionAttribute.getX(i);
      const y = positionAttribute.getY(i);
      positionAttribute.setZ(i, terrainHeight(x, y));
    }

    geometry.computeVertexNormals();

    const meshes = palette.colors.map((color, index) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: theme === "light" ? 0.55 : 0.42,
        wireframe: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.lookAt(new THREE.Vector3(0, 1, 0));
      mesh.scale.y = 3.5;
      mesh.scale.x = 3;
      mesh.scale.z = 0.2;
      mesh.scale.multiplyScalar(10);
      mesh.position.x = index * 0.18;
      mesh.position.y = index * -0.12;
      scene.add(mesh);
      return { mesh, material };
    });

    const handleResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const animate = (nowMsec: number) => {
      frameId = requestAnimationFrame(animate);
      lastTimeMsec = lastTimeMsec || nowMsec - 1000 / 60;
      const deltaMsec = Math.min(200, nowMsec - lastTimeMsec);
      lastTimeMsec = nowMsec;

      meshes.forEach(({ mesh }, index) => {
        mesh.rotation.z += (index === 0 ? 0.2 : -0.14) * (deltaMsec / 1000);
      });

      renderer.render(scene, camera);
    };

    window.addEventListener("resize", handleResize);
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);

      meshes.forEach(({ material }) => {
        if (typeof material.dispose === "function") material.dispose();
      });

      if (typeof geometry.dispose === "function") geometry.dispose();

      if (typeof renderer.dispose === "function") {
        renderer.dispose();
      } else {
        const gl = renderer.getContext?.();
        gl?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
      }

      renderer.domElement.parentNode?.removeChild(renderer.domElement);
    };
  }, [palette, theme]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={cn("pointer-events-none fixed inset-0 z-0 overflow-hidden", className)}
    />
  );
}
