import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/development-team.css';

export default function DevelopmentTeam({ admin = false }) {
  const dialog = useRef(null);
  const id = useId();
  const title = admin ? 'About TVTMS' : 'Development Team';

  return <>
    <button type="button" className={`tvtms-team-trigger${admin ? ' tvtms-team-trigger-admin' : ''}`}
      aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current?.showModal()}>
      {admin ? <>
        <svg className="tvtms-team-trigger-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>
        </svg>
        <span className="tvtms-team-trigger-copy"><span className="tvtms-team-trigger-label">{title}</span><span className="tvtms-team-trigger-helper">Tap to view project details</span></span>
        <svg className="tvtms-team-trigger-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>
      </> : <>
        <svg className="tvtms-team-footer-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>
        </svg>
        <span>{title}</span>
      </>}
    </button>
    {createPortal(
      <dialog ref={dialog} id={id} className="tvtms-team-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-institution`}>
        <header className="tvtms-team-header">
          <div><p className="tvtms-team-eyebrow">{admin ? 'Development Team' : 'TVTMS'}</p><h2 id={`${id}-title`}>{title}</h2></div>
          <form method="dialog"><button type="submit" className="tvtms-team-close" aria-label="Close development team information" autoFocus>×</button></form>
        </header>
        <div className="tvtms-team-content">
          <ul className="tvtms-team-members">
            <li><strong>Klint Paul R. Bayarcal</strong><span>Developer</span></li>
            <li><strong>Edcel F. Clarin</strong><span>Thesis Partner</span></li>
          </ul>
          <div className="tvtms-team-institution" id={`${id}-institution`}>
            <p>Bohol Island State University – Calape Campus</p>
            <p>Bachelor of Science in Computer Science · 2026</p>
          </div>
        </div>
      </dialog>, document.body)}
  </>;
}
