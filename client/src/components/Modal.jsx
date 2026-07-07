export default function Modal({ title, onClose, children, wide = false }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/70 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`rise w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-xl border border-edge-bright bg-ink-900 shadow-[0_24px_80px_rgb(0_0_0/0.55)]`}
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3.5">
          <h2 className="font-display text-[15px] font-semibold text-snow">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-0.5 text-lg leading-none text-fog transition-colors hover:bg-ink-800 hover:text-snow"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
