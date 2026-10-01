/* ═══════════════════════════════════════════════════════════════════
   Hub definitions — one config per hub route, consumed by <HubPage>.
   Reproduces every hub page from the original static site 1:1.
   ═══════════════════════════════════════════════════════════════════ */
import React from 'react';
import type { HubConfig } from '@/components/HubPage';

const FOOTER = {
  boarding: 'H-FARM International School · Boarding Management',
  itPlatform: 'H-FARM International School · IT — Device Management Platform',
  it: 'H-FARM International School · IT — Device Management',
  hr: 'H-FARM International School · HR Management',
  office: 'H-FARM International School · Student Office',
  parents: 'H-FARM International School · Parents Area',
};

// ── Icons (viewBox 0 0 24 24), matching the original inline SVGs ──
const I = {
  house: (
    <svg viewBox="0 0 24 24">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  shieldPlus: (
    <svg viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  ),
  asset: (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M7 9h2M7 12h2M11 9h6M11 12h6" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H5" />
      <circle cx="17" cy="13.5" r="1.3" />
    </svg>
  ),
  boxStudent: (
    <svg viewBox="0 0 24 24">
      <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  briefcase: (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  exit: (
    <svg viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  bus: (
    <svg viewBox="0 0 24 24">
      <path d="M8 6v6M16 6v6M2 12h19.6" />
      <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.6 6.8 19.7 6 18.7 6H5.3C4.3 6 3.4 6.8 3.1 7.8l-1.4 5c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2C2 16.3 2.5 18 2.5 18H6" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24">
      <path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" />
      <path d="m8.5 8.5 7 7" />
    </svg>
  ),
  diet: (
    <svg viewBox="0 0 24 24">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
    </svg>
  ),
  checkin: (
    <svg viewBox="0 0 24 24">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  checkout: (
    <svg viewBox="0 0 24 24">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </svg>
  ),
  userPlus: (
    <svg viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  userMinus: (
    <svg viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  photos: (
    <svg viewBox="0 0 24 24">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <polyline points="8.5 9 10.5 11 14 7.5" />
      <line x1="8.5" y1="15" x2="15.5" y2="15" />
    </svg>
  ),
  userCheck: (
    <svg viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="23 11 17 11" />
      <line x1="20" y1="8" x2="20" y2="14" />
    </svg>
  ),
};

const HR_ONBOARDING_XLSX =
  'https://naeeuro-my.sharepoint.com/:x:/r/personal/a_dalle-carbonare_h-farmschool_com/_layouts/15/Doc.aspx?sourcedoc=%7BF17C3436-1E19-4DA7-9501-27ED72F0CC9C%7D&file=Book%204.xlsx&action=editNew&mobileredirect=true&wdOrigin=WAC.EXCEL.HOME-BUTTON%2CAPPHOME-WEB.BANNER.NEWBLANK&wdPreviousSession=73e6f62c-415b-4aef-a817-43fd63dd4cd1&wdPreviousSessionSrc=AppHomeWeb&ct=1784034749187';
const HR_OFFBOARDING_XLSX =
  'https://naeeuro-my.sharepoint.com/:x:/r/personal/a_dalle-carbonare_h-farmschool_com/_layouts/15/Doc.aspx?sourcedoc=%7B9838BF83-0425-4EB7-8E60-1C2FC4ADD328%7D&file=Offboarding%20dipendenti.xlsx&action=default&mobileredirect=true&wdOrigin=WAC.EXCEL.HOME-BUTTON%2CAPPHOME-WEB.FILEBROWSER.RECENT&wdPreviousSession=73e6f62c-415b-4aef-a817-43fd63dd4cd1&wdPreviousSessionSrc=AppHomeWeb&ct=1784034821388';
const ROOM_PHOTOS_XLSX =
  'https://naeeuro.sharepoint.com/:x:/r/sites/BoardingCameraAssignements/_layouts/15/Doc.aspx?sourcedoc=%7BC829930B-9152-4968-A22A-E69BBB3544F7%7D&file=Boarding%20Camera%20Assignements.xlsx&action=edit&mobileredirect=true&wdMsFormsCorrelationId=b8c77c60-94f0-4dcd-b1ac-13695fbaa498';
const ROOM_PHOTOS_HISTORY =
  'https://naeeuro.sharepoint.com/sites/BoardingCameraAssignements/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsites%2FBoardingCameraAssignements%2FShared%20Documents%2FApps%2FMicrosoft%20Forms%2FBoarding%20Camera%20Assignements%2FQuestion&viewid=0f0d5dca%2D9b97%2D4f2c%2Db67a%2D4c898e3a526e&FolderCTID=0x012000278BBD1D512ACE448DC7BCC3BD138882';

export const HUBS: Record<string, HubConfig> = {
  boarding: {
    roles: ['boarding', 'admin'],
    topbar: { label: 'Home', href: '/', variant: 'home' },
    titlePre: 'Boarding ',
    titleSpan: 'Management',
    subtitle: 'Student boarding tools and resources',
    footer: FOOTER.boarding,
    cards: [
      { icon: I.house, name: 'Room Assignment', desc: 'Assign students to rooms', href: '/room-assignment-hub' },
      { icon: I.shieldPlus, name: 'Request for Medicines', desc: 'Medicine requests and consent registry', href: '/request-medicines-hub' },
      { icon: I.video, name: 'Cameras', desc: 'Live surveillance feed', href: 'https://vision.meraki.com/login', external: true },
    ],
  },

  it: {
    roles: ['it', 'admin'],
    topbar: { label: 'Home', href: '/', variant: 'home' },
    titlePre: 'Device Management ',
    titleSpan: 'Platform',
    subtitle: 'Device management, deliveries and inventory',
    footer: FOOTER.itPlatform,
    cards: [
      { icon: I.asset, name: 'Asset Manager', desc: 'Inventory and device management', href: 'https://assetmanager.h-farm.com/', external: true },
      { icon: I.boxStudent, name: 'Check-in/Check-out Student', desc: 'Device delivery and return — students', href: '/student-checkinout-hub' },
      { icon: I.briefcase, name: 'Check-in/Check-out Employee', desc: 'Device delivery and return — staff', href: '/employee-checkinout-hub' },
      { icon: I.grid, name: 'Registri risposte', desc: 'Check-in / check-out records', href: '/it-registries-hub' },
      { icon: I.grid, name: 'Storico assegnazioni', desc: 'Storico dispositivi studenti — ricerca per email o ID', href: '/device-history' },
      { icon: I.wallet, name: 'Budget Management', desc: 'Commesse e spese IT — Venezia, Vicenza, Rosà', href: '/budget-management' },
      { icon: I.tasks, name: 'Task Manager', desc: 'Attività del team IT, gruppi di progetto e sotto-task', href: '/task-manager' },
    ],
  },

  hr: {
    roles: ['hr', 'admin'],
    topbar: { label: 'Home', href: '/', variant: 'home' },
    titlePre: 'HR ',
    titleSpan: 'Management',
    subtitle: 'Personnel tools and resources',
    footer: FOOTER.hr,
    cards: [
      { icon: I.people, name: 'Employee Management', desc: 'Onboarding & offboarding', href: '/employee-management-hub' },
      { icon: I.grid, name: 'Registry', desc: 'Onboarding & offboarding registries', href: '/hr-registry-hub' },
    ],
  },

  'student-office': {
    roles: ['office', 'admin'],
    topbar: { label: 'Home', href: '/', variant: 'home' },
    titlePre: 'Student ',
    titleSpan: 'Office',
    subtitle: 'Student forms and administrative requests',
    footer: FOOTER.office,
    cards: [
      { icon: I.exit, name: 'Student Exit Delegation', desc: 'Authorise a delegate to pick up a student', href: '#', badge: { text: 'Coming soon', soon: true } },
      { icon: I.bus, name: 'Bus Transfer Request', desc: 'Request a change of bus route or stop', href: '#', badge: { text: 'Coming soon', soon: true } },
    ],
  },

  'parents-hub': {
    roles: ['parent', 'admin'],
    topbar: { label: 'Home', href: '/', variant: 'home' },
    titlePre: 'Parents ',
    titleSpan: 'Area',
    subtitle: 'Forms and requests for parents and guardians',
    footer: FOOTER.parents,
    cards: [
      { icon: I.link, name: 'Medicine Consent Form', desc: 'Authorise medicine administration during boarding', href: '/form-richiesta' },
      { icon: I.diet, name: 'Special Diet Request', desc: 'Request a special or medical menu for a student', href: '/special-diet-request' },
    ],
  },

  'room-assignment-hub': {
    roles: ['boarding', 'admin'],
    topbar: { label: 'Boarding', href: '/boarding', variant: 'back' },
    titlePre: 'Room ',
    titleSpan: 'Assignment',
    subtitle: 'Manage room assignments, responses and photos',
    footer: FOOTER.boarding,
    cards: [
      { icon: I.house, name: 'Assign a Room', desc: 'Fill in the room assignment form', href: '/room-assignment' },
      { icon: I.file, name: 'Form Responses', desc: 'View room assignment submissions', href: '#' },
      { icon: I.grid, name: 'Photos Responses', desc: 'Open the assignments spreadsheet', href: ROOM_PHOTOS_XLSX, external: true },
      { icon: I.photos, name: 'Photos History', desc: 'Browse uploaded room photos', href: ROOM_PHOTOS_HISTORY, external: true },
    ],
  },

  'request-medicines-hub': {
    roles: ['boarding', 'admin'],
    topbar: { label: 'Boarding', href: '/boarding', variant: 'back' },
    titlePre: 'Request for ',
    titleSpan: 'Medicines',
    subtitle: 'Submit medicine requests or browse the consent registry',
    footer: FOOTER.boarding,
    cards: [
      { icon: I.userCheck, name: 'Consent Registry', desc: 'Access the consent registry', href: '#' },
    ],
  },

  'it-registries-hub': {
    roles: ['it', 'admin'],
    topbar: { label: 'IT', href: '/it', variant: 'home' },
    titlePre: 'Registri ',
    titleSpan: 'risposte',
    subtitle: 'Data sheets and history',
    footer: FOOTER.it,
    cards: [
      { icon: I.grid, name: 'Registro Check-in Student', desc: 'Student check-in records', href: '#' },
      { icon: I.grid, name: 'Registro Check-out Student', desc: 'Student check-out records', href: '#' },
      { icon: I.grid, name: 'Registro Check-in Employee', desc: 'Employee check-in records', href: '#' },
      { icon: I.grid, name: 'Registro Check-out Employee', desc: 'Employee check-out records', href: '#' },
    ],
  },

  'hr-registry-hub': {
    roles: ['hr', 'admin'],
    topbar: { label: 'HR', href: '/hr', variant: 'home' },
    titlePre: 'Registry ',
    titleSpan: 'Records',
    subtitle: 'Onboarding and offboarding registries',
    footer: FOOTER.hr,
    cards: [
      { icon: I.grid, name: 'Registro Onboarding', desc: 'Onboarding spreadsheet', href: HR_ONBOARDING_XLSX, external: true },
      { icon: I.grid, name: 'Registro Offboarding', desc: 'Offboarding spreadsheet', href: HR_OFFBOARDING_XLSX, external: true },
    ],
  },

  'employee-management-hub': {
    roles: ['hr', 'admin'],
    topbar: { label: 'HR', href: '/hr', variant: 'home' },
    titlePre: 'Employee ',
    titleSpan: 'Management',
    subtitle: 'Onboarding and offboarding of employees',
    footer: FOOTER.hr,
    cards: [
      { icon: I.userPlus, name: 'Onboarding', desc: 'New employee setup request', href: '/onboarding' },
      { icon: I.userMinus, name: 'Offboarding', desc: 'Departing employee process', href: '/employee-management' },
    ],
  },

  'employee-checkinout-hub': {
    roles: ['it', 'admin'],
    topbar: { label: 'IT', href: '/it', variant: 'home' },
    titlePre: 'Employee ',
    titleSpan: 'Check-in / Check-out',
    subtitle: 'Device delivery and return — staff',
    footer: FOOTER.it,
    cards: [
      { icon: I.checkin, name: 'Check-in', desc: 'Device delivered to employee', href: '/modulo-employee?op=checkin' },
      { icon: I.checkout, name: 'Check-out', desc: 'Device returned by employee', href: '/modulo-employee?op=checkout' },
    ],
  },

  'student-checkinout-hub': {
    roles: ['it', 'admin'],
    topbar: { label: 'IT', href: '/it', variant: 'home' },
    titlePre: 'Student ',
    titleSpan: 'Check-in / Check-out',
    subtitle: 'Device delivery and return — students',
    footer: FOOTER.it,
    cards: [
      { icon: I.checkin, name: 'Check-in', desc: 'Device delivered to student', href: '/modulo-student?op=checkin' },
      { icon: I.checkout, name: 'Check-out', desc: 'Device returned by student', href: '/modulo-student?op=checkout' },
    ],
  },
};
