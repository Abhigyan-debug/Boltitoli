/** Lightweight 2D version of the hero diorama, for devices without WebGL or with reduced capability. */
export function HeroIllustration2D() {
  const peg = (x: number, y: number, c: string, tall = false) => {
    const h = tall ? 70 : 48;
    return (
      <g transform={`translate(${x},${y})`}>
        <ellipse cx="0" cy="2" rx="16" ry="5" fill="#4a2c16" opacity=".18" />
        <path d={`M-13 0 L-9 ${-h} L9 ${-h} L13 0 Z`} fill={c} />
        <circle cx="0" cy={-h - 12} r="12" fill="#c98f5c" />
        <path d={`M-12 ${-h - 14} a12 12 0 0 1 24 0 z`} fill="#2a1d14" />
        {tall && <path d={`M-10 ${-h + 10} q10 12 20 0`} stroke="#f28a1e" strokeWidth="6" fill="none" />}
      </g>
    );
  };
  return (
    <svg viewBox="0 0 640 420" className="h-full w-full" role="img"
      aria-label="BoltiToli, a small speaker, guides one group of children with number blocks while the teacher works with another group at the chalkboard">
      <rect width="640" height="420" fill="#d9a873" />
      <path d="M0 300 Q320 270 640 300 V420 H0Z" fill="#c99561" />
      {/* chalkboard */}
      <g transform="translate(380,70)">
        <rect width="220" height="140" rx="6" fill="#a46f41" />
        <rect x="10" y="10" width="200" height="120" rx="3" fill="#2b3a35" />
        <text x="110" y="85" textAnchor="middle" fontFamily="Kalam, cursive" fontSize="40" fill="#f7f3ec" fontWeight="700">3 + 2 = ?</text>
        <rect x="30" y="140" width="8" height="70" fill="#8c5f35" />
        <rect x="182" y="140" width="8" height="70" fill="#8c5f35" />
      </g>
      {peg(430, 320, "#2f3672", true)}
      {peg(500, 345, "#5a8f4e")}
      {peg(560, 335, "#3b6ea5")}
      {/* speaker */}
      <g transform="translate(90,210)">
        <rect width="130" height="84" rx="26" fill="#16254a" />
        <rect x="16" y="22" width="98" height="50" rx="10" fill="#1d2250" />
        <circle cx="48" cy="34" r="6" fill="#f28a1e" />
        <circle cx="82" cy="34" r="6" fill="#f28a1e" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${150 + i * 18} ${20 - i * 6} q${18 + i * 6} ${22 + i * 6} 0 ${44 + i * 12}`} stroke="#f28a1e" strokeWidth="5" fill="none" strokeLinecap="round" opacity={0.85 - i * 0.22} />
        ))}
      </g>
      {/* number blocks */}
      {[["3", 90], ["+", 150], ["2", 210]].map(([l, x]) => (
        <g key={l} transform={`translate(${x},330)`}>
          <rect width="48" height="48" rx="6" fill="#d39c63" stroke="#a46f41" strokeWidth="2" />
          <text x="24" y="36" textAnchor="middle" fontFamily="Mukta, sans-serif" fontWeight="800" fontSize="32" fill="#16254a">{l}</text>
        </g>
      ))}
      {peg(60, 330, "#0f7f77")}
      {peg(300, 380, "#d9a441")}
      {peg(320, 300, "#c2553c")}
    </svg>
  );
}
