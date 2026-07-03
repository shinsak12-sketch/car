// 초록 방패 로고 (rgb(0,133,74) = #00854A)
export default function ShieldLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block' }}>
      <path d="M12 2 L20 4.8 V11 C20 16.2 16.5 20 12 22 C7.5 20 4 16.2 4 11 V4.8 Z" fill="#00854A" />
      <path d="M12 2 L20 4.8 V11 C20 16.2 16.5 20 12 22 Z" fill="#0a9d5c" opacity="0.55" />
      <path
        d="M8.6 12.2 l2.4 2.4 l4.4 -5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
