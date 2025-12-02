import { useState, useEffect } from 'react'

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
}

export function useBreakpoint(breakpoint: Breakpoint = 'md'): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const query = `(min-width: ${breakpoints[breakpoint]}px)`
    const media = window.matchMedia(query)
    
    setMatches(media.matches)

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
    
    media.addEventListener('change', listener)
    
    return () => media.removeEventListener('change', listener)
  }, [breakpoint])

  return matches
}

export function useIsMobile(): boolean {
  return !useBreakpoint('md')
}
