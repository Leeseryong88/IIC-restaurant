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
    const particleCount = 180; // Significantly increased for a denser, starry look
    const connectionDistance = 110; // Reduced to keep the network delicate with more points
    const mouse = { x: null, y: null, radius: 140 }; // Reduced interaction radius

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
        this.size = Math.random() * 1.2 + 0.4; // Even smaller, more delicate points
        this.baseSize = this.size;
        this.vx = (Math.random() - 0.5) * 0.12; // Slower movement speed
        this.vy = (Math.random() - 0.5) * 0.12; // Slower movement speed
        this.opacity = Math.random() * 0.25 + 0.1; // Very subtle brightness
        this.baseOpacity = this.opacity;
      }

      draw() {
        // Draw small subtle glow
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${this.opacity * 0.4})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw core
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        // Wrap around screen
        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        if (this.x < -20) this.x = w + 20;
        if (this.x > w + 20) this.x = -20;
        if (this.y < -20) this.y = h + 20;
        if (this.y > h + 20) this.y = -20;

        // Repulsion Interaction: Move slowly away from mouse
        if (mouse.x != null && mouse.y != null) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < mouse.radius) {
            const force = (mouse.radius - distance) / mouse.radius;
            // Drifting away even more slowly
            this.x -= dx * force * 0.01;
            this.y -= dy * force * 0.01;
            
            this.opacity = Math.min(0.4, this.opacity + 0.003);
          } else {
            if (this.opacity > this.baseOpacity) this.opacity -= 0.001;
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
        
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < connectionDistance) {
            const opacity = (1 - (distance / connectionDistance)) * 0.06;
            
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 0.25;
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
        filter: 'blur(0.2px)'
      }}
    />
  );
};

export default GeometricBackground;
