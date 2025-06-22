import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { useSprings } from '@react-spring/web'
import { Chart, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale)

export default function App(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const leafRefs = useRef<THREE.Mesh[]>([])
  const badLeaves = useRef<Set<number>>(new Set())
  const [_, setRerender] = useState(0)

  // All leaves start at scale 0
  const [leafSprings, api] = useSprings(7, i => ({
    scale: 1,
    config: { tension: 180, friction: 18 },
  }))

  // Use state for growth level
  const [growthLevel, setGrowthLevel] = useState(0)
  const growthLevelRef = useRef(0)

  // --- Watering state ---
  const [waterLevel, setWaterLevel] = useState(1) // 1 = full, 0 = empty
  const waterLevelRef = useRef(1)
  const [watering, setWatering] = useState(false)
  const [showWaterEffect, setShowWaterEffect] = useState(false)
  const wateringTimeout = useRef<NodeJS.Timeout | null>(null)
  const holdTimeout = useRef<NodeJS.Timeout | null>(null)
  const [holding, setHolding] = useState(false)

  // --- Growth history for the graph ---
  const [growthHistory, setGrowthHistory] = useState<number[]>([])
  const growthHistoryRef = useRef<number[]>([])

  // --- Day tracking state ---
  const [dayProgress, setDayProgress] = useState(0) // 0 to 1

  // Simulate a "day" as 60 seconds for demo (adjust as needed)
  useEffect(() => {
    const start = Date.now()
    const duration = 60 * 1000 // 60 seconds per day
    let raf: number

    function update() {
      const elapsed = Date.now() - start
      let progress = (elapsed % duration) / duration
      setDayProgress(progress)
      raf = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(raf)
  }, [])

  // --- Add growth level to history every second ---
  useEffect(() => {
    const interval = setInterval(() => {
      growthHistoryRef.current = [
        ...growthHistoryRef.current.slice(-29),
        growthLevelRef.current
      ]
      setGrowthHistory([...growthHistoryRef.current])
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // --- Water level logic ---
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (watering) {
      interval = setInterval(() => {
        setWaterLevel(w => {
          const next = Math.min(1, w + 0.02)
          waterLevelRef.current = next
          return next
        })
      }, 100)
    } else {
      interval = setInterval(() => {
        setWaterLevel(w => {
          const next = Math.max(0, w - 0.002)
          waterLevelRef.current = next
          return next
        })
      }, 100)
    }
    return () => clearInterval(interval)
  }, [watering])

  // --- Watering hold logic ---
  function handlePlantAreaPointerDown(e: React.PointerEvent) {
    if (wateringTimeout.current) clearTimeout(wateringTimeout.current)
    setHolding(true)
    holdTimeout.current = setTimeout(() => {
      setWatering(true)
      setShowWaterEffect(true)
      wateringTimeout.current = setTimeout(() => {
        setWatering(false)
        setShowWaterEffect(false)
      }, 1200)
    }, 1000) // must hold for 1 second
  }
  function handlePlantAreaPointerUp(e: React.PointerEvent) {
    setHolding(false)
    if (holdTimeout.current) clearTimeout(holdTimeout.current)
    if (wateringTimeout.current) clearTimeout(wateringTimeout.current)
    if (watering) {
      setWatering(false)
      setShowWaterEffect(false)
    }
  }
  function handlePlantAreaPointerLeave(e: React.PointerEvent) {
    setHolding(false)
    if (holdTimeout.current) clearTimeout(holdTimeout.current)
    if (wateringTimeout.current) clearTimeout(wateringTimeout.current)
    if (watering) {
      setWatering(false)
      setShowWaterEffect(false)
    }
  }

  useEffect(() => {
    let animationFrame: number
    let badLeafInterval: NodeJS.Timeout

    if (!containerRef.current) return

    // Setup sizes
    const width = containerRef.current.clientWidth
    const height = containerRef.current.clientHeight

    // Scene, Camera, Renderer
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.z = 4.5

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(width, height)
    containerRef.current.appendChild(renderer.domElement)

    // Pot
    const potGeometry = new THREE.CylinderGeometry(0.8, 0.6, 0.6, 32)
    const potMaterial = new THREE.MeshStandardMaterial({ color: '#8b5a2b' })
    const pot = new THREE.Mesh(potGeometry, potMaterial)
    pot.position.y = -1

    // Stem (tapered at the top, sits on pot)
    const stemHeight = 2.05
    const stemGeometry = new THREE.CylinderGeometry(0.09, 0.09, stemHeight, 12)
    const stemMaterial = new THREE.MeshStandardMaterial({ color: '#2d6a4f' })
    const stem = new THREE.Mesh(stemGeometry, stemMaterial)
    stem.position.y = stemHeight / 2 - 1

    // Add a small tapered tip for the stem (tapering up)
    const tipHeight = 0.18
    const tipGeometry = new THREE.CylinderGeometry(0.01, 0.08, tipHeight, 12)
    const tipMaterial = new THREE.MeshStandardMaterial({ color: '#2d6a4f' })
    const tip = new THREE.Mesh(tipGeometry, tipMaterial)
    tip.position.y = stemHeight + tipHeight / 2 - 1

    // Plant group
    const plant = new THREE.Group()
    plant.add(pot, stem, tip)

    // Leaf geometry
    function createLeaf(material: THREE.Material): THREE.Mesh {
      const leafLength = 1.2
      const leafWidth = 0.22
      const points: THREE.Vector2[] = []
      for (let i = 0; i <= 16; i++) {
        const t = i / 16
        const x = Math.sin(Math.PI * t) * leafWidth * (0.7 + 0.3 * Math.sin(Math.PI * t))
        const y = t * leafLength
        points.push(new THREE.Vector2(x, y))
      }
      for (let i = 16; i >= 0; i--) {
        const t = i / 16
        const x = -Math.sin(Math.PI * t) * leafWidth * (0.7 + 0.3 * Math.sin(Math.PI * t))
        const y = t * leafLength
        points.push(new THREE.Vector2(x, y))
      }
      const shape = new THREE.Shape(points)
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.04,
        bevelEnabled: false,
        steps: 1,
      })
      geometry.translate(0, -leafLength / 2, 0)
      geometry.rotateX(-Math.PI / 10)
      geometry.translate(0, leafLength / 2, 0)
      geometry.computeVertexNormals()
      return new THREE.Mesh(geometry, material)
    }

    // Materials
    const healthyMaterial = new THREE.MeshStandardMaterial({ color: '#95d5b2', side: THREE.DoubleSide })
    const badMaterial = new THREE.MeshStandardMaterial({ color: '#c0a16b', side: THREE.DoubleSide })

    // Leaves
    leafRefs.current = []
    const leafCount = 6

    // Arrange leaves in pairs, alternating left/right, up the stem
    const yOffset = -0.8
    const leafOffsets = [
      { y: 0.3 + yOffset, angle: Math.PI / 3, side: 1 },
      { y: 0.6 + yOffset, angle: Math.PI / 3, side: -1 },
      { y: 0.9 + yOffset, angle: Math.PI / 2.2, side: 1 },
      { y: 1.2 + yOffset, angle: Math.PI / 2.2, side: -1 },
      { y: 1.5 + yOffset, angle: Math.PI / 1.7, side: 1 },
      { y: 1.8 + yOffset, angle: Math.PI / 1.7, side: -1 },
    ]

    for (let i = 0; i < leafCount; i++) {
      const leaf = createLeaf(healthyMaterial.clone())
      const { y, angle, side } = leafOffsets[i]
      const radius = 0.13

      leaf.position.set(
        Math.cos(angle) * radius * side,
        y,
        Math.sin(angle) * radius * side
      )
      leaf.lookAt(0, y + 0.2, 0)
      leaf.rotateZ(side * Math.PI / 7)
      leaf.scale.set(0, 0, 0)
      leaf.userData.index = i
      plant.add(leaf)
      leafRefs.current.push(leaf)
    }

    // Top leaf
    const topLeaf = createLeaf(healthyMaterial.clone())
    topLeaf.position.set(0, stemHeight + tipHeight - 1 + yOffset, 0)
    topLeaf.rotation.x = Math.PI / 2
    topLeaf.scale.set(0, 0, 0)
    topLeaf.userData.index = 6
    plant.add(topLeaf)
    leafRefs.current.push(topLeaf)

    scene.add(plant)

    // Lighting
    const dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.position.set(5, 5, 5)
    scene.add(dirLight)
    const ambLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambLight)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enableZoom = false
    controls.enablePan = false

    // Mobile: Only allow rotation with two fingers
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    if (isMobile) {
      controls.enableRotate = false
      renderer.domElement.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          controls.enableRotate = true
        } else {
          controls.enableRotate = false
        }
      })
      renderer.domElement.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
          controls.enableRotate = false
        }
      })
      renderer.domElement.addEventListener('touchcancel', () => {
        controls.enableRotate = false
      })
    }

    // --- GROW ALL LEAVES AT ONCE ON MOUNT ---
    api.start(i => ({
      scale: 1,
      config: { tension: 180, friction: 18 },
    }))

    // --- BAD LEAF LOGIC ---
    function getBadLeafChance() {
      // 1% at full water, 25% at empty
      return 0.01 + (1 - waterLevelRef.current) * 0.24
    }
    badLeafInterval = setInterval(() => {
      const chance = getBadLeafChance()
      if (Math.random() < chance) {
        const candidates = leafRefs.current
          .map((_, i) => i)
          .filter(i => !badLeaves.current.has(i))

        if (candidates.length > 0) {
          const badIndex = candidates[Math.floor(Math.random() * candidates.length)]
          const leaf = leafRefs.current[badIndex]
          leaf.material = badMaterial.clone()
          badLeaves.current.add(badIndex)
        }
      }
    }, 1000)

    // --- PRUNE BAD LEAF ON CLICK ---
    function onClick(event: MouseEvent) {
      if (!containerRef.current) return
      const bounds = containerRef.current.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(leafRefs.current)
      if (intersects.length > 0) {
        const i = intersects[0].object.userData.index
        if (badLeaves.current.has(i)) {
          api.start(idx => idx === i ? { scale: 0, config: {tension: 180, friction: 18} } : {})
          setTimeout(() => {
            badLeaves.current.delete(i)
            leafRefs.current[i].material = healthyMaterial.clone()
            api.start(idx => idx === i ? { scale: 1, config: { duration: 22000 } } : {})
          }, 600)
        }
      }
    }
    containerRef.current.addEventListener('click', onClick)

    // --- ANIMATION LOOP ---
    function animate() {
      animationFrame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      leafRefs.current.forEach((leaf, i) => {
        const spring = leafSprings[i]
        if (spring) {
          const s = spring.scale.get()
          leaf.scale.set(s, s, s)
        }
      })

      // Calculate growth level (store in ref, not state)
      let total = 0 
      let count = 7
      leafRefs.current.forEach((_, i) => {
        const spring = leafSprings[i]
        if (spring && !badLeaves.current.has(i)) {
          total += spring.scale.get()
        }
      })
      growthLevelRef.current = total / count
      setGrowthLevel(growthLevelRef.current)
    }
    animate()

    // Handle resize
    function handleResize() {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', handleResize)

    // Cleanup
    return () => {
      clearInterval(badLeafInterval)
      window.removeEventListener('resize', handleResize)
      containerRef.current?.removeEventListener('click', onClick)
      controls.dispose()
      renderer.dispose()
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
      }
      cancelAnimationFrame(animationFrame)
    }
  // eslint-disable-next-line
  }, [])

  return (
    <>
      {/* Minimalist font for the whole app */}
      <style>
        {`
          html, body, #root {
            font-family: 'Inter', 'Segoe UI', 'Arial', 'sans-serif';
            letter-spacing: 0.01em;
          }
        `}
      </style>
      {/* Google Fonts for Inter */}
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap"
        rel="stylesheet"
      />
      {/* Day Progress Bar */}
      <DayBar progress={dayProgress} />
      <div
        ref={containerRef}
        style={{
          width: '100vw',
          height: '100vh',
          background: '#8fcfcf',
          margin: 0,
          padding: 0,
          overflow: 'hidden',
          position: 'fixed',
          top: 0,
          left: 0,
          fontFamily: "'Inter', 'Segoe UI', 'Arial', 'sans-serif'",
        }}
        onPointerDown={handlePlantAreaPointerDown}
        onPointerUp={handlePlantAreaPointerUp}
        onPointerLeave={handlePlantAreaPointerLeave}
      />
      {/* Watering visual effect */}
      {showWaterEffect && <WaterEffect />}
      {/* Sliding Graph Panel */}
      <SlidingGraph growthHistory={growthHistory} />
      {/* Water Level Bar */}
      <WaterBar waterLevel={waterLevel} watering={watering} holding={holding} />
      {/* Growth Level Bar */}
      <GrowthBar growthLevel={growthLevel} />
    </>
  )
}

