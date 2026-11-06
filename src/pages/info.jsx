import React from 'react';
import { Link, useParams } from 'react-router-dom';

/**
 * Static, honest documentation pages. The footer links here, so every link a
 * visitor can click reaches real content rather than a placeholder.
 */
export const INFO_PAGES = {
  about: {
    title: 'About THE FLASH',
    intro: 'THE FLASH is one place for two habits: watching cinematic series and reading light novels.',
    sections: [
      ['One catalogue, two ways in', 'Films, series and anime sit beside the novels they came from. When a story exists in both forms, its detail page links across, so you can finish an episode and pick up the chapter that continues it — or read ahead of the adaptation.'],
      ['Where the stories come from', 'Every title, novel and chapter in this catalogue was written for this application. Nothing here is a copy of an existing film or book, and no copyrighted artwork is bundled with the product.'],
      ['Artwork and photography', 'Posters, backdrops and covers use real photography from Picsum, a free placeholder photo service. Each record is seeded from its own title, so a poster stays the same every visit. When a photograph cannot be reached, the app draws an original generated cover instead, and administrators can paste their own licensed image URLs at any time.'],
      ['Video sources', 'THE FLASH never scrapes or links to unauthorised streams. An administrator attaches a licensed MP4 or HLS URL to each episode through Admin → Content, and playback, resume position and watch history follow from that source.'],
      ['Metadata', 'TMDB metadata can be imported by an administrator with a TMDB API key. When TMDB data is used, attribution is shown as required by the TMDB terms of use.'],
    ],
  },
  help: {
    title: 'Help Centre',
    intro: 'The short answers to the questions this app raises most often.',
    sections: [
      ['Creating an account', 'Enter your email on the sign-in screen. If no account exists for that address, you are taken straight to the sign-up form with the address already filled in. Registration asks for your name, a password of at least eight characters containing a letter and a number, your date of birth, and an optional profile picture.'],
      ['Signing in', 'Sign-in happens in two steps: your email first, then your password. The email step lets us send people without an account to sign-up instead of showing them a password box they cannot use.'],
      ['Forgotten password', 'Choose “Forgot password?” on the sign-in screen and enter your email. While the app runs without a mail server, the reset link is shown on screen in development; in production it is emailed.'],
      ['Continue watching and continue reading', 'Playback position is saved as you watch and reading position is saved as you scroll. The dashboard shows Continue Watching and Continue Reading rails, and History lists everything with its progress.'],
      ['My List and the reading list', 'Use “Add to My List” on a film, series or anime, or “Add to library” on a novel. My List keeps Watchlist and Reading List on separate tabs, and either entry can be removed.'],
      ['Reading settings', 'Inside the reader, the “Aa” button opens font size, line width, font choice and a light or dark reading theme. Your choices are remembered on this device.'],
      ['A title will not play', 'If an episode shows “No stream is attached”, the administrator has not connected a licensed video source to it yet. This is an empty state, not a fault — the rest of the title page and the episode list still work.'],
      ['Content restrictions', 'Your date of birth is stored only to apply content preferences and is never shown publicly. You can restrict the catalogue to family-friendly ratings from Profile → Settings.'],
    ],
  },
  terms: {
    title: 'Terms of Use',
    intro: 'The agreement between you and THE FLASH when you use this application.',
    sections: [
      ['Your account', 'You are responsible for keeping your password confidential and for activity that happens through your account. One person, one account. Tell an administrator if you believe your account has been used by someone else.'],
      ['Acceptable use', 'Do not attempt to break authentication, reach administrative interfaces you were not granted, bulk-download the catalogue, or disrupt the service for other people. Automated request floods are rate limited and may lead to suspension.'],
      ['Content', 'All titles, novels, chapters and generated artwork belong to this application. You may read and watch them inside the app; you may not redistribute the catalogue or resell access to it.'],
      ['Administrator content', 'Video sources are attached by administrators who are responsible for holding the rights to stream them. THE FLASH does not host or index third-party streams.'],
      ['Availability and changes', 'The service is provided as-is. Features, catalogue entries and these terms may change; when they do, the updated version appears on this page.'],
      ['Ending your use', 'You may stop using the service at any time and ask an administrator to delete your account and its history.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'What this application stores about you, why it stores it, and how to remove it.',
    sections: [
      ['What we store', 'Your name, email address, a securely hashed password (never the password itself), an optional profile picture, and your date of birth. We also store the activity that makes the app useful: favourites, ratings, comments, watch history, reading progress and notifications.'],
      ['Why the date of birth is needed', 'Only two things use it: age-appropriate content preferences, and proving you meet the minimum age for the service. It is never displayed on your profile and never shared.'],
      ['Cookies', 'One httpOnly cookie holds your signed session token. It is not readable by page scripts, it is cleared when you sign out, and it is used for nothing except keeping you signed in. There is no advertising or analytics cookie anywhere in this application.'],
      ['Passwords', 'Passwords are hashed with bcrypt before they touch the database. Nobody, including administrators, can read your password.'],
      ['Your controls', 'Profile → Settings lets you change your name, email, picture, preferences and password. History entries and My List items can be deleted individually.'],
      ['Deletion', 'For a full account deletion, contact an administrator. Removing an account deletes its sessions, favourites, progress, ratings and comments with it.'],
    ],
  },
  cookies: {
    title: 'Cookie Preferences',
    intro: 'This application runs on a single, essential cookie.',
    sections: [
      ['The session cookie', 'A cookie named tf_token stores a signed token that identifies your signed-in session. It is marked httpOnly, so no script on the page can read it, and SameSite, so it is not sent by other sites.'],
      ['What it is used for', 'Authorisation only: deciding whether a request comes from a signed-in user, and whether that user holds an administrator role.'],
      ['What we do not set', 'No advertising cookies, no cross-site tracking, no analytics beacons, and no third-party embeds that would set their own cookies.'],
      ['Clearing it', 'Signing out clears the cookie immediately. Clearing your browser’s site data does the same thing, though it also ends the session.'],
    ],
  },
  contact: {
    title: 'Contact Us',
    intro: 'How to reach the people who run this deployment.',
    sections: [
      ['Account and access issues', 'If you cannot sign in, cannot create an account with your address, or believe your account was disabled in error, contact the administrator listed in your deployment’s support address.'],
      ['Content reports', 'To report a broken stream, a missing chapter, an incorrect description or an image that should not be there, include the title name and the page you were on.'],
      ['Rights enquiries', 'Rights holders can ask about any catalogue entry, image or video source. Every title records who added it and when in the administrator audit log, which makes tracing a source straightforward.'],
      ['Data requests', 'Ask the administrator for a copy of your stored data, or for deletion of your account and history.'],
    ],
  },
  accessibility: {
    title: 'Accessibility',
    intro: 'How THE FLASH is built to work for as many people as possible.',
    sections: [
      ['Keyboard use', 'Every navigation link, card, button and form control is reachable with Tab and usable with Enter or Space. Dialogs move focus inside themselves and close with Escape.'],
      ['Screen readers', 'Navigation landmarks, form labels, icon-only buttons and live regions for errors are labelled, so a screen reader announces what each control does.'],
      ['Motion', 'Animations respect the system “reduce motion” setting: when it is on, transitions and fades are switched off.'],
      ['Reading comfort', 'The reader offers independent font size, line width, serif or sans-serif type, and a light or dark page, so you can set the page to the contrast that suits you.'],
      ['Responsive layout', 'The interface is tested from 320px phones up to large desktop displays, with a bottom navigation bar on small screens and a top navigation bar on wide ones.'],
      ['Still stuck?', 'If a part of the app blocks you, report it through the Contact page with the device and browser you used.'],
    ],
  },
};

export function Info() {
  const { slug } = useParams();
  const page = INFO_PAGES[slug];

  if (!page) {
    return (
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="state">
          <div className="state-icon">⚡</div>
          <h3>That page does not exist</h3>
          <p>Pick a topic from the footer, or head back to your dashboard.</p>
          <Link className="btn btn-primary" to="/home">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container info-page">
      <div className="info-head">
        <Link to="/home" className="small" style={{ color: 'var(--muted)' }}>← Back to Home</Link>
        <h1>{page.title}</h1>
        <p className="info-intro">{page.intro}</p>
      </div>
      <div className="info-body">
        {page.sections.map(([heading, text]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <div className="info-foot">
        <span className="muted small">Last reviewed September 2026</span>
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          {Object.entries(INFO_PAGES).filter(([k]) => k !== slug).slice(0, 4).map(([k, v]) => (
            <Link key={k} to={`/info/${k}`} className="small" style={{ color: 'var(--muted)' }}>{v.title}</Link>
          ))}
        </div>
      </div>
    </div>
  );
}
