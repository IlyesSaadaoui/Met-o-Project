/* ============================================================================
   search.js  —  Ilyes Saadaoui
   US2 : recherche par ville + autocomplétion
   ----------------------------------------------------------------------------
   Règle d'équipe : un fichier, un responsable.
   -> Je ne touche PAS à api.js (Ahmed). Je consomme sa fonction de géocodage.
   -> Je ne touche PAS à forecast.js (Taher). J'appelle MeteoAffichage.chargerMeteo.

   Contrat attendu avec api.js (à valider avec Ahmed) :
     window.MeteoApi.searchCities(texte)
       -> Promise<Array<{ nom: string, pays?: string, region?: string }>>
       -> rejette avec Error('API_INDISPONIBLE') en cas de panne
   Si searchCities n'existe pas encore, la recherche marche quand même :
   Entrée / "Rechercher" charge directement la ville tapée.

   Critères d'acceptation US2 :
     (1) taper "tunis" affiche Tunis et sa température actuelle
     (2) la casse et les accents sont ignorés ("sfax" = "Sfax", "theoule" = "Théoule")
     (3) ville inexistante -> "Ville introuvable", jamais d'écran vide
     (4) pas d'appel API à chaque lettre (anti-rebond 300 ms)
   Cas d'erreur : champ vide, 500 caractères, API en panne.
   ========================================================================== */

