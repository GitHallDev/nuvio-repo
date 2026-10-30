/**
 * Provider Anime-Sama pour Nuvio
 */

module.exports = {
  id: "anime-sama-perso",
  name: "Anime-Sama (Perso)",
  version: "1.0.0",
  description: "Catalogue Anime-Sama multi-sources (VF/VOSTFR) pour Nuvio.",
  supportedTypes: ["tv", "movie"],
  contentLanguage: ["fr"],
  formats: ["mp4", "m3u8"],

  // 1. Recherche d'animes
  async search(query) {
    try {
      const response = await fetch("https://anime-sama.to/template-php/defaut/fetch.php", {
        method: "POST",
      headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://anime-sama.to/"
        },
        body: `query=${encodeURIComponent(query)}`,
      });
      const html = await response.text();
      const results = [];
      const regex = /<a href="([^"]+)" class="asn-search-result">[\s\S]*?src="([^"]+)"[\s\S]*?title">([^<]+)<\/h3>/g;
      let m;
      while ((m = regex.exec(html)) !== null) {
        results.push({
          id: m[1], // URL relative ou absolue de l'anime
          title: m[3].replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim(),
          image: m[2],
          type: "tv"
        });
      }
      return results;
    } catch (e) {
      console.error("Erreur search Anime-Sama:", e);
      return [];
    }
  },

  // 2. Récupération des liens de streaming pour un épisode donné
  async getStreams(animeUrl, seasonIndex = 1, episodeNumber = 1) {
    try {
      // Étape A : Récupérer la page principale de l'anime pour trouver les saisons
      const resAnime = await fetch(animeUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime-sama.to/"
        }
      });
      const htmlAnime = await resAnime.text();
      
      const seasons = [];
      const animeRegex = /panneauAnime\("([^"]+)",\s*"([^"]+)"\)/g;
      let m;
      while ((m = animeRegex.exec(htmlAnime)) !== null) {
        if (m[1] !== "nom" && m[2] !== "url") {
          seasons.push({ name: m[1], url: m[2] });
        }
      }

      const season = seasons[seasonIndex - 1];
      if (!season) return [];

      // Résolution de l'URL de la saison
      let seasonUrl = season.url.startsWith("http")
        ? season.url
        : animeUrl.endsWith("/") ? animeUrl + season.url : animeUrl + "/" + season.url;

      // Si l'URL ne pointe pas directement vers une langue, on teste VOSTFR par défaut
      if (!seasonUrl.includes("vostfr") && !seasonUrl.includes("vf")) {
        seasonUrl = seasonUrl.endsWith("/") ? seasonUrl + "vostfr/" : seasonUrl + "/vostfr/";
      }

      // Étape B : Récupérer le fichier episodes.js de la saison
      const epUrl = seasonUrl.endsWith("episodes.js") ? seasonUrl : seasonUrl + (seasonUrl.endsWith("/") ? "episodes.js" : "/episodes.js");
      
      const resEpisodes = await fetch(epUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://anime-sama.to/"
        }
      });
      
      if (!resEpisodes.ok) return [];
      const code = await resEpisodes.text();

      const streams = [];
      const arrayRegex = /var\s+eps(\d+)\s*=\s*\[([\s\S]*?)\];/g;
      let matchProvider = arrayRegex.exec(code);

      // Étape C : Parcourir tous les lecteurs disponibles (eps1, eps2, eps3...)
      while (matchProvider !== null) {
        const providerId = matchProvider[1];
        const content = matchProvider[2];
        const links = content
          .split(",")
          .map(l => l.trim().replace(/['"]/g, ""))
          .filter(l => l.startsWith("http"));

        if (links.length >= episodeNumber) {
          const episodeLink = links[episodeNumber - 1];
          let hostname = new URL(episodeLink).hostname.replace("www.", "");

          // Normalisation Vidmoly si besoin
          let finalLink = episodeLink;
          if (hostname === "vidmoly.to") {
            hostname = "vidmoly.biz";
            finalLink = finalLink.replace("vidmoly.to", "vidmoly.biz");
          }

          streams.push({
            title: `Lecteur ${providerId} (${hostname})`,
            url: finalLink,
            quality: "1080p"
          });
        }

        matchProvider = arrayRegex.exec(code);
      }

      return streams;
    } catch (e) {
      console.error("Erreur getStreams Anime-Sama:", e);
      return [];
    }
  }
};