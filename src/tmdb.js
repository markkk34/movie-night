// Ключ TMDB: themoviedb.org → Settings → API → "API Key" (v3 auth).
// Он виден в браузере, это нормально для бесплатного ключа только для чтения.
const TMDB_KEY = "d0c80ac9b14e5e8b63b1e491d184e4ff";

export async function searchTmdb(q, signal) {
  const url =
    `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}` +
    `&language=ru-RU&include_adult=false&query=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("tmdb " + r.status);
  const data = await r.json();
  return data.results
    .filter((x) => x.media_type === "movie" || x.media_type === "tv")
    .slice(0, 6)
    .map((x) => ({
      tmdbId: x.id,
      type: x.media_type === "tv" ? "series" : "movie",
      title: x.title || x.name,
      originalTitle: x.original_title || x.original_name || "",
      year: (x.release_date || x.first_air_date || "").slice(0, 4),
      poster: x.poster_path || "",
      overview: x.overview || "",
    }));
}

export const posterUrl = (path, size = "w154") => `https://image.tmdb.org/t/p/${size}${path}`;
