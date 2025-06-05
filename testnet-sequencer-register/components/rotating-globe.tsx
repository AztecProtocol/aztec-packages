"use client"

import { useRef, useEffect } from "react"
import * as THREE from "three"

export default function RotatingGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Scene setup
    const scene = new THREE.Scene()

    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.z = 5

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(0x000000, 0)
    containerRef.current.appendChild(renderer.domElement)

    // Globe geometry
    const sphereGeometry = new THREE.SphereGeometry(1.5, 64, 64)

    // Globe material with custom shader for a grid-like effect
    const sphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color(0xe0b3ff) }, // pastel lavender
        color2: { value: new THREE.Color(0xc1b6fc) }, // pastel blue
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          // Grid pattern
          float latitude = acos(vPosition.y / length(vPosition));
          float longitude = atan(vPosition.z, vPosition.x);
          
          float latGrid = smoothstep(0.98, 1.0, abs(cos(latitude * 20.0)));
          float longGrid = smoothstep(0.98, 1.0, abs(cos(longitude * 20.0)));
          
          float grid = max(latGrid, longGrid) * 0.5;
          
          // Pulse effect
          float pulse = 0.5 + 0.5 * sin(time * 0.5);
          
          // Combine effects
          vec3 color = mix(color1, color2, pulse * 0.3);
          color = mix(color, vec3(0.95, 0.90, 1.0), grid); // pastel pink/white
          
          // Add glow at the edges
          float edgeGlow = 1.0 - pow(dot(normalize(vPosition), vec3(0.0, 0.0, 1.0)), 1.0);
          color = mix(color, vec3(0.95, 0.90, 1.0), edgeGlow * 0.2); // pastel pink/white
          
          gl_FragColor = vec4(color, 0.9);
        }
      `,
      transparent: true,
    })

    // Create the globe
    const globe = new THREE.Mesh(sphereGeometry, sphereMaterial)
    scene.add(globe)

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    // Add point light
    const pointLight = new THREE.PointLight(0x9966ff, 1)
    pointLight.position.set(5, 3, 5)
    scene.add(pointLight)

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener("resize", handleResize)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)

      // Rotate the globe
      globe.rotation.y += 0.001

      // Update time uniform for shader
      if (sphereMaterial.uniforms) {
        sphereMaterial.uniforms.time.value += 0.01
      }

      renderer.render(scene, camera)
    }
    animate()

    // Cleanup
    return () => {
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
}