(function () {
  'use strict';

  var DELAI_ANTI_REBOND_MS = 300;
  var LONGUEUR_MIN = 2;      // on ne cherche pas avant 2 lettres
  var LONGUEUR_MAX = 100;    // au-delà : saisie refusée (cas "500 caractères")
  var MAX_SUGGESTIONS = 6;

  /* --- Références DOM : contrat avec index.html ------------------------- */
  var elForm        = document.getElementById('recherche-form');
  var elChamp       = document.getElementById('recherche-champ');
  var elSuggestions = document.getElementById('recherche-suggestions');
  var elMessage     = document.getElementById('recherche-message');

  if (!elForm || !elChamp || !elSuggestions) { return; }

  /* --- État -------------------------------------------------------------- */
  var minuteur = null;
  var suggestions = [];      // résultats affichés
  var indexActif = -1;       // suggestion surlignée au clavier
  var numeroRequete = 0;     // pour ignorer les réponses arrivées en retard
  var cache = {};            // clé normalisée -> résultats (évite les doublons de requêtes)

  /* --- Utilitaires ------------------------------------------------------- */

  /**
   * Normalise un texte pour la comparaison : minuscules, sans accents,
   * espaces superflus retirés. "  Théoule-sur-Mer " -> "theoule-sur-mer".
   * (Correction METEO-31 : la recherche doit ignorer les accents.)
   */
  function normaliser(texte) {
    return String(texte || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function apiRechercheDisponible() {
    return !!(window.MeteoApi && typeof window.MeteoApi.searchCities === 'function');
  }

  function afficherMessage(texte, estErreur) {
    if (!elMessage) { return; }
    if (!texte) {
      elMessage.hidden = true;
      elMessage.textContent = '';
      return;
    }
    elMessage.textContent = texte;
    elMessage.classList.toggle('recherche__message--erreur', !!estErreur);
    elMessage.hidden = false;
  }

  /** Vérifie la saisie. Renvoie un message d'erreur, ou null si elle est valide. */
  function verifierSaisie(texte) {
    if (normaliser(texte) === '') { return 'Saisissez un nom de ville.'; }
    if (texte.length > LONGUEUR_MAX) { return 'Nom de ville trop long (' + LONGUEUR_MAX + ' caractères maximum).'; }
    return null;
  }

  /* --- Liste de suggestions --------------------------------------------- */

  function fermerSuggestions() {
    elSuggestions.hidden = true;
    elSuggestions.innerHTML = '';
    elChamp.setAttribute('aria-expanded', 'false');
    elChamp.removeAttribute('aria-activedescendant');
    suggestions = [];
    indexActif = -1;
  }

  function libelle(ville) {
    var details = [ville.region, ville.pays].filter(Boolean).join(', ');
    return { nom: ville.nom, details: details };
  }

  function afficherSuggestions(liste) {
    elSuggestions.innerHTML = '';
    suggestions = liste;
    indexActif = -1;

    if (liste.length === 0) {
      var vide = document.createElement('li');
      vide.className = 'recherche__suggestion recherche__suggestion--vide';
      vide.textContent = 'Ville introuvable';
      elSuggestions.appendChild(vide);
    }

    liste.forEach(function (ville, i) {
      var li = document.createElement('li');
      var l = libelle(ville);
      li.id = 'suggestion-' + i;
      li.className = 'recherche__suggestion';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = l.nom;           // textContent : pas d'injection HTML
      if (l.details) {
        var small = document.createElement('small');
        small.textContent = ' — ' + l.details;
        li.appendChild(small);
      }
      /* mousedown plutôt que click : se déclenche avant la perte de focus du champ */
      li.addEventListener('mousedown', function (e) {
        e.preventDefault();
        choisir(ville);
      });
      elSuggestions.appendChild(li);
    });

    elSuggestions.hidden = false;
    elChamp.setAttribute('aria-expanded', 'true');
  }

  function surligner(index) {
    var items = elSuggestions.querySelectorAll('[role="option"]');
    if (items.length === 0) { return; }
    indexActif = (index + items.length) % items.length;  // boucle haut/bas
    items.forEach(function (item, i) {
      item.setAttribute('aria-selected', i === indexActif ? 'true' : 'false');
    });
    elChamp.setAttribute('aria-activedescendant', items[indexActif].id);
    items[indexActif].scrollIntoView({ block: 'nearest' });
  }

  /* --- Recherche --------------------------------------------------------- */

  /** Trie les résultats : ceux qui commencent par la saisie (sans accents) d'abord, sans doublons. */
  function trierEtDedoublonner(resultats, saisie) {
    var cle = normaliser(saisie);
    var vus = {};
    return resultats
      .filter(function (v) { return v && v.nom; })
      .filter(function (v) {
        var id = normaliser(v.nom) + '|' + normaliser(v.region) + '|' + normaliser(v.pays);
        if (vus[id]) { return false; }
        vus[id] = true;
        return true;
      })
      .sort(function (a, b) {
        var aDebut = normaliser(a.nom).indexOf(cle) === 0 ? 0 : 1;
        var bDebut = normaliser(b.nom).indexOf(cle) === 0 ? 0 : 1;
        return aDebut - bDebut;
      })
      .slice(0, MAX_SUGGESTIONS);
  }

  function chercherSuggestions(saisie) {
    var cle = normaliser(saisie);

    /* Même recherche déjà faite ("Sfax" puis "sfax") : pas de nouvelle requête */
    if (cache[cle]) {
      afficherSuggestions(cache[cle]);
      return;
    }

    var numero = ++numeroRequete;
    afficherMessage('Recherche…', false);

    window.MeteoApi.searchCities(saisie.trim())
      .then(function (resultats) {
        if (numero !== numeroRequete) { return; }  // réponse périmée : on l'ignore
        var liste = trierEtDedoublonner(Array.isArray(resultats) ? resultats : [], saisie);
        cache[cle] = liste;
        afficherMessage('', false);
        afficherSuggestions(liste);
      })
      .catch(function () {
        if (numero !== numeroRequete) { return; }
        fermerSuggestions();
        afficherMessage('Service de recherche indisponible. Réessayez dans un instant.', true);
      });
  }

  /** Lance la météo de la ville choisie (deuxième appel API, côté forecast.js). */
  function choisir(ville) {
    var nom = typeof ville === 'string' ? ville.trim() : ville.nom;
    numeroRequete++;               // annule une recherche en cours
    clearTimeout(minuteur);
    fermerSuggestions();
    afficherMessage('', false);
    elChamp.value = nom;

    if (window.MeteoAffichage && typeof window.MeteoAffichage.chargerMeteo === 'function') {
      window.MeteoAffichage.chargerMeteo(nom);
    } else {
      afficherMessage('Service météo indisponible.', true);
    }
  }

  /* --- Événements -------------------------------------------------------- */

  /* Saisie : anti-rebond de 300 ms -> une seule requête quand l'utilisateur s'arrête */
  elChamp.addEventListener('input', function () {
    clearTimeout(minuteur);
    var saisie = elChamp.value;

    if (saisie.length > LONGUEUR_MAX) {
      fermerSuggestions();
      afficherMessage(verifierSaisie(saisie), true);
      return;
    }

    afficherMessage('', false);

    if (normaliser(saisie).length < LONGUEUR_MIN || !apiRechercheDisponible()) {
      numeroRequete++;
      fermerSuggestions();
      return;
    }

    minuteur = setTimeout(function () {
      chercherSuggestions(saisie);
    }, DELAI_ANTI_REBOND_MS);
  });

  /* Clavier : flèches, Entrée, Échap */
  elChamp.addEventListener('keydown', function (e) {
    var ouvert = !elSuggestions.hidden && suggestions.length > 0;

    if (e.key === 'ArrowDown' && ouvert) {
      e.preventDefault();
      surligner(indexActif + 1);
    } else if (e.key === 'ArrowUp' && ouvert) {
      e.preventDefault();
      surligner(indexActif - 1);
    } else if (e.key === 'Escape') {
      fermerSuggestions();
    } else if (e.key === 'Enter' && ouvert && indexActif >= 0) {
      e.preventDefault();
      choisir(suggestions[indexActif]);
    }
  });

  /* Validation (Entrée sans suggestion surlignée, ou bouton "Rechercher") */
  elForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var saisie = elChamp.value;
    var erreur = verifierSaisie(saisie);

    if (erreur) {
      fermerSuggestions();
      afficherMessage(erreur, true);
      return;
    }

    /* Si une suggestion correspond exactement (accents ignorés), on la prend */
    var cle = normaliser(saisie);
    var exacte = suggestions.filter(function (v) { return normaliser(v.nom) === cle; })[0];
    if (exacte) { choisir(exacte); return; }

    /* Les suggestions affichées disent déjà "Ville introuvable" : pas de requête inutile */
    if (cache[cle] && cache[cle].length === 0) {
      fermerSuggestions();
      if (window.MeteoAffichage) { window.MeteoAffichage.afficherErreur('Ville introuvable.'); }
      return;
    }

    /* Sinon, la première suggestion, ou la ville tapée telle quelle */
    choisir(suggestions[0] || saisie);
  });

  /* Clic ailleurs : on ferme la liste */
  elChamp.addEventListener('blur', function () {
    setTimeout(fermerSuggestions, 100);
  });

  /* Exposé pour les tests du QA (fonction pure) */
  window.MeteoRecherche = { normaliser: normaliser };

})();
