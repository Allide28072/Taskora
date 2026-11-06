// THE FLASH — demonstration video sources.
//
// Every file below is real, playable video released under a Creative Commons
// licence (Blender Foundation open movies, redistributed by test-videos.co.uk
// as H.264 MP4). They let trailers and playback work out of the box without
// touching anyone's copyright.
//
// These are placeholders for licensed content: an administrator replaces any of
// them from Admin → Content → Edit by pasting a URL they have the right to
// stream. The player accepts direct files (MP4 / HLS) and YouTube or Vimeo
// links.
//
// Playability was verified in a real browser, not just by HTTP status: some
// public sample files return 200 with `video/mp4` yet fail to decode with a
// media format error, so only sources that actually play are listed here.
const V = 'https://test-videos.co.uk/vids';

export const TRAILERS = [
  { url: `${V}/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4`, label: 'Big Buck Bunny — clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4`, label: 'Sintel — clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4`, label: 'Jellyfish — clip (test-videos.co.uk, free to use)' },
  { url: `${V}/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_1MB.mp4`, label: 'Big Buck Bunny — 1080p clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/sintel/mp4/h264/1080/Sintel_1080_10s_1MB.mp4`, label: 'Sintel — 1080p clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_1MB.mp4`, label: 'Jellyfish — 1080p clip (test-videos.co.uk, free to use)' },
];

export const STREAMS = [
  { url: `${V}/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_2MB.mp4`, label: 'Big Buck Bunny — higher bitrate clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4`, label: 'Jellyfish — clip (test-videos.co.uk, free to use)' },
  { url: `${V}/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4`, label: 'Sintel — clip (Blender Foundation, CC BY 3.0)' },
  { url: `${V}/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4`, label: 'Big Buck Bunny — low bandwidth clip (Blender Foundation, CC BY 3.0)' },
];

/** Deterministic pick so one title always keeps the same demo source. */
export const trailerFor = (index) => TRAILERS[Math.abs(index) % TRAILERS.length].url;
export const streamFor = (index) => STREAMS[Math.abs(index) % STREAMS.length].url;

// ── real trailers ─────────────────────────────────────────────────────
//
// Every title in this catalogue is an original, fictional work, so none of
// them has a trailer of its own. Each one is paired below with the *official*
// trailer of a released film or series closest to it in genre and mood, and
// that trailer plays through YouTube's own embed. Nothing is downloaded or
// re-hosted: the video stays on the rights-holder's channel and YouTube serves
// it, which is what makes this the lawful way to show real trailer footage.
//
// Every id was checked against YouTube's oembed endpoint — each resolves and
// permits embedding. If one of these is ever pulled from YouTube the player
// shows YouTube's own "unavailable" card, so the fix is to swap the id here and
// restart, which the seed migration below re-applies.
//
export const REAL_TRAILERS = [
  // movies
  { slug: 'ember-protocol', id: 'bggUmgeMCdc', label: 'Ex Machina (A24, 2015) — official trailer' },
  { slug: 'the-salt-cathedral', id: 'Hyag7lR8CPA', label: 'The Lighthouse (A24, 2019) — official trailer' },
  { slug: 'voltage-saint', id: '2AUmvWm5ZDQ', label: 'John Wick (Lionsgate, 2014) — official trailer' },
  { slug: 'glass-orchard', id: '1Fg5iWmQjwk', label: 'The Grand Budapest Hotel (Searchlight, 2014) — official trailer' },
  { slug: 'nine-kinds-of-quiet', id: 'WR7cc5t7tv8', label: 'A Quiet Place (Paramount, 2018) — official trailer' },
  { slug: 'chrome-lullaby', id: 'gCcx85zbxz4', label: 'Blade Runner 2049 (Warner Bros., 2017) — official trailer' },
  { slug: 'paper-compass', id: 'QD6cy4PBQPI', label: 'The Secret Life of Walter Mitty (Fox, 2013) — official trailer' },
  { slug: 'the-fourth-wall-of-june', id: 'yrK1f4TsQfM', label: 'Swiss Army Man (A24, 2016) — official trailer' },
  { slug: 'hollow-tide', id: '7S1yhSp5jaI', label: 'Under the Skin (StudioCanal, 2013) — official trailer' },
  { slug: 'static-bloom', id: '89OP78l9oF0', label: 'Annihilation (Paramount, 2018) — official trailer' },
  // series
  { slug: 'lantern-district', id: 'fVQUcaO4AvE', label: 'True Detective, season 1 (HBO) — official trailer' },
  { slug: 'gravity-ward', id: 'xEQP4VVuyrY', label: 'Severance (Apple TV+) — official trailer' },
  { slug: 'the-long-analog', id: 'jDiYGjp5iFg', label: 'Black Mirror, season 3 (Netflix) — official trailer' },
  { slug: 'marrow-myth', id: 'DotnJ7tTA34', label: 'House of the Dragon (HBO Max) — official trailer' },
  { slug: 'comet-club', id: 'PssKpzB0Ah0', label: 'Stranger Things (Netflix) — official trailer' },
  // anime
  { slug: 'skybound-signal', id: 'RuyHIkXdYf8', label: 'Your Name. (GKIDS, 2016) — official trailer' },
  { slug: 'kitsune-drive', id: 'vvnNpjH93NU', label: 'Akira (1988) — official trailer' },
  { slug: 'orbital-teacup', id: 'ej3ioOneTy8', label: 'The Martian (20th Century, 2015) — official trailer' },
  { slug: 'blade-of-the-nine-koi', id: 'rcVf_qzfaJQ', label: '13 Assassins (HanWay Films, 2010) — official trailer' },
  { slug: 'neon-shrine', id: 'rU6Matng9MU', label: 'Ghost in the Shell (1995) — official trailer' },
];

const REAL_BY_SLUG = new Map(REAL_TRAILERS.map((t) => [t.slug, t]));

/** The real-trailer pairing for a catalogue slug, or null if there is none. */
export const realTrailerFor = (slug) => {
  const hit = REAL_BY_SLUG.get(String(slug || ''));
  return hit ? { url: `https://www.youtube.com/watch?v=${hit.id}`, label: hit.label } : null;
};

/** True for the canned demo clips, which are safe to replace with a real trailer. */
export const isDemoTrailer = (url) => String(url || '').includes('test-videos.co.uk');

/** Hosts whose sample files are known not to decode reliably in browsers. */
export const UNPLAYABLE_HOSTS = ['media.w3.org'];
