import { ImageResponse } from 'next/og'
 
export const size = {
  width: 180,
  height: 180,
}
export const contentType = 'image/png'
 
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #2A93FF 0%, #0050FF 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{
          fontSize: 110,
          color: 'white',
          fontWeight: 800,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.04em',
          marginTop: '-5px', // visual centering
          textShadow: '0 4px 10px rgba(0,0,0,0.15)',
        }}>
          K
        </div>
      </div>
    ),
    { ...size }
  )
}