// --- WaterEffect component ---
function WaterEffect() {
  // Simple animated SVG drops
  return (
    <svg
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <ellipse
            cx={`50%`}
            cy={`${10 + i * 16}%`}
            rx="12"
            ry="22"
            fill="#4fc3f7"
            opacity="0.7"
          >
            <animate
              attributeName="cy"
              from={`${-10 + i * 8}%`}
              to="70%"
              dur="1.1s"
              begin={`${i * 0.13}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              from="0.7"
              to="0"
              dur="1.1s"
              begin={`${i * 0.13}s`}
              repeatCount="indefinite"
            />
          </ellipse>
        </g>
      ))}
    </svg>
  )
}

// --- SlidingGraph component ---
function SlidingGraph({ growthHistory }: { growthHistory: number[] }) {
  const [open, setOpen] = useState(false)
  const [dragStartY, setDragStartY] = useState<number | null>(null)
  const [panelY, setPanelY] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const chartInstance = useRef<Chart | null>(null)

  // Mouse drag events
  function onMouseDown(e: React.MouseEvent) {
    setDragStartY(e.clientY)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }
  function onMouseMove(e: MouseEvent) {
    if (dragStartY !== null) {
      let delta = e.clientY - dragStartY
      if (!open) {
        delta = Math.max(0, Math.min(200, delta))
        setPanelY(delta)
      } else {
        delta = Math.max(-200, Math.min(0, delta))
        setPanelY(200 + delta)
      }
    }
  }
  function onMouseUp(e: MouseEvent) {
    if (dragStartY !== null) {
      if (!open) {
        if (panelY > 100) setOpen(true)
        setPanelY(0)
      } else {
        if (panelY < 100) setOpen(false)
        setPanelY(0)
      }
      setDragStartY(null)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }

  // Touch drag events for mobile
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setDragStartY(e.touches[0].clientY)
      document.addEventListener('touchmove', onTouchMove)
      document.addEventListener('touchend', onTouchEnd)
      document.addEventListener('touchcancel', onTouchEnd)
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (dragStartY !== null && e.touches.length === 1) {
      let delta = e.touches[0].clientY - dragStartY
      if (!open) {
        delta = Math.max(0, Math.min(200, delta))
        setPanelY(delta)
      } else {
        delta = Math.max(-200, Math.min(0, delta))
        setPanelY(200 + delta)
      }
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (dragStartY !== null) {
      if (!open) {
        if (panelY > 100) setOpen(true)
        setPanelY(0)
      } else {
        if (panelY < 100) setOpen(false)
        setPanelY(0)
      }
      setDragStartY(null)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }

  // Calculate panel position
  const translateY = open ? 0 + panelY : -180 + panelY

  // Chart.js rendering
  useEffect(() => {
    if (!chartRef.current) return
    if (chartInstance.current) {
      chartInstance.current.data.labels = growthHistory.map((_, i) => `${i - growthHistory.length + 1}s`)
      chartInstance.current.data.datasets[0].data = growthHistory.map(v => Math.round(v * 100))
      chartInstance.current.update()
      return
    }
    chartInstance.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels: growthHistory.map((_, i) => `${i - growthHistory.length + 1}s`),
        datasets: [
          {
            label: 'Growth (%)',
            data: growthHistory.map(v => Math.round(v * 100)),
            borderColor: '#2d6a4f',
            backgroundColor: 'rgba(44, 186, 137, 0.15)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 3,
          }
        ]
      },
      options: {
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          title: { display: false }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            min: 0,
            max: 100,
            display: false
          }
        }
      }
    })
    // Cleanup
    return () => {
      chartInstance.current?.destroy()
      chartInstance.current = null
    }
  // eslint-disable-next-line
  }, [])

  // Update chart on growthHistory change
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.data.labels = growthHistory.map((_, i) => `${i - growthHistory.length + 1}s`)
      chartInstance.current.data.datasets[0].data = growthHistory.map(v => Math.round(v * 100))
      chartInstance.current.update()
    }
  }, [growthHistory])

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        zIndex: 30,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Tab */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translate(-50%, 0)',
          width: 80,
          height: 32,
          background: '#fff',
          borderRadius: '0 0 16px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'grab',
          zIndex: 31,
          pointerEvents: 'auto',
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <div style={{
          width: 36,
          height: 6,
          background: '#b7e4c7',
          borderRadius: 3,
        }} />
      </div>
      {/* Sliding Panel */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100vw',
          height: 180,
          background: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          transform: `translateY(${translateY}px)`,
          transition: dragStartY ? 'none' : 'transform 0.3s cubic-bezier(.4,2,.6,1)',
          zIndex: 30,
          pointerEvents: open || dragStartY ? 'auto' : 'none',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <canvas ref={chartRef} width={400} height={120} style={{ width: '90%', height: 120, marginTop: 32 }} />
      </div>
    </div>
  )
}

// --- WaterBar component ---
function WaterBar({ waterLevel, watering, holding }: { waterLevel: number, watering: boolean, holding: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        left: 32,
        width: 32,
        height: 160,
        background: '#e0e0e0',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 50,
        border: holding ? '2px solid #4fc3f7' : undefined,
      }}
    >
      <div
        style={{
          width: '100%',
          height: `${waterLevel * 100}%`,
          background: watering ? '#4fc3f7' : '#90caf9',
          borderRadius: 12,
          transition: 'height 0.3s, background 0.3s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 40,
            bottom: 0,
            color: '#1976d2',
            fontWeight: 600,
            fontSize: 16,
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 6,
            padding: '2px 8px',
            marginLeft: 8,
            marginBottom: 8,
            userSelect: 'none',
          }}
        >
          {Math.round(waterLevel * 100)}%
        </span>
      </div>
    </div>
  )
}

// --- GrowthBar component ---
function GrowthBar({ growthLevel }: { growthLevel: number }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        width: 32,
        height: 160,
        background: '#e0e0e0',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: '100%',
          height: `${growthLevel * 100}%`,
          background: '#81c784',
          borderRadius: 12,
          transition: 'height 0.3s, background 0.3s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            right: 40,
            bottom: 0,
            color: '#388e3c',
            fontWeight: 600,
            fontSize: 16,
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 6,
            padding: '2px 8px',
            marginRight: 8,
            marginBottom: 8,
            userSelect: 'none',
          }}
        >
          {Math.round(growthLevel * 100)}%
        </span>
      </div>
    </div>
  )
}

// --- DayBar component ---
function DayBar({ progress }: { progress: number }) {
  // Gradient: black -> white -> black
  const gradient =
    'linear-gradient(90deg, #111 0%, #fff 50%, #111 100%)'
  return (
    <div
      style={{
        position: 'fixed',
        top: 56, // Lowered from 24
        left: '50%',
        transform: 'translateX(-50%)',
        width: '40vw',
        minWidth: 240,
        maxWidth: 520,
        height: 18,
        background: '#e0e0e0',
        borderRadius: 12,
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        border: '1.5px solid #333',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(2, progress * 100)}%`,
          background: gradient,
          borderRadius: 12,
          transition: 'width 0.3s cubic-bezier(.4,2,.6,1)',
        }}
      />
    </div>
  )
}