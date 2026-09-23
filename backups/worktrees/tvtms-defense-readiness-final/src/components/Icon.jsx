const paths = {
  dashboard:'M3 3h7v7H3z M14 3h7v4h-7z M14 11h7v10h-7z M3 14h7v7H3z',
  overview:'M4 19V9 M10 19V5 M16 19v-7 M22 19H2',
  plus:'M12 5v14 M5 12h14',
  ticket:'M3 9a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z M13 5v2 M13 17v2',
  search:'m21 21-4.3-4.3 M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z',
  alert:'M12 3 2.5 20h19z M12 9v4 M12 17h.01',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  payment:'M3 6h18v12H3z M3 10h18 M7 15h3',
  dispute:'M12 3v18 M5 6h14 M7 6l-4 7h8z M17 6l-4 7h8z M8 21h8',
  report:'M6 2h9l5 5v15H6z M14 2v6h6 M9 13h6 M9 17h6',
  analytics:'M4 19V9 M10 19V5 M16 19v-7 M22 19H2 M4 15l5-5 4 3 6-8',
  history:'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 7v5l3 2',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.8 1.8 0 0 0 .36 2l.06.06-2.12 2.12-.06-.06a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.64V20h-3v-.08a1.8 1.8 0 0 0-1.1-1.64 1.8 1.8 0 0 0-2 .36l-.06.06-2.12-2.12.06-.06a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 4.08 13H4v-3h.08a1.8 1.8 0 0 0 1.64-1.1 1.8 1.8 0 0 0-.36-2l-.06-.06 2.12-2.12.06.06a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 10.58 3.5V3h3v.5a1.8 1.8 0 0 0 1.1 1.64 1.8 1.8 0 0 0 2-.36l.06-.06 2.12 2.12-.06.06a1.8 1.8 0 0 0-.36 2A1.8 1.8 0 0 0 20.08 10H20v3h-.08A1.8 1.8 0 0 0 19.4 15z',
  user:'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  logout:'M10 17l5-5-5-5 M15 12H3 M21 19V5a2 2 0 0 0-2-2h-6',
  menu:'M4 6h16 M4 12h16 M4 18h16',
  check:'M20 6 9 17l-5-5',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',
  repeat:'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
  peso:'M7 5h7a4 4 0 0 1 0 8H7 M5 9h10 M5 13h9 M7 3v18',
  map:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z M12 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  car:'M5 17h14l-1-5-2-4H8l-2 4z M7 17v2 M17 17v2 M6 13h12',
  arrow:'M5 12h14 M13 6l6 6-6 6',
  close:'M6 6l12 12 M18 6 6 18',
};

export default function Icon({ name, size=18, className='' }) {
  const d=paths[name] || paths.dashboard;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d}/></svg>;
}
