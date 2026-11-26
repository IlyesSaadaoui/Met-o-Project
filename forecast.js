/* ============================================================================
   forecast.js  —  Taher Yahia
   US1 : affichage de la température actuelle + indicateur de chargement
   US3 : affichage des prévisions sur 5 jours (version texte, sans graphique)
   ----------------------------------------------------------------------------
   Règle d'équipe : un fichier, un responsable.
   -> Je ne touche PAS à api.js (Ahmed). Je consomme ses fonctions.
   -> Je ne touche PAS à index.html / search.js (Ilyes). J'utilise ses ids.
   -> Le graphique (METEO-21) est HORS Sprint 1 : pas de code ici.
   ========================================================================== */

(function () {
  'use strict';

  /* Délai maximum avant d'afficher un message d'erreur (critère d'acceptation US1) */
  var DELAI_MAX_MS = 5000;

  /* Nombre de jours affichés (critère d'acceptation US3 : 5 jours, dont aujourd'hui) */
  var NB_JOURS = 5;

  /* --- Références DOM : contrat avec index.html (fichier d'Ilyes) --------- */
  var elVille       = document.getElementById('meteo-ville');
  var elTemperature = document.getElementById('meteo-temperature');
  var elIcone       = document.getElementById('meteo-icone');
  var elChargement  = document.getElementById('meteo-chargement');
  var elErreur      = document.getElementById('meteo-erreur');
  var elContenu     = document.getElementById('meteo-contenu');

  /* US3 */
  var elPrevisions       = document.getElementById('meteo-previsions');
  var elPrevisionsListe  = document.getElementById('meteo-previsions-liste');

  /* --- Utilitaires ------------------------------------------------------- */

  /* Rejette la promesse si elle dépasse le délai : évite le "chargement infini" */
  function avecDelaiMax(promesse, ms) {
    return new Promise(function (resolve, reject) {
      var minuteur = setTimeout(function () {
        reject(new Error('DELAI_DEPASSE'));
      }, ms);

      promesse.then(
        function (valeur) { clearTimeout(minuteur); resolve(valeur); },
        function (erreur) { clearTimeout(minuteur); reject(erreur); }
      );
    });
  }

  /* Traduit une erreur technique en message compréhensible par l'utilisateur */
  function messageErreur(erreur) {
    if (!erreur || !erreur.message) {
      return 'Service météo temporairement indisponible.';
    }
    switch (erreur.message) {
      case 'DELAI_DEPASSE':
        return 'Le service météo met trop de temps à répondre. Réessayez.';
      case 'VILLE_INTROUVABLE':
        return 'Ville introuvable.';
      case 'API_ABSENTE':
        return 'Service météo indisponible.';
      case 'API_INDISPONIBLE':
        return 'Service météo temporairement indisponible.';
      default:
        return 'Service météo temporairement indisponible.';
    }
  }

  /* Valeur numérique sûre : renvoie un entier arrondi, ou null si invalide.
     US3 : une valeur nulle ne doit jamais produire "NaN" à l'écran. */
  function entierOuNull(valeur) {
    if (valeur === null || valeur === undefined || valeur === '') { return null; }
    var n = Number(valeur);
    if (isNaN(n)) { return null; }
    return Math.round(n);
  }

  /* Affiche une température, ou "—" si la valeur est absente */
  function formaterTemperature(valeur) {
    var n = entierOuNull(valeur);
    return (n === null) ? '\u2014' : n + ' \u00B0C';
  }

  /* Formate une date lisible : "lun. 8 déc.".
     IMPORTANT (METEO-32) : on NE reconvertit PAS le fuseau horaire ici.
     La date arrive déjà cohérente avec la ville, calculée par api.js (Ahmed).
     Une deuxième conversion côté affichage décalerait les jours selon
     l'ordinateur de l'utilisateur. */
  function formaterDate(valeur) {
    if (!valeur) { return '\u2014'; }

    /* Si l'API envoie déjà un libellé prêt (ex. "Lundi 8"), on l'utilise tel quel */
    if (typeof valeur === 'string' && !/^\d{4}-\d{2}-\d{2}/.test(valeur)) {
      return valeur;
    }

    /* Sinon on lit la date "YYYY-MM-DD" sans conversion de fuseau :
       on construit la date en UTC et on l'affiche en UTC. */
    var m = String(valeur).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) { return String(valeur); }

    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    try {
      return d.toLocaleDateString('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
      });
    } catch (e) {
      /* Navigateur ancien : on retombe sur un format simple */
      return m[3] + '/' + m[2];
    }
  }

  /* --- États de l'interface ---------------------------------------------- */

  function afficherChargement() {
    if (elChargement) { elChargement.hidden = false; }
    if (elErreur)     { elErreur.hidden = true; }
    if (elContenu)    { elContenu.hidden = true; }
    if (elPrevisions) { elPrevisions.hidden = true; }
  }

  function masquerChargement() {
    if (elChargement) { elChargement.hidden = true; }
  }

  function afficherErreur(texte) {
    if (elContenu)    { elContenu.hidden = true; }
    if (elPrevisions) { elPrevisions.hidden = true; }
    if (elErreur) {
      elErreur.textContent = texte;
      elErreur.hidden = false;
    }
  }

  function afficherMeteo(donnees) {
    if (!donnees) {
      afficherErreur('Service météo temporairement indisponible.');
      return;
    }

    var ville = donnees.ville || 'Ville inconnue';
    var temperature = entierOuNull(donnees.temperature);

    if (temperature === null) {
      afficherErreur('Service météo temporairement indisponible.');
      return;
    }

    if (elVille)       { elVille.textContent = ville; }
    if (elTemperature) { elTemperature.textContent = temperature + ' \u00B0C'; }

    /* Icône facultative : si l'API ne fournit pas d'icône, on ne casse rien */
    if (elIcone) {
      if (donnees.icone) {
        elIcone.src = donnees.icone;
        elIcone.alt = donnees.description || 'Météo';
        elIcone.hidden = false;
      } else {
        elIcone.hidden = true;
      }
    }

    if (elErreur)  { elErreur.hidden = true; }
    if (elContenu) { elContenu.hidden = false; }
  }

  /* --- US3 : affichage des prévisions ------------------------------------ */

  /**
   * Affiche la liste des prévisions.
   * @param {Array} jours  Tableau d'objets { date, min, max, icone, description }
   *
   * Cas dégradés gérés :
   *  - l'API renvoie moins de jours que prévu (4 au lieu de 5) -> on affiche 4
   *  - l'API renvoie plus de jours -> on n'en affiche que 5
   *  - un min ou un max est nul -> on affiche "—" au lieu de "NaN"
   *  - le tableau est vide -> message "Prévisions indisponibles"
   */
  function afficherPrevisions(jours) {
    if (!elPrevisionsListe) { return; }   /* index.html pas encore prêt */

    /* Tableau vide ou invalide : message, pas de zone vide */
    if (!jours || !jours.length) {
      elPrevisionsListe.textContent = '';
      var vide = document.createElement('li');
      vide.className = 'previsions-vide';
      vide.textContent = 'Prévisions indisponibles.';
      elPrevisionsListe.appendChild(vide);
      if (elPrevisions) { elPrevisions.hidden = false; }
      return;
    }

    /* On ne dépasse jamais NB_JOURS ; on accepte moins (cas 4 jours) */
    var aAfficher = jours.slice(0, NB_JOURS);
    elPrevisionsListe.textContent = '';

    aAfficher.forEach(function (jour) {
      var li = document.createElement('li');
      li.className = 'previsions-jour';

      var elDate = document.createElement('span');
      elDate.className = 'previsions-date';
      elDate.textContent = formaterDate(jour && jour.date);

      var elIconeJour = document.createElement('span');
      elIconeJour.className = 'previsions-icone';
      elIconeJour.textContent = (jour && jour.icone) ? jour.icone : '';
      if (jour && jour.description) {
        elIconeJour.title = jour.description;
      }

      var elTemp = document.createElement('span');
      elTemp.className = 'previsions-temp';
      elTemp.textContent = formaterTemperature(jour && jour.min) +
                           ' / ' + formaterTemperature(jour && jour.max);

      li.appendChild(elDate);
      li.appendChild(elIconeJour);
      li.appendChild(elTemp);
      elPrevisionsListe.appendChild(li);
    });

    if (elPrevisions) { elPrevisions.hidden = false; }
  }

  /* --- Fonctions principales --------------------------------------------- */

  /**
   * Charge et affiche la météo actuelle d'une ville.
   * @param {string} ville  Nom de la ville (ex. "Tunis")
   */
  function chargerMeteo(ville) {
    afficherChargement();

    /* L'API est fournie par api.js (Ahmed). Si elle manque, on affiche
       un message propre au lieu de laisser un écran vide. */
    if (!window.MeteoApi || typeof window.MeteoApi.getCurrentWeather !== 'function') {
      masquerChargement();
      afficherErreur(messageErreur(new Error('API_ABSENTE')));
      return;
    }

    var appel = window.MeteoApi.getCurrentWeather(ville);

    avecDelaiMax(appel, DELAI_MAX_MS)
      .then(function (donnees) {
        masquerChargement();
        afficherMeteo(donnees);
      })
      .catch(function (erreur) {
        masquerChargement();
        afficherErreur(messageErreur(erreur));
      });
  }

  /**
   * Charge et affiche les prévisions 5 jours d'une ville (US3).
   * Affiche la météo actuelle et les prévisions en parallèle.
   * @param {string} ville
   */
  function chargerPrevisions(ville) {
    if (!window.MeteoApi || typeof window.MeteoApi.getForecast !== 'function') {
      /* Pas de fonction prévisions : on n'affiche rien plutôt que de casser la page */
      if (elPrevisions) { elPrevisions.hidden = true; }
      return;
    }

    var appel = window.MeteoApi.getForecast(ville, NB_JOURS);

    avecDelaiMax(appel, DELAI_MAX_MS)
      .then(function (jours) {
        afficherPrevisions(jours);
      })
      .catch(function () {
        /* En cas d'échec des prévisions, la météo actuelle reste utilisable :
           on n'efface pas tout l'écran. */
        afficherPrevisions([]);
      });
  }

  /**
   * Point d'entrée : charge la météo actuelle ET les prévisions.
   * C'est cette fonction que search.js (Ilyes) doit appeler après une recherche.
   * @param {string} ville
   */
  function chargerTout(ville) {
    chargerMeteo(ville);
    chargerPrevisions(ville);
  }

  /* --- API publique du fichier (utilisée par search.js d'Ilyes) ---------- */
  window.MeteoAffichage = {
    chargerMeteo: chargerMeteo,
    chargerPrevisions: chargerPrevisions,
    chargerTout: chargerTout,
    afficherErreur: afficherErreur
  };

  /* Premier affichage au chargement de la page : ville par défaut */
  document.addEventListener('DOMContentLoaded', function () {
    chargerTout('Tunis');
  });

})();
