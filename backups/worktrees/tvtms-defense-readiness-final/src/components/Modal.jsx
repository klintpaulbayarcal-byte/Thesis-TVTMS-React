import { useEffect, useId } from 'react';
export default function Modal({ open, title, children, onClose, footer, size='md' }) {
  const titleId = useId();
  useEffect(() => { const h=e=>e.key==='Escape'&&onClose?.(); if(open) window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h); },[open,onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}><section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header><h2 id={titleId}>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></header><div className="modal-body">{children}</div>{footer && <footer>{footer}</footer>}</section></div>;
}
