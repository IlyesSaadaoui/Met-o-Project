/* ============================================================================
   forecast.js  —  Taher Yahia
   US1 : affichage de la température actuelle + indicateur de chargement
   ----------------------------------------------------------------------------
   Règle d'équipe : un fichier, un responsable.
   -> Je ne touche PAS à api.js (Ahmed). Je consomme sa fonction.
   -> Je ne touche PAS à index.html / search.js (Ilyes). J'utilise ses ids.
   ========================================================================== */

(function () {
  'use strict';

  /* Délai maximum avant d'afficher un message d'erreur (critère d'acceptation US1) */
  var DELAI_MAX_MS = 5000;

  /* --- Références DOM : contrat avec index.html (fichier d'Ilyes) --------- */
  var elVille     = document.getElementById('meteo-ville');
  var elTemperature = document.getElementById('meteo-temperature');
  var elIcone     = document.getElementById('meteo-icone');
  var elChargement = document.getElementById('meteo-chargement');
  var elErreur    = document.getElementById('meteo-erreur');
  var elContenu   = document.getElementById('meteo-contenu');

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

  /* --- États de l'interface ---------------------------------------------- */

  function afficherChargement() {
    if (elChargement) { elChargement.hidden = false; }
    if (elErreur)     { elErreur.hidden = true; }
    if (elContenu)    { elContenu.hidden = true; }
  }

  function masquerChargement() {
    if (elChargement) { elChargement.hidden = true; }
  }

  function afficherErreur(texte) {
    if (elContenu) { elContenu.hidden = true; }
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
    /* Critère US1 : degrés arrondis à l'entier */
    var temperature = Math.round(Number(donnees.temperature));

    if (isNaN(temperature)) {
      afficherErreur('Service météo temporairement indisponible.');
      return;
    }

    if (elVille)       { elVille.textContent = ville; }
    if (elTemperature) { elTemperature.textContent = temperature + ' °C'; }

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

  /* --- Fonction principale ----------------------------------------------- */

  /**
   * Charge et affiche la météo d'une ville.
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

  /* --- API publique du fichier (utilisée par search.js d'Ilyes) ---------- */
  window.MeteoAffichage = {
    chargerMeteo: chargerMeteo,
    afficherErreur: afficherErreur
  };

  /* Premier affichage au chargement de la page : ville par défaut */
  document.addEventListener('DOMContentLoaded', function () {
    chargerMeteo('Tunis');
  });

})();
