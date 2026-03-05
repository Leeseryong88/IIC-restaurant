import React, { useEffect, useRef } from 'react';

const GeometricBackground = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const handleResize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      init();
    };

    window.addEventListener('resize', handleResize);

    const particles = [];
    const particleCount = 45; // Fewer particles for more sophistication
    const connectionDistance = 200;
    const mouse = { x: null, y: null, radius: 250 };

    const handleMouseMove = (event) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * (canvas.width / window.devicePixelRatio);
        this.y = Math.random() * (canvas.height / window.devicePixelRatio);
        this.size = Math.random() * 3 + 1;
        this.baseSize = this.size;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.opacity = Math.random() * 0.5 + 0.2;
        this.glow = Math.random() * 15 + 5;
        this.colorAngle = Math.random() * 360;
      }

      draw() {
        // Draw glow
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 4);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity + 0.2})`;
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around screen for a more infinite feel
        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        if (this.x < -50) this.x = w + 50;
        if (this.x > w + 50) this.x = -50;
        if (this.y < -50) this.y = h + 50;
        if (this.y > h + 50) this.y = -50;

        // Enhanced Mouse Interaction: Magnetism & Growth
        if (mouse.x != null && mouse.y != null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            // Particles gently lean towards the mouse
            this.x += dx * force * 0.02;
            this.y += dy * force * 0.02;
            
            // Subtle pulse/growth effect near mouse
            this.size = this.baseSize + (force * 2);
            this.opacity = Math.min(0.8, this.opacity + 0.01);
          } else {
            if (this.size > this.baseSize) this.size -= 0.05;
          }
        }
      }
    }

    const init = () => {
      particles.length = 0;
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      // Clear with slight persistence for subtle trails
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < connectionDistance) {
            const opacity = (1 - (distance / connectionDistance)) * 0.12;
            
            // Sophisticated mouse-aware lines
            let finalOpacity = opacity;
            if (mouse.x != null) {
              const mdx = mouse.x - (particles[i].x + particles[j].x) / 2;
              const mdy = mouse.y - (particles[i].y + particles[j].y) / 2;
              const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
              if (mDist < mouse.radius) {
                finalOpacity *= 2; // Brighten lines near mouse
              }
            }

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${finalOpacity})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    handleResize();
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{ 
        background: 'transparent',
        filter: 'blur(0.5px)' // Overall soft feel
      }}
    />
  );
};

export default GeometricBackground;
