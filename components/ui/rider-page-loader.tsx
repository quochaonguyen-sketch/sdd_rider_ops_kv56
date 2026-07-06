export function RiderPageLoader() {
  return (
    <div className="grid min-h-[70vh] place-items-center bg-transparent px-6" role="status" aria-live="polite" aria-label="Đang tải dữ liệu">
      <div className="w-full max-w-xl rounded-3xl bg-white/35 px-5 py-8 text-center backdrop-blur-[2px]">
        <div className="rider-loader-track relative mx-auto h-28 overflow-hidden">
          <div className="rider-loader-bike absolute bottom-4 w-32" aria-hidden="true">
            <svg viewBox="0 0 160 90" fill="none" className="w-full overflow-visible drop-shadow-[0_7px_7px_rgba(15,23,42,0.1)]">
              <g className="rider-loader-body">
                <g className="rider-loader-wheel" style={{ transformOrigin: "37px 67px" }}>
                  <circle cx="37" cy="67" r="18" fill="white" fillOpacity=".72" stroke="#334155" strokeWidth="4" />
                  <path d="M37 51v32M21 67h32M26 56l22 22M48 56 26 78" stroke="#94a3b8" strokeWidth="1.5" />
                </g>
                <g className="rider-loader-wheel" style={{ transformOrigin: "123px 67px" }}>
                  <circle cx="123" cy="67" r="18" fill="white" fillOpacity=".72" stroke="#334155" strokeWidth="4" />
                  <path d="M123 51v32M107 67h32M112 56l22 22M134 56l-22 22" stroke="#94a3b8" strokeWidth="1.5" />
                </g>

                <path d="M37 67h34l19-27h27l6 27" stroke="#334155" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M65 67 55 48h39l14 19H65Z" fill="#f97316" stroke="#c2410c" strokeWidth="3" strokeLinejoin="round" />
                <path d="M108 40 99 28h16M113 40h18" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
                <path d="M30 48h28" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
                <rect x="22" y="35" width="33" height="20" rx="4" fill="#f97316" />
                <path d="M27 40h23M27 45h16" stroke="white" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />

                <path d="m88 19 16 15-11 15M88 20 72 43" stroke="#334155" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M76 17c5-7 18-6 21 3l-3 18H76l-5-14 5-7Z" fill="#f97316" />
                <text x="78" y="31" fill="white" fontSize="9" fontWeight="800" fontFamily="Arial, sans-serif">SPX</text>
                <circle cx="84" cy="9" r="8" fill="#f2c49b" />
                <path d="M75 8c2-9 16-10 20 0l-4 3H76l-1-3Z" fill="#f97316" />
                <path d="M93 8h8" stroke="#c2410c" strokeWidth="3" strokeLinecap="round" />
              </g>
            </svg>
          </div>
          <div className="absolute inset-x-5 bottom-1 h-1 overflow-hidden rounded-full bg-slate-200/60">
            <div className="rider-loader-road h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-orange-500 to-transparent" />
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold tracking-tight text-slate-700/90">Đang tải dữ liệu vận hành</p>
        <p className="mt-1 text-xs text-slate-400">SPX rider đang tới...</p>
      </div>
    </div>
  );
}
