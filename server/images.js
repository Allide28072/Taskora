// THE FLASH — photography layer.
//
// Every title and novel gets a real photograph for its poster, backdrop and
// cover. Images use Picsum, a free placeholder photo service, with a seed
// derived from the slug so each record always receives the same picture.
//
// Nothing here replaces the artwork generator: when a deployment has no
// outbound network access (or an administrator stores their own URL), the
// caller falls back to the generated SVG from art.js, so a broken image is
// never possible.
import { env } from './env.js';

const BASE = 'https://picsum.photos';

function photo(seed, width, height) {
  return `${BASE}/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}

/** True when real photography should be preferred over generated artwork. */
export function photosEnabled() {
  return env.imageSource !== 'generated';
}

export function posterPhoto(slug) {
  return photo(`${slug}-poster`, 500, 750);
}

export function backdropPhoto(slug) {
  return photo(`${slug}-backdrop`, 1600, 900);
}

export function coverPhoto(slug) {
  return photo(`${slug}-cover`, 400, 600);
}

export function stillPhoto(seed) {
  return photo(`${seed}-still`, 640, 360);
}

export function avatarPhoto(seed) {
  return photo(`${seed}-avatar`, 200, 200);
}

/**
 * Poster and backdrop for a title.
 *
 * A stored URL always wins, so an administrator's own artwork is respected.
 * Otherwise live-action titles prefer photography, while anime uses the
 * generated cel-shaded key art — an anime card should not look like a photo.
 * The generated art is always returned as the fallback either way.
 */
export function titleImages(row, generated) {
  const prefersPhoto = photosEnabled() && row.kind !== 'anime';
  return {
    poster: row.poster_url || (prefersPhoto ? posterPhoto(row.slug) : generated.poster),
    poster_fallback: generated.poster,
    backdrop: row.backdrop_url || (prefersPhoto ? backdropPhoto(row.slug) : generated.backdrop),
    backdrop_fallback: generated.backdrop,
  };
}

/** Cover for a novel, honouring a stored URL first, then generated art. */
export function novelImages(row, generated) {
  const photos = photosEnabled();
  return {
    cover: row.cover_url || (photos ? coverPhoto(row.slug) : generated.cover),
    cover_fallback: generated.cover,
  };
}
