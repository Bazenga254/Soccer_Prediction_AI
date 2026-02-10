import { useState, useEffect } from 'react'

export default function HeroCarousel({ images, interval = 3000, children }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (images.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length)
    }, interval)
    return () => clearInterval(timer)
  }, [images.length, interval])

  return (
    <div className="hero-carousel">
      {images.map((img, i) => (
        <div
          key={i}
          className={`hero-slide ${i === currentIndex ? 'active' : ''}`}
          style={{ backgroundImage: `url(${img})` }}
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-content">
        {children}
      </div>
      {images.length > 1 && (
        <div className="hero-dots">
          {images.map((_, i) => (
            <button
              key={i}
              className={`hero-dot ${i === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
